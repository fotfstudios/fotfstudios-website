# Auditoría de notificaciones transaccionales

**Fecha:** 2026-09-14 (America/Santiago). **Alcance:** todo correo que la plataforma manda
sola — reservas (confirmación, link de pago, cancelación, reagendamiento, PIN de acceso),
curso (solicitud, link, cupo confirmado, anulación), postulaciones `/unete`, alertas al dueño,
y las plantillas de Supabase Auth (código de inicio de sesión, recuperación, cambio de correo).
**Método:** lectura de código en `main` (limpio), sin ejecutar envíos; DNS público consultado
para entregabilidad; contraste calculado sobre los hex de las plantillas. No se tocó prod ni la
DB remota.

Rúbrica: `/audit` de impeccable (5 dimensiones, 0–4 c/u). Para correos, "Performance" se lee
como **fiabilidad y entrega** (idempotencia, fallos, observabilidad, DNS) y "Theming" como
**marca + comportamiento en modo oscuro de los clientes de correo**. Las dimensiones que la
rúbrica no cubre —**cobertura** (qué eventos avisan a quién) y **corrección del contenido**—
van como sección aparte y sin nota, pero ahí viven los hallazgos que más importan.

## Inventario

| Evento | Disparador | Para | Plantilla | Idempotencia / respaldo |
|---|---|---|---|---|
| Reserva pagada (MP, puntos, offline) | webhook MP · `/api/orders/[id]/status` · `/api/bookings` (100 % puntos) · admin nueva/offline | cliente + dueño | `customerConfirmation` · `ownerNotification` | `notified_at` (check-then-act) · cron diario 13:00 UTC |
| Pago aprobado sin hold (`paid_no_hold`) | webhook · reconcile · offline | **solo dueño** | `ownerNeedsReview` | `confirm_payment` marca `notified_at` → el cliente nunca recibe nada |
| Cortesía creada | admin nueva | cliente | `customerCourtesyConfirmation` | un disparo, sin respaldo |
| Link de pago (reserva pendiente, 72 h) | admin ficha | cliente | `bookingPaymentPending` | un disparo, no marca `notified_at` (correcto) |
| Cancelación / reembolso | admin ficha (`status === 'paid'`) · webhook (reembolso externo) | cliente | `customerCancellation` | inbox del webhook dedupea el loopback |
| Reagendamiento aplicado / falló | admin ficha · webhook (cobro diferido) | cliente | `customerReschedule` · `customerRescheduleFailed` | un disparo |
| PIN de la cerradura | pg_cron cada 5 min, ventana 15 min, solo si `access_loaded_at` | cliente | `customerAccessCode` | **reclama `access_sent_at` antes de mandar**, suelta si falla |
| Solicitud curso / postulación DJ | `POST /api/curso/solicitudes` · `POST /api/applications` | dueño **primero**, luego alumno/postulante | `ownerNewCourseLead`+`courseLeadConfirmation` · `ownerNewApplication`+`applicantConfirmation` | rate limit por IP en DB + honeypot |
| Link de pago curso · cupo pagado · anulación | admin curso · webhook (`course_paid`) | alumno(s) (+ dueño al pagar) | `courseEnrollmentPending` · `courseEnrollmentPaid`/`ownerCoursePaid` · `courseEnrollmentCancelled` | un disparo; el cron ignora `kind='course'` |
| Código de inicio de sesión / recuperación / cambio de correo | Supabase Auth | cliente/admin | `supabase/templates/*.html` (config.toml solo local; **prod se espeja a mano en el Dashboard**) | Supabase |

**Sin notificación hoy:** cancelación de cortesía (decidido en #97), hold manual vencido tras
el link de 72 h, cliente que pagó sin hold (`paid_no_hold`), recordatorio previo a la sesión,
puntos ganados/vencidos, cambio de titular (`assignCustomerAction`).

## Puntaje

| # | Dimensión | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Accesibilidad | 2 | `#6f6c64` (3.78:1) en texto de 12–13 px: "IVA incluido", T&C de cortesía, pie de las plantillas de Auth (H3) |
| 2 | Fiabilidad y entrega | 2 | Fallo parcial en `notifyOrder` ⇒ confirmaciones duplicadas al cliente cada día (H4); nada observa los fallos (H5); backfill sin cota (H4) |
| 3 | Responsive | 3 | Una columna fluida, 520 px; CTA ≈ 40 px de alto y links de T&C a 12 px (H15) |
| 4 | Marca / modo oscuro | 2 | Hex sueltos sin tokens compartidos; sin `<html lang>`, `<meta color-scheme>` ni envoltorio en tabla → Outlook/Gmail dark mode pueden invertir o encuadrar en blanco (H11) |
| 5 | Anti-patrones | 3 | Limpio: sin imágenes, un CTA, Sirena solo en la alerta real. `border-left:2px` en las citas de los avisos al dueño (H16) |
| **Total** | | **12/20** | **Aceptable — trabajo significativo** |

### Veredicto anti-patrones

**Pasa.** No parece hecho por IA: fondo Ink real, wordmark en mono tracked, Gold como color
de todos los días, Sirena una sola vez y con motivo (`ownerNeedsReview`), un botón por correo,
cero imágenes ni píxeles, copy en chileno directo ("Llegas, conectas tu música y a darle").
Señales menores: Arial como única tipografía (pragmático en email) y dos `border-left` de 2 px
en bloques de cita.

## Resumen ejecutivo

- Puntaje **12/20** en render; pero los hallazgos graves están en **contenido y cobertura**.
- **13 hallazgos**: 0 P0 confirmados (1 condicional, ver H0) · **5 P1** · **6 P2** · 6 P3
  (agrupados).
- Lo crítico:
  1. **H1** — a un alumno que **pagó** y se le anula/reembolsa la inscripción le llega
     "No se hizo ningún cobro" (plantilla de inscripción impaga).
  2. **H2** — todos los correos y `/reserva/estado` prometen "acceso **por WhatsApp**", pero el
     sistema manda el PIN **por email 10–15 min antes**. El cliente espera el canal equivocado
     justo cuando más importa. Y el aviso al dueño le pide "enviar el código" cuando su tarea
     real es cargarlo en la Yale.
  3. **H4** — `notifyOrder` manda al cliente, luego al dueño, luego marca `notified_at`. Si el
     segundo envío o el `update` fallan, el cron diario **re-manda la confirmación al cliente
     todos los días**. El backfill además no tiene cota temporal (incidente 2026-07-10).
  4. **H5** — no hay ninguna señal de fallo fuera de `console.error`; el incidente de la API
     key inválida pasó días sin que nadie lo viera.
  5. **H3** — contraste 3.78:1 en texto pequeño con información legal/seguridad.
- Siguiente paso sugerido: una cadena corta de PRs (abajo, "Acciones") en el orden H1 → H2 →
  H4/H5 → H3, cada uno con su test en `templates.test.ts` / `notification-service.test.ts`.

## Hallazgos

### H0 — ¿Se manda el PIN en prod? (P0 si no; requiere al dueño)

Según la nota del 2026-09-11, el job `access-codes` de pg_cron quedó activo en prod pero
**corre como no-op hasta que existan los dos secretos del Vault** (`site_url`, `cron_secret`).
Si siguen sin crearse, **ningún cliente recibe su código** y nada en la app lo dice (el
barrido devuelve `sent: 0` y el dashboard muestra "PIN cargado" igual). Verificar en prod:
`select run_access_code_cron(); select * from net._http_response order by created desc limit 1;`
y `select count(*) from reservations where access_loaded_at is not null and access_sent_at is null and starts_at < now()`.
Si hay filas ahí, hubo sesiones con PIN cargado que nunca se mandó.

### H1 — Reembolso de curso: al alumno que pagó le llega "No se hizo ningún cobro" (P1)

`refundEnrollmentAction` (inscripción **pagada**, con o sin reembolso) reutiliza
`notifyCourseCancelled` → `courseEnrollmentCancelled`
([curso/actions.ts:447-453](../../app/admin/(panel)/curso/actions.ts#L447-L453),
[templates.ts:388-400](../../src/application/notifications/templates.ts#L388-L400)), cuyo copy es
"liberamos tu cupo … **No se hizo ningún cobro**". Para un reembolso total es falso; para
`mode=none` (pagó y no se devuelve nada) es peor: el alumno lee que nunca le cobraron.
Tampoco dice cuánto se devolvió ni que puede tardar unos días en la tarjeta, cosa que
`customerCancellation` sí hace para reservas.

**Impacto:** disputa asegurada con el alumno y con MP; contradice `/terminos`.
**Recomendación:** plantilla `courseEnrollmentRefunded({ name, generation, refunded: string | null })`
espejo de `customerCancellation` (con monto / sin monto), y que `refundEnrollmentAction` la use;
`cancelEnrollmentAction` (impaga) sigue con la actual. Test en `templates.test.ts`: con monto
menciona la cifra y "medio de pago original"; sin monto NO dice "ningún cobro".
**Comando:** `/clarify`.

### H2 — El canal de acceso prometido no es el real (P1)

- `customerConfirmation` y `customerCourtesyConfirmation`: "Coordinaremos tu acceso por
  WhatsApp antes de tu sesión" ([templates.ts:50](../../src/application/notifications/templates.ts#L50),
  [:78](../../src/application/notifications/templates.ts#L78)).
- `/reserva/estado`, paso 02: lo mismo ([EstadoClient.tsx:191](../../components/booking/EstadoClient.tsx#L191)).
- Plantillas de Auth: "esa la coordinamos por WhatsApp antes de tu sesión"
  ([login-code.html:9](../../supabase/templates/login-code.html#L9), `recovery.html`).
- `ownerNotification`: "Recuerda **enviar** el código de acceso"
  ([templates.ts:412](../../src/application/notifications/templates.ts#L412)).

La realidad desde #137: la app genera el PIN, el dueño lo **carga** en la Yale, y el cron lo
manda **por email entre 10 y 15 min antes** ([access-code-service.ts:9](../../src/application/access/access-code-service.ts#L9)).
WhatsApp queda solo para reservas sin email ([cerradura/page.tsx:107](../../app/admin/(panel)/cerradura/page.tsx#L107)).

**Impacto:** el cliente espera un WhatsApp, no mira el correo (menos aún spam) y el PIN llega
cuando ya está en la puerta. Es exactamente el fallo que "acceso autogestionado" no puede
tener. Al dueño se le pide una tarea que ya no existe y no se le nombra la que sí (cargar).
**Recomendación:** una sola frase en todas las superficies: "Tu código de acceso te llega **por
email 10 minutos antes** de tu sesión (revisa spam). Si no lo ves, escríbenos por WhatsApp."
Dueño: "Recuerda **cargar el PIN en la cerradura** ([/admin/cerradura]) y emitir la boleta". Pinear
con un test que busque "por email" en la confirmación y "cargar" en el aviso al dueño; espejar el
cambio de las plantillas Auth en el Dashboard (ver H10).
**Comando:** `/clarify`.

### H3 — Contraste 3.78:1 en texto de 12–13 px (P1, WCAG 1.4.3)

`#6f6c64` sobre `#0a0a0a` = **3.78:1** (mínimo AA para texto pequeño: 4.5:1). Aparece en:
"IVA incluido" 12 px ([templates.ts:49](../../src/application/notifications/templates.ts#L49)),
la línea de T&C + sus dos links en cortesía 12 px ([:80](../../src/application/notifications/templates.ts#L80)),
y el pie de seguridad de las tres plantillas de Auth a 13 px ("no es la clave de la sala";
[login-code.html:8](../../supabase/templates/login-code.html#L8), `recovery.html`, `email-change.html`).
Es el mismo `bone-mute` que `lib/admin-a11y-contract.test.ts` ya prohíbe en superficies de
herramienta; `bone-quiet` `#8c8880` da 5.61:1.

**Impacto:** el aviso legal y la nota de seguridad son justo lo que menos se lee.
**Recomendación:** `#8c8880` en esos cuatro sitios; links de T&C en `#e8c94a` como en
`bookingPaymentPending`. Sumar un test de contraste a `templates.test.ts` (grep de `#6f6c64`
= 0). **Comando:** `/harden`.

### H4 — Fallo parcial en `notifyOrder` ⇒ confirmaciones repetidas; backfill sin cota (P1)

`notifyOrder` ([notification-service.ts:72-83](../../src/application/notifications/notification-service.ts#L72-L83)):
manda al cliente → manda al dueño → `markNotified`. Si el envío al dueño lanza (Resend limita a
**2 req/s** por defecto y los dos `send` van pegados; un dúo de curso son tres) o si el `update`
falla, `notified_at` queda `null` y `/api/cron/notifications` vuelve a mandar **la confirmación
al cliente cada día a las 13:00 UTC** hasta que alguien lo note. El check-then-act tampoco
protege de dos corridas simultáneas (cron + webhook en el mismo segundo), a diferencia de
`AccessCodeService`, que reclama antes de mandar.

`pendingPaidOrderIds` ([notification-repository.ts:42-50](../../src/infrastructure/db/notification-repository.ts#L42-L50))
no tiene cota temporal: tras una caída (2026-07-10) el backfill manda confirmaciones de
sesiones ya pasadas.

**Recomendación:** (1) reclamar primero — `update orders set notified_at = now() where id = $1
and notified_at is null returning id`; si no devuelve fila, salir; (2) envío al dueño
independiente y best-effort (su fallo no debe afectar al cliente ni al claim); (3) cota:
solo órdenes con `paid_at > now() - interval '7 days'` **y** reserva futura; el resto se
marca en silencio. Test unitario: "si el envío al dueño falla, la orden queda marcada y el
cliente no recibe dos". **Comando:** `/harden`.

### H5 — Los fallos de envío no se ven (P1)

Todo `notify*` termina en `.catch((e) => console.error(...))`. Con la key de Resend inválida
(2026-07-10) **todos** los correos fallaron durante días sin señal: el cron diario devolvía
`{ notified: 0 }` como si nada. No hay conteo, evento, ni superficie en el admin.

**Recomendación (barata):** registrar el resultado donde ya hay bitácora — `log_booking_event`
`email_sent` / `email_failed` (con plantilla y mensaje) para reservas; para el resto, una tabla
`notification_log(id, template, to_hash, ok, error, created_at)`. En `/admin` "Hoy": "3 correos
fallaron en 24 h" en Sirena (urgencia real). El cron de notificaciones devuelve
`{ notified, failed }` y falla con 503 si `failed > 0` (Vercel muestra crons fallidos).
Opcional: webhook de Resend `email.bounced`/`email.complained` → mismo log.
**Comando:** `/harden`.

### H6 — Estados en silencio para el cliente (P2)

1. **`paid_no_hold`**: el cliente **pagó** y no recibe nada (a propósito se suprime la
   confirmación; solo el dueño recibe `ownerNeedsReview`). Desde su lado: plata fuera, cero
   correo, y `/reserva/estado` sin reserva. Merece un "Recibimos tu pago; tu horario ya no
   estaba disponible, te escribimos por WhatsApp en breve" — sin prometer la sala.
2. **Hold manual vencido**: recibió "Tu hora está tomada — falta el pago" con link de 72 h;
   cuando `expireAbandonedManualHolds` libera el cupo no hay aviso ([composition.ts:153](../../src/composition.ts#L153)).
   El cliente puede pagar por otro lado o presentarse.
3. **Cancelación de cortesía**: sin correo (decidido en #97; `cancelBookingAction` gatea en
   `status === 'paid'`, [actions.ts:55](../../app/admin/(panel)/reservas/[id]/actions.ts#L55)).
   Si el dueño quiere cerrar el ciclo de cortesía, es un `notifyCourtesyCancelled` con datos en
   mano, mismo patrón que `notifyCourtesy`.

**Comando:** `/clarify` (copy) + `/harden` (disparadores).

### H7 — Dos formatos de fecha para el mismo correo de curso (P2)

`courseEnrollmentPaid` recibe las sesiones como "lun 14 sep · 14:30" cuando paga el admin
(`fmtDateTime`, [curso/actions.ts:261](../../app/admin/(panel)/curso/actions.ts#L261)) y como
"lunes 14 de septiembre, 14:30 h" cuando paga por MP
([webhooks/mercadopago/route.ts:156-157](../../app/api/webhooks/mercadopago/route.ts#L156-L157)).
Además el formato `cccc d 'de' LLLL, HH:mm 'h'` está copiado **ocho veces** en
`notification-service.ts` (63, 99, 130, 158, 184, 205, 227, 347) + la ruta del webhook.
Ningún correo lleva el **año** (una reserva manual puede ser para dentro de meses) ni la hora
de término (`endsAt` se lee y no se usa).

**Recomendación:** `formatSessionWhen(iso, tz, endIso?)` en el servicio, único punto; que
`notifyCoursePaid` reciba ISO y formatee él; sumar año cuando la sesión no es del año en
curso y el rango "14:30–16:30 h". **Comando:** `/distill`.

### H8 — Ningún correo lleva al cliente a `/cuenta` (P2)

`.impeccable.md` describe al cliente llegando a `/cuenta` "desde un WhatsApp o un email de
confirmación". Ningún correo enlaza a `/cuenta` (ni a `/reserva/estado`), y el de
confirmación tampoco ofrece calendario (`/reserva/estado` sí: `CalendarButtons.tsx`, `.ics`).
`SITE_URL` ya está en `NotificationConfig` (`termsUrl`), así que es solo un link.

**Recomendación:** botón secundario "Ver mi reserva" → `${SITE_URL}/cuenta` (el login por
código ya es el mismo gesto) y "Agregar al calendario" reutilizando `lib/confirmation.ts`.
**Comando:** `/delight`.

### H9 — Sin recordatorio previo a la sesión (P2)

El único correo entre la confirmación y la sesión es el PIN, 10 min antes. Con reservas
manuales a semanas, un recordatorio 24 h antes (fecha, dirección, "tu PIN llega por email 10
min antes", WhatsApp) reduce no-shows y refuerza H2. Cabe en el mismo barrido de pg_cron:
`reminder_sent_at` con el patrón reclamar-antes-de-mandar de `AccessCodeService`.
**Comando:** `/delight`.

### H10 — Plantillas de Auth espejadas a mano en el Dashboard (P2)

`config.toml` aplica solo en local; en staging/prod las cuatro plantillas viven en el
Dashboard y se copian a mano (comentario en [config.toml:263-267](../../supabase/config.toml#L263-L267)).
La caída del 2026-09-13 (#151, 6 vs 8 dígitos) fue exactamente esta deriva. H2 y H3 exigen
volver a tocarlas.

**Recomendación:** mover el envío de Auth al **Send Email Auth Hook** de Supabase → un route
handler que use `ResendMailer` con plantillas en `templates.ts`, testeadas y versionadas con el
resto; el Dashboard deja de tener copy. Mientras tanto: `docs/` con el checklist de espejo y
un smoke manual tras cada cambio. Verificar también que el remitente SMTP de Auth en prod sea
`reservas@fotfstudios.cl` vía Resend (alineación DKIM/DMARC).
**Comando:** `/harden`.

### H11 — Robustez en clientes de correo y modo oscuro (P2)

Las plantillas son `<div>` sueltos sin `<html lang="es">`, `<head>`, `<title>`, ni
`<meta name="color-scheme" content="dark">` ([templates.ts:30-36](../../src/application/notifications/templates.ts#L30-L36)).
Consecuencias: Outlook de escritorio ignora `max-width` en `div` y no pinta el fondo Ink de
borde a borde (tarjeta negra sobre marco blanco); Outlook/Gmail con dark mode pueden invertir
parcialmente un correo ya oscuro (botón Gold con texto Ink → riesgo de ilegible). Sin
preheader, Gmail muestra "FOTF STUDIOS ¡Reserva confirmada! Hola…" como snippet, sin la
fecha. Los hex (`#b9b5ab`, `#6f6c64`, `#1e1d1a`) están sueltos, no vienen de un módulo
compartido con `globals.css` (los tokens de marca existen dos veces).

**Recomendación:** `shell()` con documento completo, tabla contenedora `role="presentation"`
con `bgcolor="#0a0a0a"` en `<body>` y en la celda, `color-scheme: dark` + `supported-color-schemes`,
preheader oculto con la fecha, y un `lib/brand-tokens.ts` que exporte los hex para email y
para `globals.css` (`@theme` puede leerlos vía CSS vars generadas en build) — o al menos un
test que compare los hex de `templates.ts` contra `globals.css`. Probar en Litmus/Email on
Acid una vez (Gmail iOS/Android, Outlook 365, Apple Mail dark).
**Comando:** `/adapt` + `/colorize`.

### H12 — Entregabilidad: DMARC en `p=none`; Reply-To sin definir (P2)

Verificado por DNS público: DKIM `resend._domainkey.fotfstudios.cl` ✓, `send.fotfstudios.cl`
con SPF `include:amazonses.com` + MX de feedback ✓, MX del apex a Google Workspace ✓ (las
respuestas a `reservas@` caen en un buzón real **si el alias existe** — no verificable desde
código). `_dmarc` = `v=DMARC1; p=none` (solo monitoreo, reportes a Cloudflare).
`ResendMailer.send` no manda `replyTo`, `tags` ni `Idempotency-Key`
([resend-mailer.ts:15-24](../../src/infrastructure/email/resend-mailer.ts#L15-L24)).

**Recomendación:** tras 2–4 semanas de reportes limpios, `p=quarantine; pct=100`; `replyTo`
al buzón que el dueño realmente lee; `tags: [{ name: "template", value }]` para ver en Resend
qué plantilla rebota. **Comando:** `/harden`.

### H13 — Higiene menor (P3, agrupados)

- **Targets táctiles:** CTA `padding:12px 20px` ≈ 40 px de alto (< 44); links de T&C a 12 px
  en línea. Subir a `padding:14px 22px` y los links a 13–14 px. `/adapt`.
- **`border-left:2px`** en las citas de `ownerNewApplication` ([:216](../../src/application/notifications/templates.ts#L216))
  y `ownerNewCourseLead` ([:263](../../src/application/notifications/templates.ts#L263)):
  reemplazar por fondo `#121212` con padding. `/polish`.
- **Caracteres de control en nombres** de formularios públicos: llegan al `subject` sin
  filtrar (`str()` solo hace `trim`). Resend los codifica, no es inyección, pero `badField`
  del admin ya tiene el filtro correcto — reutilizarlo en `parseApplication`/`parseCourseLead`.
- **"Hola:"** cuando no hay nombre en `bookingPaymentPending` ([:356](../../src/application/notifications/templates.ts#L356)):
  usar el mismo `${v.name ? \`Hola ${name}, \` : ""}` que las otras plantillas.
- **`notifyOrder` solo desvía `kind === 'course'`**: una orden `reschedule_delta` que quede en
  `paid` (reembolso de MP falla tras `slot_taken`) entraría al cron con fecha "—". Gatear por
  `kind in ('booking','trial')`.
- **Reagendamiento** no dice el horario anterior; **cancelación** no dice si fue por el
  cliente o por la sala. Una línea cada uno.
- **`text` vacío** en `ResendMailer` cuando falta (`msg.text ?? ""`): hoy todas las plantillas
  lo traen; que el tipo lo exija (`text: string`).

## Patrones sistémicos

1. **Copy con dueño disperso.** La promesa de acceso vive en 6 archivos (2 plantillas, Estado,
   3 plantillas Auth) y ya divergió de la operación real. Falta un único origen de las frases
   que se repiten (acceso, T&C, WhatsApp), como `lib/site.ts` lo es para datos.
2. **Idempotencia de dos calidades.** El PIN reclama antes de mandar; la confirmación
   (`notified_at`) hace check-then-act y marca al final. El patrón bueno ya existe en el repo:
   aplicarlo a `notifyOrder`.
3. **Best-effort sin memoria.** Once puntos de `.catch(console.error)` y ningún registro.
   "Best-effort" está bien para no voltear la acción; no está bien para no enterarse.
4. **Formato de fecha copiado.** Ocho copias del mismo `toFormat` + una variante distinta
   en admin de curso.
5. **Tokens de marca duplicados.** Los hex viven en `globals.css` y otra vez en
   `templates.ts`/`supabase/templates`; ya divergen en uso (`bone-mute` prohibido en la app,
   usado en email).

## Lo que está bien (mantener)

- **Arquitectura limpia:** plantillas puras y testeadas (XSS, casos sin nombre, sin dinero en
  cortesía), servicio detrás de puertos, Resend aislado en un adaptador, `NoopMailer` local,
  `src/application` sin importar `@/lib` (URLs inyectadas por config).
- **Idempotencia donde más duele:** inbox del webhook por `refund:{id}` y `{payment}:{status}`;
  el loopback de un reembolso admin no duplica NC ni correo; `AccessCodeService` reclama y
  suelta.
- **Orden correcto en formularios públicos:** el dueño primero (su triage no depende de un
  email de usuario que puede rebotar); rate limit por IP en DB + honeypot.
- **Ramas de dominio bien pensadas:** `kind='course'` no recibe la plantilla de reserva;
  `notifyBookingPaymentLink` no marca `notified_at`; orden 100 % puntos habla de puntos
  repuestos, nunca de tarjeta; la dirección del curso viaja solo al confirmar (promesa de la
  FAQ).
- **Voz y marca:** chileno directo, un CTA, Sirena solo en `ownerNeedsReview`, sin imágenes
  ni tracking, `text/plain` en todos.
- **DNS de envío bien configurado** (DKIM + SPF del subdominio + MX de feedback).

## No verificado (requiere al dueño)

1. **H0:** secretos del Vault en prod (`site_url`, `cron_secret`) y `net._http_response` con 200.
2. Que `reservas@fotfstudios.cl` exista como buzón/alias en Google Workspace y alguien lo lea.
3. Remitente SMTP de Supabase Auth en prod (¿Resend con `reservas@`? ¿o el SMTP por defecto de
   Supabase, con límite de envíos por hora?).
4. Que las plantillas de Auth del Dashboard de prod coincidan con `supabase/templates/*` hoy.
5. Render real en Gmail iOS/Android y Outlook 365 con dark mode (H11).

## Acciones recomendadas (en orden)

1. **[P0/P1] Verificar H0** en prod (5 min, SQL arriba). Si no hay secretos, crearlos antes que
   cualquier PR.
2. **[P1] `/clarify` — `fix(email): reembolso de curso con su propia plantilla`** (H1) +
   **una sola promesa de acceso** en plantillas, Estado y Auth (H2). Tests: "por email" en la
   confirmación, "cargar" en el aviso al dueño, "No se hizo ningún cobro" ausente en reembolso.
3. **[P1] `/harden` — `fix(notificaciones): claim-first en notifyOrder + backfill acotado`**
   (H4) y **bitácora de envíos + contador en /admin "Hoy" + cron que falla si hubo fallos**
   (H5).
4. **[P1] `/harden` — contraste `#6f6c64` → `#8c8880`** en email y Auth (H3), test que lo pinee.
5. **[P2] `/distill` — `formatSessionWhen` único** con año y rango (H7).
6. **[P2] `/delight` — "Ver mi reserva" + calendario** en la confirmación (H8) y recordatorio
   24 h (H9, reusa el cron de acceso).
7. **[P2] `/harden` — Send Email Auth Hook** para sacar las plantillas del Dashboard (H10);
   correos silenciosos de H6 (paid_no_hold, hold vencido; cortesía cancelada si el dueño quiere).
8. **[P2] `/adapt` + `/colorize` — shell de email robusto** (documento completo, tabla,
   color-scheme, preheader, tokens compartidos) (H11); DMARC a quarantine + replyTo + tags (H12).
9. **[P3] `/polish`** — H13.

Re-correr `/audit` sobre `templates.ts` tras 2–4 para ver subir el puntaje; el objetivo
realista es 16–17/20 (el resto lo limita el propio medio: Arial, hex en línea).
