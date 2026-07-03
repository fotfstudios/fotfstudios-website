# Política de cancelación + reembolsos admin + email al cliente — diseño

- **Date:** 2026-07-03
- **Status:** Design approved
- **Scope:** Política de reembolso codificada (100%/50%/0% por anticipación), reembolsos
  totales/parciales desde el admin, email de cancelación al cliente, error explícito al
  reembolsar órdenes no pagadas, y fix de la NC duplicada en reembolsos admin.

## Context

Decisiones del dueño: la política **sugiere** el monto (≥24 h → 100% · [12 h, 24 h) → 50% ·
<12 h, iniciada o pasada → 0%) y el **dueño puede sobreescribir** (total / sin reembolso /
monto libre); el email de cancelación va **solo al cliente**; se preserva el invariante
**reembolso ⇒ reserva cancelada + horario liberado**.

**Bug confirmado que este cambio corrige:** el reembolso admin emitía NC completa vía
`cancel_booking` y luego el webhook loopback de MP (inbox sin registrar) ejecutaba
`mark_refunded` → **segunda NC**. Nunca se vio porque el sandbox bloquea reembolsos por API.
`mark_refunded` no es idempotente por refund id → el orden **inbox primero, RPC después** es
obligatorio.

**Out of scope:** honestidad de /reserva/estado para orden pagada-retenida (sigue mostrando
"¡Listo!"), limpieza de la rama muerta `p_refund_id` de `cancel_booking`, y un ledger de
reembolsos para el riesgo residual de split-failure (MP reembolsa + inbox registra +
`mark_refunded` falla → recuperación manual; documentado, estrictamente mejor que hoy).

## Componentes

| Archivo | Status | Propósito |
|---|---|---|
| `src/domain/scheduling/cancellation-policy.ts` | new | Política pura: `refundPolicy`, `suggestedRefund`, `resolveRefundAmount` (reloj inyectable) |
| `src/domain/scheduling/cancellation-policy.test.ts` | new | Bordes exactos 24 h/12 h, redondeo, matriz de modos |
| `app/admin/(panel)/reservas/[id]/_components/CancelBookingDialog.tsx` | new | Dialog + ActionForm: radios política/total/sin/monto libre |
| `src/application/admin/refund-service.ts` | rewrite | `cancelBooking(id, {refundAmount})`; inbox-first; errores explícitos |
| `src/infrastructure/db/admin-repository.ts` | modify | `orderForReservation` + montos/startsAt; `cancelBooking(id)` sin refundId |
| `src/composition.ts` | modify | `refundService()` inyecta el inbox (`SupabaseWebhookRepository`) |
| `src/application/payment/webhook-service.ts` | modify | `WebhookResult.refundedAmount` (suma de reembolsos FRESCOS) |
| `app/api/webhooks/mercadopago/route.ts` | modify | `refunded` → email de cancelación (reembolsos externos del panel MP) |
| `src/application/notifications/templates.ts` | modify | `customerCancellation` |
| `src/application/notifications/notification-service.ts` | modify | `notifyCancellation(orderId, {refundAmount})` — solo cliente, best-effort |
| `app/admin/actions.ts` | modify | `cancelBookingAction`: modos, montos server-side, email |
| `app/admin/(panel)/reservas/[id]/page.tsx` | modify | Rama pagada → `CancelBookingDialog` |

**Sin migración**: `mark_refunded(p_order, p_refund_id, p_refund_amount)` ya hace todo
(capa al saldo de boleta viva, cancela reserva, acumula `refunded_amount_clp`, NC + boleta
por saldo); `database.types.ts` ya trae el parámetro.

## Diseño clave

1. **Convergencia**: el reembolso admin deja de usar `cancel_booking(p_refund_id)` y pasa por
   la misma maquinaria del webhook: `gateway.refundPayment(paymentId, MONTO explícito)` →
   `recordEvent("refund:{id}")` → si fresco → `mark_refunded(order, id, monto)`. El loopback
   de MP encuentra el inbox ocupado y no repite NC ni email. Si el loopback ganó la carrera
   (`!fresh`), el servicio devuelve `alreadyProcessed` y la acción omite su email.
2. **Offline** (`mpPaymentId` nulo u `offline:*`): SIN inbox (la clave `refund:offline:manual`
   no es única y no existe loopback) → `mark_refunded(order, "offline:manual", monto)`
   directo. La devolución física la hace el dueño (hint en el dialog).
3. **Server no confía en el cliente**: `policy`/`full` se recalculan al confirmar
   (`resolveRefundAmount` con `starts_at` y boleta viva del server); solo `custom` lee un
   número del form, validado 1..saldo y re-capado por el RPC.
4. **Bordes de la política**: inclusivos en 24 h y 12 h exactas (el instante límite favorece
   al cliente). Sesión iniciada o pasada → 0%.
5. **Email**: `customerCancellation({name, when, refunded|null})` — con reembolso: "Te
   reembolsamos **$X** al medio de pago original… puede tardar unos días"; sin reembolso: sin
   línea de dinero, solo contacto. Sin guard de `notified_at` (columna de la confirmación) ni
   columna nueva: best-effort en los dos momentos únicos (acción admin / webhook externo
   fresco); doble-envío presionado y descartado (zona de peligro desaparece al revalidar;
   el path de reembolso lanza si el estado ya no es `paid`).
6. **Edge fix**: pedir reembolso con orden no pagada lanza error es-CL visible en el dialog.

## Error handling

MP falla → aborta, DB intacta (comportamiento actual). Monto > saldo → error. Orden sin pago
asociado (bloqueo/cortesía) con modo ≠ none → error. `mark_refunded` re-capa en el RPC.

## Testing (Vitest)

Unit: política (bordes exactos con `now` fijo, redondeo 50% impar, matriz resolveRefundAmount),
refund-service (orden inbox→RPC, duplicado → `alreadyProcessed`, MP throw → inbox intacto,
no-pagada → error, offline sin inbox, null → cancelBooking), webhook-service (refundedAmount
fresco/duplicado), templates (con/sin reembolso + XSS). Integración (webhook.itest):
**regresión NC duplicada** — reembolso admin real (stub gateway) → loopback mismo refund id →
exactamente 1 NC, `refunded_amount_clp` correcto, slot re-reservable; variante parcial →
NC(total) + boleta(saldo).

## Verification

1. `npx eslint .` · `npm test` · `npm run build` — exit 0; `npm run test:integration` local y
   **`npm run db:reset` después**.
2. E2E manual admin: reserva offline → dialog muestra tier según distancia a la sesión →
   cancelar "según política" y "otro monto" → NC + boleta saldo en Documentos tributarios,
   `refunded_amount_clp` en Studio, horario liberado; reembolso sobre orden no pagada → error
   visible.
3. Path MP-API no testeable en sandbox (MP lo bloquea — por eso el bug era latente): cubierto
   por unit + itest con stub. Primer reembolso admin real en prod = verificación del fix
   (exactamente una NC).
