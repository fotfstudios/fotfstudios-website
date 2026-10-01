# Spec — Espejo de la agenda en Google Calendar

**Fecha:** 2026-10-01 · **Ramas:** `feat/calendar-sync-queue` (PR1, migración) y `feat/calendar-sync` (PR2, código) · **Estado:** diseño aprobado

## Contexto

El dueño opera el estudio desde el teléfono. Hoy la única vista de la agenda es `/admin/agenda`;
los clientes reciben `.ics` en sus correos, pero el dueño no tiene nada en su propio Google
Calendar. Pide un **espejo unidireccional**: cada fila de `reservations` aparece en un calendario
de Google que él controla, se mueve al reagendar y desaparece al cancelar, reembolsar, expirar o
borrar. Google nunca se lee.

## Decisiones tomadas en la conversación

| Tema | Decisión |
|---|---|
| Dirección | Solo app → Google. Lo que se edite a mano en Google se pisa en el próximo cambio. |
| Autenticación | **Cuenta de servicio** de Google (llave JSON en env). El dueño comparte un calendario dedicado con el email de la cuenta de servicio ("Hacer cambios en eventos"). Sin OAuth ni botón "Conectar". |
| Alcance | Todas las `reservations`: `booking` confirmada → evento; `booking` en hold → evento *tentativo*; `curso` → evento; `block` → evento. `cancelled` / `expired` / borrada → se borra el evento. |
| Contenido | Título con nombre + horas + tipo; descripción con link a la ficha del admin, id de pedido y extras. **Nunca teléfono ni email.** |
| Notas | Solo en `block` y `curso`. Las notas de una `booking` son texto libre (pueden traer datos personales) y no salen a Google. |
| Mecanismo | Trigger en `reservations` → tabla de estado `calendar_sync` → pg_cron cada minuto → pg_net → `/api/cron/calendar-sync` → worker con reclamo, lease y backoff. Mismo patrón que `access-codes`. |

Verificado contra la documentación de Google: el `id` de un evento propio debe ser base32hex
(`a-v`, `0-9`) de 5 a 1024 caracteres, así que el hex de un UUID sin guiones sirve. Insertar de
nuevo el id de un evento borrado devuelve **409**; se restaura con `events.patch` y
`status: "confirmed"`.

## Por qué un trigger y no llamadas en cada punto de escritura

Hay al menos ocho caminos que cambian una reserva (checkout, webhook de MP, reconcile, reserva
manual, cortesía, reagendar en cuatro variantes, cancelar/reembolsar, curso, horas de práctica).
Dos de ellos **no pasan por TypeScript**: `expire_stale_holds` corre como SQL puro en pg_cron, y
`deleteBlock` / `release_reschedule_hold` hacen DELETE físico. `booking_events` tampoco sirve como
cursor: la expiración de holds y los bloqueos no registran evento. Un trigger los ve todos.

## Parte 1 — Modelo de datos (PR1, `20261001120000_calendar_sync.sql`)

### `calendar_sync` — una fila por reserva, estado de su evento en Google

- `reservation_id uuid` PK **sin FK**: el DELETE de un bloqueo tiene que llegar a Google aunque la
  reserva ya no exista.
- `pending`, `version`, `attempts`, `next_attempt_at`, `locked_at`, `last_error`,
  `google_event_id`, `last_fingerprint`, `last_synced_at`.
- `op` (`upsert` | `delete`) es solo una pista para el admin; el worker decide por la foto actual.
- RLS activo sin policies (solo `service_role`).

### Trigger `reservations_calendar_sync`

`AFTER INSERT OR DELETE OR UPDATE OF status, starts_at, ends_at, kind, customer_name, notes,
order_id`. Hace upsert de la fila: `pending = true`, `next_attempt_at = now()`, `attempts = 0`,
`version + 1`. **No toca `locked_at`.** Quedan fuera a propósito `reminder_sent_at`, `access_*`,
`expires_at`, `customer_email/phone/id`: el barrido de PIN y recordatorios (cada 5 min) nunca
encola.

### `version` — por qué existe

Sin ella se pierde una actualización: el worker reclama la fila, lee la foto, llama a Google, y
mientras tanto el admin reagenda. Si al terminar el worker marca `pending = false`, el cambio
nuevo nunca llega a Google. Con `version`, la escritura terminal pone
`pending = (version <> version_reclamada)`.

### RPCs (solo `service_role`)

- `calendar_sync_claim(limit, lease)`: `FOR UPDATE SKIP LOCKED` + lease de 5 min. El cron y el
  botón del admin nunca toman la misma fila. No es expresable vía PostgREST.
- `calendar_sync_snapshot(reservation)`: la foto que necesita el título (curso, extras, zona
  horaria). **No selecciona email ni teléfono**, así el mapper no puede filtrarlos.
- `calendar_sync_enqueue_all()`: re-encola todo lo vigente y limpia el fingerprint (si no,
  "Resincronizar todo" no haría PATCH). La migración la llama una vez como backfill.

### Cron y permiso

`calendar-sync` cada minuto vía `run_calendar_sync_cron()`, copia de `run_access_code_cron()` con
**los mismos secretos de Vault** (`site_url`, `cron_secret`). Permiso nuevo `calendar.manage`
("Sincronizar calendario"), sin asignar a ningún rol.

### Ventana de aprobación de la migración

PR1 es solo migración. Mientras no exista el código, el trigger llena la cola (bien: se acumula)
y pg_cron recibe 404 de una ruta que todavía no existe. Nada lee la tabla. PR2 se mergea recién
con la migración aplicada en prod.

## Parte 2 — Código (PR2)

- `src/domain/calendar/google-event.ts` (puro, junto a `ics.ts`): `googleEventId`,
  `decideOutcome`, `toGoogleEvent`, `canonicalJson`. Sin regla de "más viejo que X": lo pasado
  queda como historial.
- `src/application/ports/calendar.ts`: `CalendarSync`, `CalendarSyncError(retryable)`,
  `CalendarSyncRepository`.
- `src/infrastructure/calendar/google-calendar.ts`: JWT RS256 con `node:crypto` (sin dependencia
  nueva), token cacheado a nivel de módulo; PATCH → 404 → POST con id → 409 → PATCH; DELETE con
  404/410 como éxito.
- `src/application/calendar/calendar-sync-service.ts`: `sweep`, `syncNow`, `resyncAll`. Sin
  credenciales **no reclama** (la cola espera; nada queda marcado como sincronizado). Backoff
  1, 2, 4… 60 min. Presupuesto de 10 s por tick (pg_net corta a los 15 s).
- `app/api/cron/calendar-sync/route.ts`: copia de `access-codes`.
- `/admin/calendario` (grupo Configuración): estado de la conexión, email de la cuenta de servicio
  sin enmascarar (el dueño lo copia para compartir el calendario), cola y errores, botones
  "Sincronizar ahora" y "Resincronizar todo".

## Limitaciones aceptadas

- Renombrar un curso o una generación no toca `reservations`: lo arregla "Resincronizar todo".
- Los holds del checkout público aparecen como tentativos ~10 min y desaparecen al expirar.
- Cambiar `GOOGLE_CALENDAR_ID` deja huérfanos los eventos del calendario anterior.
- Un error no reintentable (calendario sin compartir, llave mala) se reintenta cada hora y queda
  visible en `/admin/calendario`.
