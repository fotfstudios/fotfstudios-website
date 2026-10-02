# Spec — Avisos por WhatsApp (Kapso)

**Fecha:** 2026-10-02 · **Ramas:** `docs/whatsapp-kapso-spec` (PR0) → `feat/whatsapp-db` (PR1) →
`feat/whatsapp-adapter` (PR2) → `feat/whatsapp-opt-in` (PR3) → `feat/whatsapp-fanout` (PR4) →
`feat/whatsapp-admin` (PR5) · **Estado:** diseño aprobado

## Contexto

Las notificaciones son **solo email**: un puerto `Mailer`, plantillas que devuelven
`{template, subject, html, text}` y una `notification_log` sin canal. WhatsApp existe solo como
links `wa.me` que alguien clickea a mano. La auditoría del 2026-09-14 (H2) tuvo que prohibir la
frase "acceso por WhatsApp" porque el PIN solo viajaba por correo.

Objetivo: mandar los avisos transaccionales clave **también** por WhatsApp (el correo sigue siendo
el registro) y avisarle al dueño por WhatsApp en vez de depender de la bandeja de `OWNER_EMAIL`.

## Decisiones tomadas en la conversación

| Tema | Decisión |
|---|---|
| Audiencia | Clientes **y** dueño |
| Proveedor | **Kapso** (partner oficial de Meta, chileno), modo **coexistencia**: el dueño sigue usando la app WhatsApp Business en +56 9 6280 3298 y las respuestas de los clientes llegan ahí como hoy |
| Alcance v1, cliente | Reserva confirmada · recordatorio de sesión · PIN de acceso · pago pendiente (reserva manual) · recordatorio de pago |
| Alcance v1, dueño | Nueva reserva pagada · pago pendiente creado · cancelación por reembolso externo (webhook MP) · nuevo lead (curso/guía) |
| Consentimiento | Casilla explícita, **marcada por defecto**, en /reservar y /cuenta/perfil; el staff la marca en reservas manuales y en la ficha del cliente |
| Destino del dueño | Una variable `OWNER_WHATSAPP` (como `OWNER_EMAIL`). Tiene que ser **otro número**: la línea del estudio no puede escribirse a sí misma |
| Fuera de v1 | Cancelación/reagendamiento al cliente por WhatsApp, clientes sin email, números no chilenos, mensajes de marketing |

## Datos de Kapso que sostienen el diseño (verificados el 2026-10-02 en docs.kapso.ai)

- **Envío:** `POST https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages`, header
  `X-API-Key`. El cuerpo es el mensaje de plantilla estándar de la Cloud API de Meta con
  parámetros **con nombre** (`{type:"text", parameter_name, text}`). Respuesta
  `{messages:[{id:"wamid…", message_status:"accepted"}]}`; error `{error:{message,type,code}}`.
- **Webhooks de estado:** `whatsapp.message.sent|delivered|read|failed`. Headers
  `X-Webhook-Event`, `X-Webhook-Signature` (HMAC-SHA256 en hex sobre el **body crudo**, con un
  secreto que elegimos nosotros) y `X-Idempotency-Key` (igual entre reintentos de una entrega; se
  deduplica con ella, **no** con `message.id`, que comparten sent/delivered/read/failed). Tres
  intentos (0 s, 10 s, 40 s); hay que responder 200 en menos de 10 s.
- **Plantillas:** aprobadas por Meta, categoría UTILITY, idioma `es`; revisión de hasta ~24 h.
  **El sandbox de Kapso no manda plantillas**: el primer envío real es en prod, al `OWNER_WHATSAPP`.
- **Límites:** plan gratis con 2.000 mensajes/mes y 100 requests/min (minuto fijo, `Retry-After`
  en 429); la coexistencia limita a 5 mensajes/s. Kapso traspasa el cobro de Meta sin recargo
  (≈ USD 0,023 por mensaje utility en Chile; desde el 2026-10-01 se cobra también dentro de la
  ventana de 24 h).
- **Coexistencia:** portafolio de Meta Business con razón social, dirección y sitio HTTPS; app
  WhatsApp Business ≥ 2.24.17 usada al menos 7 días; se empareja con QR; compartir el historial de
  chats es una decisión **irreversible** en ese paso. La verificación del negocio y la aprobación de
  plantillas pueden bloquear el envío aunque el número ya esté conectado.

## Arquitectura

```
notifyX() ──correo (sin cambios)──▶ Mailer
    │
    └─ encolar (un INSERT, dedupe_key) ──▶ whatsapp_outbox ◀── pg_cron 1 min ──▶ pg_net
                                                  │
              /api/cron/whatsapp-outbox ◀─────────┘  reclama (lease, SKIP LOCKED) → Kapso
                                                  │
              /api/webhooks/kapso ──HMAC + X-Idempotency-Key──▶ apply_status (entregado/falló)
```

**Cola, no envío directo.** Los puntos de disparo (webhook de MP, `/api/bookings`, acciones del
admin) son sensibles a la latencia y ya tratan el correo como best-effort; una segunda llamada
remota ahí duplica la superficie de falla. La cola da reintentos con backoff (el camino del correo
no tiene), respeta los 100 req/min y los 5 msg/s drenando en serie, y es la fila donde aterriza el
webhook de estado. El minuto extra de latencia no importa en ningún evento de v1 (el PIN sale
10–15 min antes). Se copia el patrón de `20261001120000_calendar_sync.sql`, sin `version` (los
mensajes no se fusionan) y con `expires_at` por fila: una cola atrasada nunca manda un PIN tarde.

**Solo se encola si WhatsApp está configurado.** Sin las variables de Kapso, `outbox` es `null` y
`notifyX` no escribe filas: un entorno sin Kapso no acumula mensajes que saldrían todos juntos el
día que se configure.

**El correo sigue mandando en v1.** Los barridos conservan el corte `skippedNoEmail`.

## Parte 1 — Modelo de datos (PR1, `20261003120000_whatsapp.sql`, solo expansión)

1. **Consentimiento en `customers`:** `whatsapp_opt_in boolean not null default false`,
   `whatsapp_opt_in_at`, `whatsapp_opt_in_source in ('customer','staff','account')`,
   `whatsapp_opt_out_at`. El default de la DB es `false` (el consentimiento es un acto registrado);
   la UI marca la casilla. RPC `set_whatsapp_opt_in(p_customer, p_opt_in, p_source)`.
2. **`create_checkout`** suma `p_whatsapp_opt_in boolean default null` (DROP + CREATE, como
   `20260707120000_order_terms_consent.sql`). Con `v_cust` ya resuelto en las dos ramas (sesión e
   invitado), si el parámetro no es null llama a `set_whatsapp_opt_in(v_cust, …, p_terms_source)`.
   `upsert_guest_customer` no cambia.
3. **`whatsapp_outbox`:** `dedupe_key unique` (`booking_confirmed:<orderId>`, …), `event`,
   `recipient` (`569XXXXXXXX`), `template_name`, `template_params jsonb`, `button_suffix`,
   `entity_kind/entity_id`, `status in (pending, sent, delivered, read, failed, expired)`,
   `attempts`, `next_attempt_at`, `locked_at` (lease de 5 min), `expires_at`, `provider_id`
   (wamid), `failed_code`, `last_error`. RLS sin policies (solo service_role).
   RPCs: `whatsapp_outbox_claim`, `_mark_sent`, `_mark_failed`, `_apply_status` (monótono
   sent < delivered < read; `failed` es terminal y nunca se reencola), `_stats`, `_retry_failed`.
4. **`whatsapp_webhook_inbox(idempotency_key pk)`** para deduplicar entregas.
5. **`notification_log.channel`** (`'email'` por defecto, o `'whatsapp'`) y
   `notification_log_record` recreada con `p_channel text default 'email'` (DROP + CREATE: PostgREST
   no desambigua sobrecargas). "Hoy" en /admin muestra también los fallos de WhatsApp.
6. **pg_cron** `whatsapp-outbox` cada minuto con los mismos secretos de Vault (`site_url`,
   `cron_secret`) que `access-codes` y `calendar-sync`. Sin la ruta (ventana entre PR1 y PR4), pg_net
   recibe 404 y no pasa nada.
7. **Permiso** `whatsapp.manage`, sin otorgar a ningún rol.

## Parte 2 — Puerto, adaptador y catálogo (PR2)

- `src/application/ports/whatsapp.ts`: `WhatsAppTemplate { name, language: "es", params, buttonSuffix? }`,
  `WhatsAppSender.sendTemplate(to, t) → { providerId }`, `WhatsAppSendError { code, retryable }`,
  `WhatsAppOutbox.enqueue(...)`.
- `src/infrastructure/whatsapp/kapso-sender.ts`: `fetch` directo (como Resend, MP y Google; sin SDK).
  429, 5xx y red → `retryable`; el resto de 4xx → terminal. `NoopWhatsAppSender` loguea
  `[whatsapp:noop]`. **Guarda de desarrollo:** fuera de `VERCEL_ENV=production` rechaza todo
  destinatario distinto de `OWNER_WHATSAPP`, así una corrida local con la llave de prod solo puede
  escribirle al dueño.
- `src/infrastructure/whatsapp/verify-signature.ts`: HMAC-SHA256 hex + `timingSafeEqual`.
- `src/application/whatsapp/logged-sender.ts`: `LoggedWhatsAppSender`, hermano de `LoggedMailer`
  (no una generalización: el correo y la plantilla no comparten forma).
- `src/application/whatsapp/templates.ts`: `WA_TEMPLATES` (evento → nombre en Meta + parámetros +
  botón) y `waTemplate()`. Un test de contrato compara los `{{parámetros}}` de
  `docs/whatsapp-templates.md` con el catálogo.
- `src/domain/contact/whatsapp-recipient.ts`: `waRecipient({ phone, whatsappOptIn })` devuelve
  `569XXXXXXXX` solo con consentimiento **y** celular chileno (`^569\d{8}$`, vía `normalizePhoneCl`).
  El dueño no pasa por el consentimiento.

## Parte 3 — Consentimiento en la UI (PR3)

- **/reservar** (`BookingWidget`): casilla bajo el teléfono, marcada por defecto, deshabilitada con
  pista si no hay teléfono. Texto: *"Avísame también por WhatsApp (confirmación, recordatorio,
  código de acceso y pagos). Lo puedes desactivar en tu cuenta."* `/api/bookings` exige
  `whatsappOptIn` booleano y lo pasa a `create_checkout` (fuente `customer`).
- **Reserva manual:** casilla junto a la atestación de T&C (fuente `staff`).
- **/cuenta/perfil:** interruptor "Avisos por WhatsApp" (fuente `account`).
- **/admin/clientes/[id]:** el mismo interruptor con fecha y origen del consentimiento (fuente `staff`).
- **Legal:** /privacidad reescribe la entrada de WhatsApp (hoy dice "Tú inicias el contacto"),
  suma Kapso como encargado y el consentimiento como base de licitud; /terminos suma una cláusula y
  sube `TERMS_VERSION`. El contrato de copy (`lib/notifications-copy-contract.test.ts`) sigue
  prohibiendo prometer el acceso *solo* por WhatsApp; el copy pasa a "te llega por email —y por
  WhatsApp si lo activaste— 10 minutos antes".

## Parte 4 — Disparo, cola y webhook (PR4)

`NotificationService` recibe `outbox: WhatsAppOutbox | null` y `config.ownerWhatsapp`, y encola
dentro de cada `notifyX`, **después** del correo, reutilizando el reclamo que ya existe:

| Método | Cliente (si `waRecipient` da número) | Dueño | `expires_at` |
|---|---|---|---|
| `notifyOrder` | `booking_confirmed` | `owner_new_booking` | inicio de la sesión |
| `notifyReminder` | `session_reminder` | — | inicio de la sesión |
| `notifyAccessCode` | `access_pin` | — | inicio + 30 min |
| `notifyBookingHeld` | `payment_pending` | `owner_payment_pending` | plazo de pago (`manualHoldDeadline`) |
| `notifyPaymentReminder` | `payment_reminder` | — | plazo de pago |
| `notifyCancellation` (solo desde el webhook de MP) | — | `owner_cancellation` | +24 h |
| `notifyCourseLead`, `notifyGuideLead` | — | `owner_new_lead` | +24 h |

`OrderEmailData` y los repositorios de recordatorios y PIN suman `phone` y `whatsappOptIn` desde
`customers`. El worker (`/api/cron/whatsapp-outbox`, copia de calendar-sync) reclama 25 filas,
manda en serie y aplica backoff (1, 2, 5, 15, 30, 60 min…); 8 intentos o un error no reintentable →
`failed`. El webhook `/api/webhooks/kapso` falla cerrado sin secreto o con firma inválida (acá la
firma **es** la verdad, a diferencia de MP), deduplica por `X-Idempotency-Key` y aplica el estado.
Los códigos 131026 (no tiene WhatsApp), 131047 (fuera de ventana), 131049/131050 (límites del
usuario) y 132xxx (plantilla no calza) quedan como `failed` visibles en el admin.
`scripts/kapso-replay-status.mjs` firma y reenvía un evento al dev server local.

## Parte 5 — Admin y despliegue (PR5)

`/admin/whatsapp` (`whatsapp.manage`), copia de `/admin/calendario`: tarjeta "Conexión"
(Configurado / Sin configurar, número del dueño enmascarado, link a Kapso, pasos de alta), tres
`Stat` de 24 h (enviados, entregados, fallidos), tabla de fallos y acciones "Procesar ahora",
"Reintentar fallidos" y **"Enviar prueba"** (plantilla `fotf_prueba` al `OWNER_WHATSAPP`).
DEPLOY.md suma la sección "WhatsApp (Kapso)" con los pasos del dueño.

## Variables de entorno

`KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `KAPSO_WEBHOOK_SECRET` (lo generamos con
`openssl rand -hex 32` y se pega en Kapso), `OWNER_WHATSAPP` (`569XXXXXXXX`). Grupo *Opcional* en
`lib/env.ts` y `.env.example`, como Google Calendar. Sin ellas: sender no-op, sin filas en la cola y
el admin dice "Sin configurar".

## Orden de los PRs y ventana de migración

0. Este spec + `docs/whatsapp-templates.md`. **El dueño da de alta Kapso y manda las plantillas a
   Meta ya**: la aprobación es el camino crítico.
1. Migración + tipos + permiso + itests. Se puede desplegar antes de que corra la migración de prod.
2. Puerto, adaptador, catálogo y tests unitarios. Sin cableado.
3. Consentimiento en la UI y legal. **No mergear hasta que la migración de PR1 esté aplicada en
   prod**: `create_checkout` con un argumento que la DB no conoce tumba el checkout (incidente del
   2026-09-15).
4. Cola, worker, webhook y cableado. Misma condición.
5. Admin, DEPLOY.md y CLAUDE.md.

## Verificación

- Unitarios (`npm test`) y de integración contra Supabase local (`npm run test:integration`, luego
  `npm run db:reset`).
- E2E local sin Kapso: reserva con la casilla marcada → `customers.whatsapp_opt_in = true`; pago en
  sandbox de MP → correo en Mailpit **y** fila en `whatsapp_outbox`; el cron responde
  `configured: false` sin tocar filas. Webhook: `KAPSO_WEBHOOK_SECRET` local +
  `node scripts/kapso-replay-status.mjs` → la fila pasa a `delivered`; repetir con la misma llave no
  hace nada.
- Prod, solo con plantillas APROBADAS: variables en Vercel → Redeploy → "Enviar prueba" → una
  reserva real del dueño con su propio número → `delivered` en el admin en menos de un minuto.

## Riesgos

- **Verificación de Meta y rechazo de plantillas:** pueden tomar días. Plantillas estrictamente
  UTILITY, sin lenguaje promocional.
- **Coexistencia:** compartir historial es irreversible; tope de 5 msg/s; algunas funciones de la
  app (listas de difusión) pueden quedar limitadas.
- **Calidad del número:** con la casilla marcada por defecto sube el riesgo de bloqueos y reportes,
  que bajan la calificación del número y pueden pausar envíos. Se mitiga con baja fácil en /cuenta y
  cero marketing. La Ley 21.719 privilegia el consentimiento afirmativo; la casilla pre-marcada es
  defendible para avisos de servicio de una reserva recién hecha, no para nada promocional.
- **Costo:** ≈ USD 0,023 por mensaje al cliente; el plan gratis de Kapso cubre el volumen actual.
