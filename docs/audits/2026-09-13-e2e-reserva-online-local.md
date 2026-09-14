# Auditoría E2E del flujo de reserva en línea (stack local)

**Fecha:** 2026-09-13, 20:49–21:12 (America/Santiago). **Estado:** solo hallazgos; ningún
cambio de código. Stack: Docker + Supabase CLI 2.109 (47/47 migraciones, seed intacto) +
`next dev` 15.5.19 + túnel ngrok estático (`secluding-backpedal-authentic.ngrok-free.dev`)
+ credenciales de prueba de MP (vendedor `3497260371`).

## Resumen

El camino feliz funciona de punta a punta hasta Checkout Pro y de vuelta: disponibilidad,
cotización, gates (email + T&C), `POST /api/bookings` (orden + hold + líneas + canje de
puntos en una transacción), preference correcta en MP (`back_urls` https, `auto_return`,
vencimiento alineado al hold, `binary_mode`, sin `notification_url`), Wallet Brick en
desktop y móvil, retorno "Volver a la tienda" → `/reserva/estado` con reanudación, polling
con reconcile bajo demanda, y la pantalla de confirmación (recibo, WhatsApp, .ics, Google
Calendar). Los respaldos (webhook sin firma, cron sin secreto, ids inválidos) fallan cerrado.

Lo que NO cerró es el **ciclo de vida del hold vencido**: la expiración es perezosa (solo
la ejecutan `create_checkout`/`create_hold`) y **ninguna lectura** mira `expires_at`. Un
checkout abandonado bloquea su horario para todo el mundo hasta que *otra persona* haga
un checkout en la sala, y la página de estado sigue ofreciendo "Completar el pago" hacia
una preference que MP ya rechaza. Se reprodujo dos veces en vivo (una con la orden que
quedó del intento de las 20:12, otra controlada).

No se ejercitó el pago real aprobado (requiere iniciar sesión en MP como el Buyer Test User);
la confirmación se validó en la costura de la DB (`confirm_payment`, la misma RPC que llaman
el webhook y el reconcile).

## Hallazgos

### H1 — Un hold vencido bloquea el horario hasta que otro cliente haga checkout (alto)

`SupabaseSchedulingRepository.getReservationsForDate` selecciona `status in ('held',
'confirmed')` y no filtra por `expires_at`
([scheduling-repository.ts:38-49](../../src/infrastructure/db/scheduling-repository.ts#L38-L49));
`getMonthAvailability` usa la misma lectura. `expire_stale_holds` solo corre dentro de
`create_checkout` y `create_hold` (verificado en `pg_proc`): no hay job de pg_cron (solo
`run_access_code_cron`), y `/api/cron/reconcile` reconcilia órdenes pero no barre holds.

Evidencia: el hold `1f20c8dd` (orden `157f4d73`, 14/09 16:00–18:00) venció a las 20:22:50
y siguió `held` bloqueando 16:00–18:00 en `/api/availability` hasta las 20:58:46, cuando
**mi** checkout de 10:00 lo barrió (36 min). Repro controlada: hold `d793c89c` vencido
21:08:46 → a las 21:09:07 seguía `held`, 10:00–12:00 seguía `booked`, y recién un
`POST /api/bookings` de otro invitado para ese mismo slot devolvió 200 y lo pasó a
`expired`.

Con una sola sala y poco tráfico esto es inventario perdido: quien quiere justo ese horario
nunca lo ve libre, así que nunca dispara el checkout que lo liberaría (círculo).

Opciones (no excluyentes): (a) filtrar en la lectura `expires_at is null or expires_at >
now()` (barato, corrige disponibilidad al instante); (b) barrido periódico
(`expire_stale_holds()` desde pg_cron cada 5 min como el de PINs, o desde el cron de
reconcile); (c) `perform expire_stale_holds(p_resource)` en una RPC de disponibilidad.
Pendiente decidir: ¿la verdad del estado es la columna (b) o el tiempo (a)? Hoy hay
consumidores del `status` crudo (admin, estado, eventos).

### H2 — `/reserva/estado` ofrece "Completar el pago" sobre un hold muerto (medio)

`getOrderConfirmation` devuelve `reservationStatus` desde la columna
([order-repository.ts:27-32](../../src/infrastructure/db/order-repository.ts#L27-L32)), así
que con H1 la página renderiza `PendingPayment` + `resumeUrl` en vez de `ExpiredHold`. MP
responde "Lo que querías pagar ya no se encuentra disponible (hasta 20:22 hs)" y su
"Volver a la tienda" vuelve a la misma página → bucle. Además `EstadoClient` solo sondea el
estado de la **orden**: la pestaña abierta durante toda la sesión seguía en "COMPLETA TU
PAGO" tras 194 polls, aun después de que la DB ya decía `expired`.

Arreglo mínimo: derivar `expired` en el read model (`held` && `expires_at < now()`), y que
`/api/orders/[id]/status` (o el cliente) sepa cuándo dejar de esperar.

### H3 — El canje de puntos abandonado queda retenido ~3–4 días (medio)

La orden `0337d122` (Felipe, 4.498 pts canjeados) murió a los 10 min con el hold, pero
`points_balance` sigue en 0: `release_abandoned_redemptions` corre en el cron diario
(12:30 UTC) y solo toma órdenes `pending_payment` con más de 72 h. Un cliente que cierra
la pestaña en MP pierde acceso a sus puntos hasta 4 días. `confirm_payment` ya tolera un
pago tardío tras la liberación (comentario en `composition.ts`), así que liberar al vencer
el hold (o en el barrido de H1) es compatible con el diseño.

### H4 — El polling de estado no termina ni retrocede (medio-bajo)

`EstadoClient` sondea cada 3 s mientras la orden no sea terminal
([EstadoClient.tsx:51-68](../../components/booking/EstadoClient.tsx#L51-L68)) y cada poll
dispara `payments/search` en MP (~250 ms). Una pestaña abandonada en "Completa tu pago" son
~1.200 llamadas/h a MP, indefinidamente. Tope sugerido: hold TTL + margen, o backoff.

### H5 — Link de pago admin (72 h) sobre un hold de cliente de 10 min (bajo, adyacente)

`sharePaymentLinkAction` ([actions.ts:245-264](../../app/admin/(panel)/reservas/[id]/actions.ts#L245-L264))
crea una preference de 72 h sin distinguir hold firme (`expires_at null`) de hold de
cliente. Así nacieron las preferences #2 y #3 de la orden `157f4d73` (20:14 y 20:15):
sobreviven ~71 h al hold → si se paga, `paid_no_hold` + revisión manual (el comentario del
action lo acepta). Sugerencia: exigir hold firme, o afirmar el hold al generar el link.

### H6 — Desglose del widget vs. línea del pedido (bajo, cosmético)

Quote: subtotal 19.980, `discount` 1.998, total 17.980 (redondeo a 10). El widget muestra
−$1.998 (no suma con su propio total por $2); la línea del pedido/recibo/boleta absorbe el
redondeo como "Descuento por volumen (10%) −$2.000" (`orderLinesFromQuote`, por diseño).

### H7 — La clave del tramo se filtra al recibo (bajo)

La línea `room_time` se guarda como `Sala · 1h (puntaSemana)` / `(valle)`
([order-lines.ts:83](../../src/domain/pricing/order-lines.ts#L83)) y así llega al recibo
de `/reserva/estado`, la boleta y el email; el widget muestra "Punta semana" vía
`tierLabel`.

### H8 — Título duplicado en las páginas de reserva (bajo)

`app/(booking)/reservar/page.tsx` y `reserva/estado/page.tsx` exportan
`title: "… — FOTF Studios"` bajo el template raíz `%s · FOTF Studios` → "Reservar — FOTF
Studios · FOTF Studios". Las páginas de marketing pasan el título pelado.

### H9 — GTM mide localhost, túnel y previews (bajo)

`PublicChrome` monta GTM sin gate por entorno; en esta sesión GA4 recibió `page_view` y
`scroll` con `dl=http://localhost/reservar` (`gcs=G111`). Si GA4 no tiene filtro de tráfico
interno/hostname, el desarrollo contamina la propiedad de producción.

## Lo verificado OK

- Stack: Docker, Supabase local (47/47 migraciones, seed presente), `.env.local` apuntando
  a `127.0.0.1:54421`, flags de reserva y cuenta en `true`.
- `/reservar`: mes/día (hoy `full` por anticipación mínima; reservas confirmadas del seed
  bloquean 14/09 18–20 y 15/09 16–18), tarifas valle/punta, descuento por volumen, add-ons
  flat y por hora, gates de email y T&C, prefill + puntos con sesión, email bloqueado con
  sesión, normalización de invitado (`Audit.Invitado@Example.com` → minúsculas,
  `9 1234 5678` → `+56912345678`) y ficha upserted.
- `POST /api/bookings`: orden `pending_payment` con snapshot, net/IVA, `terms_*`, hold
  `+10 min`, líneas que suman el efectivo, ledger de puntos, `payment_intents` +
  `mp_preference_id`. Rechazos: 400 datos/terms/too_soon, 401 puntos sin sesión, 409
  `slot_taken` (mi propio hold).
- Preference MP (`GET /checkout/preferences/{id}`): `back_urls` https al túnel,
  `auto_return: approved`, `expiration_date_to` = vencimiento del hold, `binary_mode`,
  `excluded_payment_types ticket/atm`, `external_reference` = orden, payer name/surname,
  metadata, `statement_descriptor`, `notification_url: null`.
- Wallet Brick: desktop (columna derecha) y móvil (barra fija, CTA único) → Checkout Pro
  "¿Cómo quieres pagar?" con el monto correcto ($13.482 con puntos; $24.980 invitado).
- Retorno abandonado: interstitial de ngrok (solo dev) → "Pago pendiente / Completa tu pago"
  con reanudación y "Elegir otro horario"; banner de consentimiento en el origen nuevo.
- Polling → `GET /api/orders/[id]/status` → `reconcileOrder` → `payments/search` sin errores.
- Webhook con `data.id` falso / forma IPN / `merchant_order`: 200, `firma no validada
  (forma=…)`, error de MP logueado, `webhook_events` sin filas. `/api/cron/reconcile` 401
  sin/with secreto malo. `/api/orders/no-uuid/status` y uuid inexistente: 404.
- `confirm_payment(orden, ref)` sobre el hold vivo: `confirmed` → orden `paid`, reserva
  `confirmed` (expiry limpiado), boleta emitida, 5 % de puntos (1.249 sobre 24.980), 4
  `booking_events`. `/reserva/estado?status=approved` → "¡Listo, Auditoría!", recibo,
  pasos, WhatsApp con mensaje, .ics, Google Calendar (19:00 SCL = 22:00Z).
- Sin errores no controlados en el log de `next dev` durante toda la sesión.

## No verificado (requiere al dueño)

Pago aprobado real en sandbox → webhook del panel (test-mode → túnel) y/o reconcile →
`paid` + email. Receta: sesión como Buyer Test User en Checkout Pro (saldo o tarjeta
`5416 7526 0258 2580`, APRO, 123, 11/30), con el túnel arriba y `NEXT_PUBLIC_SITE_URL`
en el túnel; esperar `firma ok (forma=webhooks)` o, si MP no notifica (comportamiento
conocido del sandbox), la confirmación por el polling de `/reserva/estado`.

## Notas del stack local (no son bugs de código)

- `.env.local` quedó con `NEXT_PUBLIC_SITE_URL` en el túnel **sin ngrok corriendo**: las
  tres preferences de la orden `157f4d73` llevan `back_urls` a un host que respondía 404.
  Si se hubiera pagado, MP habría redirigido a la página de ngrok; la orden solo se
  confirmaría por reconcile al entrar a mano a `/reserva/estado`. Revertir a
  `http://localhost:3000` al terminar (regla de CLAUDE.md) o levantar el túnel antes.
- `CRON_SECRET` no está en `.env.local` → `/api/cron/reconcile` y `/notifications` no se
  pueden ejercitar localmente; el job de pg_cron de PINs es no-op sin secretos en vault.
- `RESEND_API_KEY` ausente → `NoopMailer` (`[email:noop] asunto → destinatario` en el log
  de dev). Confirmar por la RPC no dispara email (lo disparan webhook/reconcile/admin).
- Había un `next dev` de otra sesión en :3000 (pid 76300); se reemplazó para tener el log.
- El contexto "otp8-widget" del navegador traía sesión de `felipe.munoz@outlook.cl`; el
  camino de invitado se corrió en un contexto aislado nuevo (móvil 390×844).
- Estado de la DB al cierre: seed + `157f4d73` (hold expirado, 3 preferences),
  `0337d122` (Felipe, hold expirado, 4.498 pts retenidos), `2dc43e98` (invitado, **pagada
  por simulación** `audit:simulado`, boleta emitida), `50b4e4c5` (segundo invitado, hold
  vence 21:19). `npm run db:reset` deja todo limpio.
