# Spec — Money-safety/SII del reagendamiento + ciclo de pago manual

**Fecha:** 2026-07-07 · **Rama:** `feat/reschedule` · **Estado:** diseño para revisión

## Contexto

Una auditoría adversarial (13 agentes: 4 trazaron cada tipo de reagendamiento, 9 intentaron
refutar) confirmó cuatro defectos de plata/SII en los caminos nuevos de reagendamiento, más una
consecuencia de "pago partido" que el lente online/offline destapó. En paralelo, el flujo de
creación de reservas manuales carece de un estado "pendiente de pago": hoy se crea **y** se marca
pagada en el mismo paso (`createManualBookingAction` → `checkoutService.createBooking` →
`confirmOffline`), sin la opción de cobrar después (efectivo/transferencia o link de Mercado Pago).

**Raíz común de los defectos (1–4):** los caminos de reagendamiento no sostienen los dos invariantes
que el flujo original de cancelación/reembolso sí respeta:

- **I1 — Una sola boleta viva** por pedido, cuyo total = `amount_clp − refunded_amount_clp`. Toda
  anulación emite NC por ese total y re-emite boleta por el saldo (regla SII: la NC va por el total
  de una boleta).
- **I2 — MP nunca se ejecuta antes de la DB sin compensación.** Un movimiento irreversible de plata
  en MP solo ocurre cuando el asiento contable ya está durable, o el fallo posterior es recuperable.

El plan: **primero** los arreglos money-safety/SII (independientes), **después** la feature de pago
manual junto con el arreglo #4 (comparten la maquinaria de liquidación del delta).

## Parte A — Arreglos money-safety/SII del reagendamiento (primero)

### A1 · 🔴 ALTO — `reschedule_down`: sembrar antes de reembolsar

**Problema.** En el reagendamiento **más barato** ([reschedule-service.ts:109-114](../../../src/application/admin/reschedule-service.ts#L109-L114)) el reembolso en MP ocurre **antes** del asiento (`reschedule_down`), que puede abortar por GiST (`exclusion_violation`) si el slot se toma en la carrera TOCTOU. Si aborta: la plata ya salió de MP, no se emite NC, `refunded_amount_clp` no cambia, la reserva no se mueve, y el webhook de MP queda **suprimido** por el `refund:{id}` ya registrado en el inbox → sin auto-reparación. Un reintento del admin genera un **segundo reembolso** (refund id nuevo). Solo afecta pagos MP reales (online); el offline toma la rama sin MP.

**Enfoque recomendado — sembrar-primero-reembolsar-después.** Invertir el orden para el camino MP real:
1. Ejecutar el asiento que puede abortar (mover el rango + NC + boleta del saldo + `refunded_amount_clp`) **sin** el refund id, en su transacción. Si aborta por GiST → nada se movió, **cero plata tocada** → error al admin ("ese horario ya está tomado").
2. Solo si el asiento commiteó, ejecutar `refundPayment` en MP.
3. Registrar `mp_refund_id` + el inbox `refund:{id}` (para que el loopback dedupee).

Esto invierte el modo de falla al **recuperable**: si el refund de MP falla tras el asiento, la reserva ya se movió y quedó un pedido con `refunded_amount_clp` seteado **sin** `mp_refund_id` → detectable y reintentable (el barrido de reconcile puede reintentar el refund). Se elimina el escenario "plata afuera sin registro".

*Alternativa considerada:* pre-chequeo de disponibilidad antes del refund — solo achica la ventana TOCTOU, no la elimina; descartada.

**Impacto de código:** `reschedule_down` se divide en "mover+asentar" (abortable, sin refund id) y un paso posterior que fija `mp_refund_id`; el servicio reordena las llamadas.

### A2 · 🟠 MEDIO — Boletas apiladas: consolidar en el encarecimiento

**Problema.** `apply_reschedule_charge` (más caro, slot libre) **apila** una boleta incremental por el delta sobre la orden original sin anular la boleta anterior ([reschedule_charge.sql:99-100](../../../supabase/migrations/20260707140000_reschedule_charge.sql#L99-L100)). Queda con dos boletas (A y delta) y `amount_clp = A+delta`. Es la única operación del sistema que rompe **I1**. Una NC posterior (cancelar, reembolsar o reagendar más barato) se emite por `A+delta`, monto que no calza con ningún DTE individual → nota de crédito inválida/rechazable ante el SII. Afecta online y offline.

**Enfoque recomendado — consolidar (anular + re-emitir) en vez de apilar.** En la rama slot-libre de `apply_reschedule_charge`, en lugar de insertar la boleta incremental: emitir **NC por la boleta viva anterior** (A) + **boleta nueva por el total nuevo** (N = A+delta), igual que hace `reschedule_down`. Así siempre hay **una sola boleta viva = N**, restaurando I1. El encarecimiento se vuelve simétrico con el abaratamiento (ambos anulan+re-emiten). Costo: un par NC+boleta extra por encarecimiento (más documentos, pero todos válidos).

*Alternativa considerada:* hacer que la lógica de NC (`mark_refunded`, `reschedule_down`) itere sobre las boletas vivas y emita una NC por cada una. Más fiel a "NC por boleta" pero toca todos los caminos de reembolso y exige rastrear qué boletas siguen vivas — más superficie. Descartada por blast radius; la consolidación mantiene un solo invariante para todo el sistema.

### A3 · 🟠 MEDIO — Nota de crédito espuria de $0 en slot_taken

**Problema.** El reembolso del excedente en el camino slot_taken ([webhook-service.ts:76-80](../../../src/application/payment/webhook-service.ts#L76-L80)) **no es inbox-first**: llama `refundPayment` + `markChargeRefunded` sin registrar `refund:{id}`. Como crear el reembolso dispara por sí solo una notificación de MP que reingresa al webhook, en la re-entrega `getPayment` trae ese refund en `refunds[]`, el loop lo ve fresco y corre `mark_refunded` sobre la orden de delta ya totalmente reembolsada → `v_boleta = delta − delta = 0` → `create_nota_credito_amount(order, 0)` inserta una NC de $0 (no emitible al SII). Prácticamente garantizado en cada slot_taken.

**Enfoque recomendado — inbox-first + guard de $0 (defensa en profundidad):**
1. **Raíz:** en la rama slot_taken, registrar `refund:{id}` en el inbox tras `refundPayment` (alinea slot_taken con todos los demás caminos de reembolso), para que la re-entrega dedupee.
2. **Defensa:** early-return en `mark_refunded` / `create_nota_credito_amount` cuando el monto es 0 — un documento tributario de $0 nunca debería poder crearse por ningún camino.

### Menores (registrar, no urgentes)

- **Fila de auditoría duplicada en "mismo precio"** por doble-clic (cero plata/SII, solo ruido en
  `reschedules`). Opcional: guard de idempotencia o dedupe por ventana corta.
- **Carrera del loopback que cancela en vez de mover** — ya mitigada con `refund_looped_back` →
  revisión manual del dueño. Se documenta; sin cambio en este alcance.

## Parte B — Feature: ciclo de pago manual + arreglo del pago partido (#4)

### B1 · Ciclo de pago de reservas manuales

**Modelo (reutiliza la maquinaria existente).** Una reserva manual pendiente = orden
`pending_payment` + reserva `held` **sin** el `expires_at` corto del checkout. Bloquea el cupo en
firme (participa del GiST anti-solape). Los dos caminos de liquidación convergen en `confirm_payment`
(que pasa `held → confirmed` y emite la boleta). La cortesía sigue igual (sin orden).

**Cupo pendiente.** Bloqueo firme + **barrido** nuevo `expire_abandoned_manual_holds` (ventana
configurable, default ~72 h; junto al cron de reconcile) que libera las pendientes olvidadas.

**Liquidación — dos caminos, siempre ambos disponibles sobre la orden pendiente:**
- **Marcar pagado (offline):** el admin elige efectivo/transferencia → `confirmOffline` (ya existe)
  → `mp_payment_id = offline:{método}`, sin comisión MP. El método se elige **al liquidar**.
- **Compartir link MP:** `createPreferenceForOrder(orderId, {expiresInMinutes})` con ventana larga
  → link compartible (copiar + WhatsApp). El cliente paga → el webhook llama `confirm_payment` → se
  marca pagada sola. `mp_payment_id` numérico, con comisión.
- **Idempotencia de la carrera:** `confirm_payment` ya guarda `where status <> 'paid'`; si el cliente
  paga el link justo cuando el admin marca efectivo, gana el primero y el segundo es no-op (sin doble
  boleta).

**UX.**
- *Creación:* estado base **pendiente** + atajo opcional "marcar pagado ahora" (efectivo/transferencia)
  que crea y liquida en un submit (walk-in). La cortesía sigue como camino aparte.
- *Ficha de la reserva:* tarjeta "Cobro" cuando la orden está `pending_payment`, con selector de
  método (marcar pagado) y botón de link (generar + copiar + WhatsApp). El timeline ya refleja
  "Pago confirmado" con método y las boletas emitidas.

**Consentimiento T&C.** Al crear, el staff atestigua (`terms_source='staff'`, como hoy); si se cobra
por link sin atestiguar, el mensaje de WhatsApp lleva el link de T&C (mismo patrón que la cortesía).

### B2 · #4 — Pago partido: reembolsar por cada pago constituyente

**Problema.** El encarecimiento pliega el delta en `amount_clp` de la orden original
([reschedule_charge.sql:85-90](../../../supabase/migrations/20260707140000_reschedule_charge.sql#L85-L90))
pero cobra en un pago MP **separado** (la orden de delta). `RefundService` solo conoce el pago
original. Al cancelar/reembolsar un encarecido: **online** → `refundPayment(pago_original, A+delta)`
es rechazado por MP (el pago original solo capturó A) → no se puede reembolsar el total, el delta
queda atrapado en MP; **offline** → al dueño se le dice devolver A+delta en efectivo pero el delta
está en MP → sobre-devolución. Un contracargo del delta (`fulfilled`) queda sin NC.

**Enfoque recomendado — reembolso multi-pago.** La cancelación/reembolso de un pedido resuelve sus
**pagos constituyentes** (el original + las órdenes de delta ligadas vía la tabla `reschedules`:
`original_order_id` → `delta_order_id`) y reembolsa **cada uno contra su propio pago**, respetando su
medio: MP real → `refundPayment` sobre ese pago; offline → marcar/registrar sobre ese pedido. El monto
a reembolsar se reparte por pago (nunca se pide a un pago más de lo que capturó). Se hace **junto con
B1** porque comparte la maquinaria de liquidación del delta (tratar el delta como cobro de primera
clase). Nota: con A2 (consolidación) el lado SII ya queda coherente; B2 arregla el lado de la **plata**.

**Cierra un gap del audit.** Estas mismas acciones de liquidación (marcar offline / link) habilitan el
**encarecimiento offline**, hoy inexistente (el "más caro" fuerza siempre un link MP aunque el original
sea efectivo): la orden de delta podrá cobrarse por link **o** marcarse pagada offline con la misma UI.

## Invariantes (contrato del sistema, a preservar por todos los caminos)

- **I1 — Una sola boleta viva por pedido**, total = `amount_clp − refunded_amount_clp`. Toda anulación
  = NC por ese total + boleta por el saldo. (A2 lo restaura en el encarecimiento.)
- **I2 — MP nunca antes de la DB sin compensación.** (A1 lo restaura en el abaratamiento.)
- **I3 — `confirm_payment` idempotente** (`where status <> 'paid'`): dos liquidaciones que compiten →
  gana la primera, sin doble boleta. (B1 se apoya en esto.)
- **I4 — Todo pago constituyente es reembolsable contra su propio pago/medio.** (B2 lo establece.)

## Testing (TDD, capa itest de RPC + unit de servicio)

- **A1:** itest — `reschedule_down` sobre slot ya tomado aborta por GiST y **no** deja
  `refunded_amount_clp`; unit del servicio — el refund de MP se llama **después** del asiento y no se
  llama si el asiento aborta.
- **A2:** itest — tras un encarecimiento hay **una sola boleta viva** (NC de la anterior + boleta por
  el nuevo total); un reembolso posterior emite NC por un monto que **calza** con la boleta viva.
- **A3:** itest — re-entrega del webhook en slot_taken **no** crea una segunda NC; `mark_refunded` con
  `v_boleta = 0` no inserta documento.
- **B1:** itest — la reserva manual pendiente bloquea vía GiST y **no** expira en 10 min; el barrido
  libera >72 h; convergencia offline/MP en `confirm_payment` con la carrera (primero gana, sin doble
  boleta). Unit del servicio de liquidación.
- **B2:** itest — cancelar un encarecido reembolsa el pago original **y** el pago del delta cada uno
  contra su pago; online no excede ningún pago; offline registra por pedido.

## Secuencia de implementación

1. **A1** (🔴 ALTO) → **A2** (🟠 boletas) → **A3** (🟠 $0 NC) — críticos, independientes de la feature.
2. **B1** (ciclo de pago manual) **+ B2** (#4 pago partido) — juntos, comparten la liquidación del delta.

## Fuera de alcance

- Reagendamiento de órdenes con puntos (sigue bloqueado en v1).
- Cambios al flujo de checkout online del cliente.
- Migración de reservas manuales ya pagadas (la feature nace tras un flag; solo aplica a nuevas).
- Los menores (fila duplicada equal, loopback cancel) quedan documentados, sin cambio.
