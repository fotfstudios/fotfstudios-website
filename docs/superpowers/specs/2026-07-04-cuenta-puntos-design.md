# Mi cuenta + Puntos FOTF — cuentas de cliente, auth y puntos canjeables — diseño

- **Date:** 2026-07-04
- **Status:** Design approved
- **Scope:** Área de cliente `/cuenta` (login/signup por magic link, resumen de puntos,
  historial de reservas, perfil), programa de puntos canjeables (5% cashback en CLP,
  canje hasta 100% en el checkout, retroactivo al crear cuenta) y su contabilidad
  transaccional (ledger + claw-back en reembolsos).

## Decisiones del dueño

- **Auth:** solo magic link (sin contraseñas). Signup == primer login con
  `shouldCreateUser: true`. `enable_signup` pasa a true (admin sigue protegido por
  `shouldCreateUser: false` + claims RBAC).
- **Modelo de puntos:** cashback en CLP — 1 punto = $1, se gana el **5%** del *efectivo*
  pagado (`EARN_RATE = 0.05`, floor a entero; la parte pagada con puntos no gana puntos).
  Elegido tras evaluación financiera: costo capado a la tasa, sin arbitraje entre tramos
  (valle/punta), pasivo legible (suma de saldos), compatible con promos futuras (2× valle)
  sin tocar esquema.
- **Canje:** en el checkout como línea `discount`, **hasta 100%** — órdenes 100% puntos se
  confirman sin Mercado Pago y sin boleta (la boleta cubre solo efectivo; $0 → ninguna).
- **Alcance v1:** saldo + historial de puntos, reservas (incluye historial pre-cuenta por
  email verificado), edición de perfil (nombre/teléfono; el email es la identidad y no
  cambia), **puntos retroactivos** al crear la cuenta. SIN auto-cancelación (sigue siendo
  solo admin).

**Out of scope v1:** expiración de puntos (el ledger la soporta a futuro), bucket propio de
analytics para pagos con puntos (quedan en "offline" vía prefijo `offline:puntos`),
auto-cancelación del cliente.

## Invariante central

`orders.amount_clp` **sigue siendo "efectivo cobrado"** — lo que cobra MP, lo que cubre la
boleta, lo que suman las `order_lines`. El canje entra como línea `discount` ("Canje de
puntos") + columna nueva `orders.points_redeemed_clp`. Así quedan intactos: monto de la
preferencia MP, verificación de monto del webhook, emisión de boleta y tope de reembolso
(`saldo vivo = amount_clp − refunded_amount_clp`). `net/tax` se recalculan proporcionales
al efectivo (mismo criterio que `create_boleta_amount`).

## Esquema (una migración)

- **`customers`**: `id = auth.users.id`, `email unique` (minúsculas), `name`, `phone`,
  `points_balance int` materializado (SIN check ≥ 0: se permite deuda por claw-back; el
  canje sí exige saldo suficiente). RLS + solo service_role (convención del repo).
- **`points_ledger`**: enum `points_entry_kind`
  (`earn|earn_revoke|redeem|redeem_release|redeem_restore|adjust`), `amount` con signo,
  `ref` (refund id / `late:{payment}`), **idempotencia = `unique (order_id, kind, ref)`**.
- **`apply_points(...)`**: único escritor — inserta al ledger (`on conflict do nothing`) y
  solo si insertó actualiza `points_balance`. Toda mutación de puntos pasa por aquí.
- **`orders.points_redeemed_clp`**: escrito una vez por `create_checkout`.

## Diseño clave

1. **Canje en `create_checkout`** (parámetros nuevos `p_customer_id`, `p_points`):
   `select … for update` sobre `customers` = punto de serialización de la carrera "dos
   checkouts canjean el mismo saldo" — el perdedor hace rollback completo (hold + orden +
   líneas). Cola: si `p_points > 0 and p_amount = 0` → `perform confirm_payment(v_order,
   'offline:puntos')` — reserva 100% puntos confirmada atómicamente. El prefijo `offline:`
   hace que `RefundService.isRealMpPayment` y analytics se comporten bien sin cambios.
2. **Earn en `confirm_payment`**: tras marcar pagado, `floor(0.05·amount_clp)` si existe
   `customers` para `lower(customer_email)` (invitados ganan después vía retro). Se otorga
   también en `paid_no_hold` (rastrea efectivo retenido; el claw-back lo neutraliza si se
   reembolsa). Guarda de boleta: solo si `amount_clp > 0`.
3. **Claw-back por estado objetivo en `mark_refunded`** (sin deriva en parciales, R
   acumulado): `earn_target = floor(0.05·(C−R))` → revoca el exceso;
   `restore_target = floor(P·R/C)` → repone la diferencia. Reembolso total ⇒ earn neto 0 y
   exactamente P repuestos. Modo `none` no llama `mark_refunded` ⇒ no repone nada.
4. **Fugas de canje cerradas**: `release_order_redemption` en `cancel_unpaid_order` y en la
   rama impaga de `cancel_booking`; sweep `release_abandoned_redemptions('72 hours')` en el
   cron de reconcile (hoy nada termina órdenes abandonadas). Pago tardío post-sweep: en
   `confirm_payment`, si existe `redeem_release` se re-aplica el `redeem` con
   `ref='late:{payment}'` (saldo puede quedar negativo — permitido; queda log).
5. **Retro**: `award_retro_points(customer)` sobre órdenes `paid|fulfilled|refunded` con
   `floor(0.05·(amount_clp − refunded_amount_clp))`; comparte la clave única del earn ⇒
   jamás duplica. Corre dentro de `ensureCustomer` (layout de `/cuenta` y `/reservar`).
6. **Órdenes 100% puntos y cancelación**: `mark_refunded` no puede correr (saldo vivo 0) →
   RPC `refund_points_order` (cancela reserva, orden `refunded`, repone puntos según la
   política 100/50/0 con P como base; sin NC — nunca hubo boleta).
7. **Auth**: `safeNext`/`resolveDestination` puros y testeados (anti open-redirect,
   allow-list `/cuenta|/admin|/reservar`); callback lee `?next=` y enruta por rol
   (no-admin pidiendo `/admin` → `/cuenta`). Middleware: matcher + `/cuenta/:path*` (exige
   sesión) y `/reservar` (solo refresh de cookies). `requireCustomer()` (páginas) /
   `assertCustomer()` (actions — lanza, porque `run()` capturaría el redirect).
8. **El servidor no confía en el cliente**: `pointsToRedeem` exige sesión; el email de la
   sesión **sobrescribe** el del body; el saldo solo lo valida el row lock en SQL. Las
   queries de `/cuenta` filtran por valores derivados de la sesión (el WHERE es la
   frontera de ownership bajo service-role).

## Componentes

| Archivo | Status | Propósito |
|---|---|---|
| `supabase/migrations/*_customers_points.sql` | new | Tablas, enum, `apply_points`, RPCs recreadas (checkout/confirm/cancel/mark_refunded), sweep, retro, refund_points_order |
| `src/domain/points/points.ts` (+test) | new | `EARN_RATE`, earn/claw-back/restore, `applyRedemption`, `clampPoints` — espejo puro del SQL |
| `src/domain/auth/callback-redirect.ts` (+test) | new | `safeNext`, `resolveDestination` |
| `src/application/customers/customer-service.ts` + port | new | `ensureCustomer`, perfil, saldo, movimientos, `bookingsForEmail` |
| `src/infrastructure/db/customer-repository.ts` | new | Adaptador Supabase del servicio |
| `src/infrastructure/auth/require-customer.ts` | new | `currentCustomer`/`requireCustomer`/`assertCustomer` |
| `lib/flags.ts` | new | `accountEnabled()` (`NEXT_PUBLIC_ACCOUNT_ENABLED`) |
| `app/auth/callback/route.ts` | rewrite | `?next=` + destino por rol |
| `middleware.ts` | modify | Matcher `/cuenta` + `/reservar`; guard de sesión |
| `src/application/checkout/checkout-service.ts` | modify | Canje: línea discount, net/tax proporcionales, `insufficient_points` |
| `app/api/bookings/route.ts` | modify | Sesión + `pointsToRedeem` + rama `paidWithPoints` (notifica best-effort) |
| `app/api/cron/reconcile/route.ts` | modify | Sweep de canjes abandonados tras `reconcilePending()` |
| `app/admin/(panel)/reservas/[id]/actions.ts` + RefundService | modify | Rama C=0∧P>0 → `refund_points_order` |
| `app/cuenta/login/*` | new | Magic link `shouldCreateUser:true`, copy "entra o crea tu cuenta" |
| `app/cuenta/(panel)/*` | new | Layout (shell + `ensureCustomer` + chip saldo), Resumen, Reservas, Perfil, error/404/loading |
| `components/cuenta/CuentaShell.tsx` + `CuentaTabs` | new | Header sticky, tabs, booth-glow, max-w-4xl |
| `components/admin/SignOutButton.tsx` | modify | Props `redirectTo`/`className` (call sites admin intactos) |
| `components/admin/ui/icons.tsx` / `StatusPill.tsx` | modify | Iconos `points`/`user`; labels del ledger |
| `components/Nav.tsx` / `components/Footer.tsx` | modify | Link "Mi cuenta" (estático, gated por flag) |
| `app/reservar/page.tsx` + `components/booking/BookingWidget.tsx` | modify | Sesión → prefill + sección puntos + "Pagar con puntos" |
| `lib/booking-error.ts` | modify | `insufficient_points` |
| `supabase/config.toml` | modify | `enable_signup = true` (línea 180) |

## Verificación

- **Unit:** matemática de puntos (bordes de floor, convergencia multi-parcial,
  `cash+points === total`, `net+tax === cash`), matriz de `safeNext`/`resolveDestination`
  (probes open-redirect), `clampPoints`, validador de perfil.
- **Integración (`points.itest.ts`):** idempotencia de earn (webhook ×2 + RPC directo),
  carrera de canje (`Promise.all`, un ok y un `insufficient_points`, sin huérfanos,
  `points_balance === sum(ledger)`), confirmación $0 (sin tax_documents/payment_intents),
  retro idempotente (incluye `refunded` parcial), acumulación de claw-back en parciales
  (C=20000/P=5000: r1=6000 → revoca 300/repone 1500; r2=14000 → earn neto 0/repuesto 5000;
  replay r1 no-op), abandono + sweep + pago tardío (`late:`), releases de
  `cancel_unpaid_order`/`cancel_booking`, paridad SQL↔dominio, ownership A/B. Después:
  `npm run db:reset`.
- **Manual (Mailpit :54424):** signup e2e con retro, matriz de middleware, probe de
  open-redirect, hint anónimo en `/reservar` → login → vuelta, canje parcial vía MP
  sandbox, reserva 100% puntos sin MP, regresión de login admin.

## Checklist de deploy a prod (pasos de dashboard, NO cubiertos por git)

1. `supabase db push` (Vercel no aplica migraciones).
2. Dashboard → Auth → habilitar signups (config.toml solo afecta local).
3. Confirmar wildcard `https://www.fotfstudios.cl/**` en Redirect URLs (cubre `?next=`).
4. Reescribir templates **Magic Link** + **Confirm signup** en es-CL neutro (superficie
   compartida admin/cliente; el destino lo decide `?next=`, no el email).
5. SMTP propio para auth (Resend) o aceptar el límite por defecto (~2 emails/h) en soft launch.
6. Vercel: `NEXT_PUBLIC_ACCOUNT_ENABLED=true` (build-time → redeploy).
7. Smoke: signup con email nuevo + retro, regresión admin, canje real chico.

## Riesgos / notas

- **SII y puntos-como-descuento** (boleta = solo efectivo; $0 → sin boleta): consistente con
  la contabilidad del repo, pero **confirmar con el contador** — decisión de negocio.
- Orden de PRs: 1) auth + login + esqueleto (flag off = inerte), 2) backend de puntos,
  3) páginas + widget. Flag a prod recién con el PR 3 verificado.
