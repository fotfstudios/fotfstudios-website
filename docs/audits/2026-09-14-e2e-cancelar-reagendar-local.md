# Auditoría E2E de cancelación y reagendamiento (stack local)

**Fecha:** 2026-09-14, 20:40–21:10 (America/Santiago). **Estado:** H2/H3/H5 corregidos en
PR #178; H1/H9 en este PR (branch `fix/reschedule-pending-refund`: mover → MP → asentar con
fila `pending_refund`, reintento admin/cron, loopback que asienta en vez de cancelar). Stack: Docker + Supabase CLI (53/53 migraciones, seed intacto) + `next dev` 15.5.20 +
credenciales de prueba de MP (solo para crear la preference del delta). Sin Resend (`NoopMailer`
→ los emails se verifican en `notification_log` y en el log del dev server).

Método: lectura de las capas (`actions.ts` → `RefundService`/`RescheduleService` → repos →
RPCs vivas con `pg_get_functiondef`), fixtures creados con el `CheckoutService` real +
`confirm_payment(offline:*)`, y cada escenario ejercitado **desde el admin en el navegador**
(Playwright) con diff de estado antes/después (`reservations`, `orders`, `order_lines`,
`tax_documents`, `points_ledger`, `reschedules`, `booking_events`, `notification_log`). Las
consecuencias de segundo orden (webhook loopback, pago tardío) se simularon llamando a la
misma RPC que invoca el webhook, dentro de una transacción con `rollback`.

## Resumen

La contabilidad central está bien: en todos los caminos que se pudieron cerrar local (reembolso
total, parcial, reagendar igual/más barato offline, cortesías, orden 100 % puntos, puntos +
efectivo) se cumple el invariante I1′ (`Σ boletas vivas = amount − refunded`), las NC quedan
enlazadas a su boleta, el truing de puntos es correcto (`floor(0,05 × vivo)`, restauración a
prorrata), el timeline registra los asientos y sale el email correcto. La política publicada
en `/terminos` (24 h/12 h, 100/50/0 %, sin reagendar con puntos, cortesías sin política) es
exactamente la que aplica el código.

Lo que **no** cerró son las esquinas donde el dinero de MP y la base se desincronizan:

1. **Reagendar a más barato con pago MP asienta el reembolso ANTES de reembolsar.** Si MP falla,
   la base queda con `refunded_amount_clp` subido, NC + boleta nueva emitidas, puntos revocados y
   la reserva movida — sin `mp_refund_id`, sin email al cliente y sin camino de recuperación: si
   el dueño reembolsa a mano desde el panel de MP, el webhook **cancela la sesión viva y duplica
   el reembolso**. (H1, alta)
2. **Un cobro de reagendamiento pendiente sobrevive a la cancelación** y a un segundo
   reagendamiento. Pagar el link después de cancelar "aplica" el cobro sobre una reserva cancelada;
   dos cobros pendientes aplican ambos y el cliente paga de más. (H2/H3, alta)
3. **El cobro pendiente manda el email equivocado:** "Reserva reagendada · *horario viejo*" con
   .ics del horario viejo y sin el link de pago. (H4, media-alta)

## Escenarios ejecutados

| # | Escenario | Fixture | Resultado |
|---|-----------|---------|-----------|
| S1 | Cancelar con reembolso, pago MP (id falso) → MP falla | seed b1, 21 h | ✅ aborta limpio, DB byte-idéntica |
| S2 | Cancelar ≥24 h, offline, política 100 % | F1 | ✅ NC, puntos, eventos, email |
| S3 | Cancelar 12–24 h, offline, política 50 % | F2 | ✅ NC + boleta reemitida 4.995, revoke 250 |
| S4 | Cancelar <12 h, política = sin reembolso | F3 | ✅ estado · ❌ sin evento `cancelled` (H5) |
| S5 | Cancelar cortesía | F4 | ✅ email `customerCourtesyCancelled` · ❌ sin evento (H5) |
| S6 | Reagendar cortesía fuera de horario | F4 | ✅ mueve · ❌ sin email al cliente (H6) |
| S7 | Reagendar mismo precio, offline | F6 | ✅ |
| S8 | Reagendar más barato, offline (14.990 → 9.990) | F7 | ✅ NC 14.990 + boleta 9.990, revoke 250, email con $5.000 |
| S9 | Reagendar más barato, pago MP → MP falla | seed b3 | ❌ **H1** |
| S10 | Reagendar más caro → cobro pendiente + preference MP | seed b2 | ✅ cobro · ❌ **H4** email viejo |
| S11 | Cancelar con cobro pendiente → cliente paga el link tarde | seed b2 | ❌ **H2** |
| S12 | Segundo reagendamiento con cobro pendiente → paga ambos | seed b2 | ❌ **H3** |
| S13 | Cancelar orden 100 % puntos, política | F5 | ✅ repone 9.990 pts · ❌ diálogo dice "$0" (H7) |
| S14 | Cancelar puntos + efectivo, 50 % (RPC) | mixto | ✅ restore 2.000/4.000 a prorrata |

Fixtures: `scratchpad/fixtures.ts` (CheckoutService real + `confirm_payment(offline:*)`), diff con
`scratchpad/state.sh <reservation_id>`. Los ids del seed cambian con cada `db:reset`.

## Hallazgos

### H1 — Reagendar más barato con pago MP: asiento sin reembolso real (alta)

Antes de PR2 (`fix/reschedule-pending-refund`), `RescheduleService.reschedule`
(`src/application/admin/reschedule-service.ts:136-148` de entonces) llamaba `settleDown` (RPC
`reschedule_down`, que **commiteaba** la movida, `refunded_amount_clp`, NC, boleta nueva y revoke
de puntos) y **recién después** `gateway.refundPayment`. El orden estaba elegido a propósito (I2:
no reembolsar si el GiST rechaza el slot), pero dejaba el caso inverso sin compensación. PR2 lo
parte en `reschedule_down_move` (mover, sin plata) → MP → `reschedule_settle_refund` (asentar por
reembolso aprobado).

Reproducido con b3 (89.970, `mp_demo_0003`) → mié 16 10:00–12:00: el admin ve "No se pudo
reembolsar en Mercado Pago", pero la DB quedó así:

- reserva **movida**; `refunded_amount_clp = 32000`, `mp_refund_id = NULL`;
- NC 89.970 + boleta 57.970 emitidas; `earn_revoke −1600`; `reschedules` = `refund/applied`;
- evento `reschedule_refund` con `payment_ref` vacío; **ningún email** al cliente (la acción
  lanzó antes de `notifyReschedule`).

Segundo orden (simulado con `mark_refunded(order, 'panel-refund', 32000)`, que es lo que hace
el webhook si el dueño reembolsa los 32.000 desde el panel de MP): la reserva viva pasa a
`cancelled`, `refunded_amount_clp = 64000`, NC 57.970 + boleta 25.970, otro `earn_revoke −1600`.
No hay forma manual segura de arreglarlo.

Además, a diferencia de `RefundService`, este camino **no valida `isSettledRefund`** (un
`in_process` que MP rechace después queda asentado igual) y usa la clave de idempotencia por
defecto `refund:{pago}:{monto}` (`mercadopago-gateway.ts`): dos bajas del mismo monto sobre el
mismo pago (más barato → más caro con orden de delta → más barato otra vez, permitido "todas las
veces que necesites") colapsan en MP en un solo reembolso; el segundo devuelve el id viejo,
`recordEvent` no es fresco y la acción termina en `refund_looped_back` con la plata sin salir.
Es la misma clase de bug que #157 cerró en `RefundService`.

**Recomendación.** Separar "mover" de "asentar el reembolso": (1) RPC que solo mueve el rango
(satisface I2 vía GiST), (2) reembolso en MP con `isSettledRefund` y clave con `refunded_amount`
como en `RefundService`, (3) RPC de asiento; si (2) falla, RPC de reversa del movimiento (o
dejar la reserva movida con un `pending_refund` que un reconcile reintente). Mientras tanto, al
menos: no tocar puntos/NC hasta tener el `refund.id`, y registrar `payment_ref`.

### H2 — Cancelar no cierra los cobros de reagendamiento pendientes (alta)

Ni `cancel_booking` ni `mark_refunded` tocan `reschedules`/órdenes de delta. Tras cancelar b2
quedaron dos `pending_charge` con sus órdenes `pending_payment` y preferences MP vivas (TTL 24 h;
`expire_abandoned_reschedules` recién a las 72 h por el cron diario).

`apply_reschedule_charge` hace `update reservations … where status = 'confirmed'` y **no
verifica filas afectadas**: sobre una reserva cancelada no hay `exclusion_violation`, así que sigue
por la rama "aplicado". Simulado: la reserva sigue `cancelled` en el horario viejo, la orden
original sube a 35.980, se emite boleta de 6.000 financiada por la orden de delta, `+300 pts`,
evento `reschedule_moved`, y el webhook mandaría "Reserva reagendada". El cliente pagó 6.000 por
nada.

**Recomendación.** (a) En `cancel_booking`/`mark_refunded`: `update reschedules set status =
'cancelled'` + `orders → cancelled` para los `pending_charge` de la reserva (y anular la
preference si se quiere ser prolijo). (b) En `apply_reschedule_charge`: `get diagnostics` tras el
update; 0 filas ⇒ tratar como `slot_taken` (boleta sobre la orden de delta + reembolso del delta
por el webhook).

### H3 — Se puede crear un segundo reagendamiento con uno pendiente (alta)

Ni la ficha (`page.tsx:123`), ni el servicio, ni `create_reschedule_charge` / `reschedule_move` /
`reschedule_down` miran si ya existe un `pending_charge`. Con b2 se crearon dos cobros de 6.000
(sáb 19 y dom 20). Simulando el pago de ambos: la reserva termina en dom 20 15:00 (vale 35.980)
con la orden en **41.980** y dos boletas de delta vivas; los puntos se otorgan dos veces.

**Recomendación.** Bloquear en la ficha (ocultar "Reagendar" y mostrar el cobro pendiente con
botón "Anular cobro"), rechazar en el servicio (`pending_charge` ⇒ error) y, como red, índice
único parcial `reschedules (reservation_id) where status = 'pending_charge'`.

### H4 — Cobro pendiente: email "Reserva reagendada" con el horario viejo y sin link (media-alta)

`rescheduleAction` (`app/admin/(panel)/reservas/[id]/actions.ts:177`) solo excluye
`refund_looped_back`; para `charge_pending` llama `notifyReschedule(orderId)`, que lee
`reservations.starts_at` (todavía el viejo) y manda "Reserva reagendada · miércoles 16 de
septiembre, 16:00–18:00 h" con .ics del horario viejo. Ningún email lleva el link de pago (solo
el WhatsApp manual del admin), al revés de lo que hace `notifyBookingPaymentLink` para reservas
pendientes.

**Recomendación.** Para `charge_pending` mandar un `customerReschedulePaymentLink` (horario
nuevo, monto, link, vencimiento) y dejar el "Reserva reagendada" al webhook cuando se aplique
(ya lo hace).

### H5 — Cancelar sin reembolso y orden 100 % puntos no dejan rastro en el timeline (media)

`cancel_booking` (definición viva, `20260704113000`) y `refund_points_order` no llaman
`log_booking_event`; solo `mark_refunded` registra `refunded` + `cancelled`. En la ficha el badge
dice "Cancelada" y la actividad no muestra cuándo ni por quién (screenshot en el scratchpad de la
sesión). Lo mismo con las cortesías: `createCourtesyBooking` es un insert plano sin
`courtesy_confirmed`, así que una cortesía creada desde el admin nace con el timeline vacío.

**Recomendación.** `log_booking_event(…, 'cancelled', p_created_by)` en `cancel_booking` y
`refund_points_order` (+ un `points_restored` o reutilizar `refunded` con `p_amount` en puntos),
y `courtesy_confirmed` al crear la cortesía.

### H6 — Reagendar una cortesía no avisa al cliente (media)

La acción notifica solo si `orderForReservation` devuelve orden; la cortesía no tiene. El
cliente recibió `notifyCourtesy` con el horario original (jue 12:00) y nada sobre la movida a
08:00. Debería seguir el patrón de `notifyCourtesyCancelled` (datos en mano, reservation-keyed).

### H7 — Diálogo de cancelación en orden 100 % puntos muestra "$0 / sin reembolso" (media)

`page.tsx` pasa `liveBoleta = amount − refunded = 0` al `CancelBookingDialog`, así que muestra
"Según política — sin reembolso", "Reembolso total — $0" y el hint de devolución offline. El
servidor (`cancelBookingAction:38-47`) usa `pointsRedeemedClp` y repuso 9.990 puntos. Si el
admin elige "Sin reembolso" creyendo que da lo mismo, el cliente pierde los puntos. Pasar la base
en puntos y el copy "se reponen N puntos" (como ya hace el email).

### H8 — El picker de reagendar parte siempre en 1 h (media, UX)

`RescheduleDialog.tsx:102` `useState(1)`. Con b3 (2 h) el diálogo cotizó 1 h y ofreció
reembolsar $39.990: reagendar se convierte en acortar la sesión sin que nadie lo pida. Debe
inicializarse con la duración actual de la reserva.

### H9 — `reschedule_slot_taken` sin reintento de reembolso (baja, por lectura)

En `webhook-service.ts:87-94`, si `refundPayment` lanza tras `slot_taken`, la ruta responde 500;
en la re-entrega `{pago}:approved` ya está en el inbox ⇒ `duplicate` y nunca se reembolsa el
delta. Misma familia que "no hay reconciliación de reembolsos" (auditoría del 2026-09-14). No se
reprodujo E2E (requiere MP).

### Menores

- Mensaje de MP para un pago inexistente ("Si quieres conocer los recursos de la API…") llega
  crudo al admin; mapear 404 → "MP no encuentra el pago".
- Email de reagendamiento con reembolso offline dice "al medio de pago original… si pagaste con
  tarjeta"; para `offline:*` debería decir que el dueño coordina la devolución.
- Ficha de una orden `offline:puntos` muestra la card "Mercado Pago" con "Ver actividad en
  Mercado Pago" y el pago como "—".
- Ficha cancelada: card Acceso dice "El PIN se genera cuando la reserva quede confirmada".

## Lo que quedó fuera

- Pago real del delta por Checkout Pro y su webhook (`reschedule_applied`) — la RPC se ejercitó
  directo; el camino del webhook está cubierto por `webhook-service.test.ts`.
- Reembolso MP exitoso (sandbox devuelve 401; ver auditoría de reembolsos del 2026-09-14).
- Carreras (dos admins, admin vs. cliente pagando) — ver `2026-09-11-deadlock-checkout-mismo-slot.md`.
