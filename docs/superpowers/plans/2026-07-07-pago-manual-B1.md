# Ciclo de pago de reservas manuales (Parte B1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una reserva manual puede crearse como **pendiente de pago** (cupo bloqueado en firme, sin la expiración de 10 min del checkout) y liquidarse después desde la ficha admin, ya sea marcándola pagada (efectivo/transferencia) o compartiendo un link de Mercado Pago que la marca pagada al cobrarse.

**Architecture:** Reutiliza la maquinaria existente. Una reserva manual pendiente = orden `pending_payment` + reserva `held` con `expires_at = NULL` (bloquea vía el GiST `reservations_no_overlap`, que filtra por `status` y no por `expires_at`). Un `p_ttl` nullable en `create_checkout` produce ese hold sin expiración. Los dos caminos de liquidación convergen en `confirm_payment` (offline vía `confirmOffline`; link vía `createPreferenceForOrder` → webhook). Un barrido nuevo `expire_abandoned_manual_holds` recupera las pendientes olvidadas (>72 h). La cortesía y el checkout del cliente quedan intactos.

**Tech Stack:** Next.js 15 · TypeScript · Supabase/Postgres (migraciones SQL) · Vitest (unit + `*.itest.ts`) · Mercado Pago.

## Global Constraints

- Gate antes de cada commit: `npx eslint .` y `npm run build` deben salir 0.
- `npm test` (unit) debe seguir verde (317 tests actuales) — sin regresiones.
- Integración: Supabase local (puertos 544xx). Flujo de migración: crear migración → `npm run db:reset` → `npm run test:integration`. `npm run db:reset` **después** de los itests para restaurar el seed, siempre.
- Reiniciar `npm run dev` tras `npm run build`.
- Migraciones nuevas con timestamp posterior a `20260707190000`; toda función con `set search_path = public, pg_temp`.
- Commits: Conventional Commits, identidad `FOTF Studios`; terminar cada mensaje con el trailer exacto `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Rama `feat/reschedule`; commit local, NO push.
- **Invariante:** el checkout del cliente y la cortesía NO cambian de comportamiento. La reserva manual pendiente bloquea el cupo en firme (GiST) y solo se libera al liquidarse o por el barrido de 72 h.
- **RBAC:** las acciones de liquidación reusan el permiso existente `reservations.create` (liquidar una reserva manual es continuación de crearla) — NO se agrega permiso nuevo, así que la paridad RBAC (`permissions.test.ts` = 10 keys, `rbac.itest.ts`) no cambia.

---

### Task 1: `create_checkout` con hold firme (TTL nullable)

**Contexto.** `create_checkout` (última def. en `supabase/migrations/20260707120000_order_terms_consent.sql:19-99`) crea la reserva `held` con `expires_at = now() + p_ttl` (`p_ttl interval default '10 minutes'`). `CreateCheckoutParams` no expone el TTL, así que hoy no hay forma de pedir un hold firme. Hacemos `p_ttl` nullable: `NULL → expires_at NULL` (hold que no expira; `expire_stale_holds` lo ignora porque `NULL < now()` es falso), y lo enhebramos por la capa app. El checkout del cliente no pasa TTL → default 10 min, sin cambios.

**Files:**
- Create: `supabase/migrations/20260707200000_checkout_null_ttl.sql`
- Modify: `src/application/ports/checkout.ts` (agregar `holdTtlMinutes?: number | null` a `CreateCheckoutParams`)
- Modify: `src/infrastructure/db/checkout-repository.ts` (pasar `p_ttl`)
- Modify: `src/application/checkout/checkout-service.ts` (aceptar `firmHold` en opts y propagarlo)
- Test: `src/infrastructure/db/reschedule.itest.ts` (o un nuevo `manual-pending.itest.ts`) — hold firme con `expires_at` NULL bloquea el slot

- [ ] **Step 1: itest RED — un hold con TTL NULL queda con `expires_at` NULL y bloquea el slot**

Crear `src/infrastructure/db/manual-pending.itest.ts` (mismo andamiaje que `reschedule.itest.ts`: `pg` client, `createServiceClient`, `resourceId` desde `resources`, `cleanup` truncando las mismas tablas, `futureDate`). Primer test:

```typescript
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { futureDate } from "@/tests/dates";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup = "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, reschedules cascade";
const MON = futureDate(1);
const startsAt = () => `${MON}T14:00:00-04:00`;
const endsAt = () => `${MON}T15:00:00-04:00`;

beforeAll(async () => { await pg.connect(); resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id; });
afterAll(async () => { await pg.query(cleanup); await pg.end(); });
beforeEach(async () => { await pg.query(cleanup); });

/** Llama create_checkout con p_ttl=NULL (hold firme). Firma según la migración: ver 20260707120000. */
async function firmCheckout() {
  const { rows } = await pg.query<{ order_id: string; reservation_id: string }>(
    `select * from create_checkout($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [resourceId, startsAt(), endsAt(), 9990, 8395, 1595, "CLP", "Manual", "m@e.cl", null,
     JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 9990, subtotal_clp: 9990 }]),
     null, "staff", null],
  );
  return rows[0];
}

describe("create_checkout con hold firme (p_ttl NULL)", () => {
  it("crea reserva held con expires_at NULL y orden pending_payment", async () => {
    const r = await firmCheckout();
    const res = await pg.query<{ status: string; expires_at: string | null }>(
      "select status, expires_at from reservations where id=$1", [r.reservation_id]);
    expect(res.rows[0]).toMatchObject({ status: "held", expires_at: null });
    expect((await pg.query<{ status: string }>("select status from orders where id=$1", [r.order_id])).rows[0].status).toBe("pending_payment");
  });

  it("el hold firme bloquea el slot vía GiST aunque no expire", async () => {
    await firmCheckout();
    await expect(firmCheckout()).rejects.toThrow(); // 23P01 exclusion_violation
  });
});
```

> **Nota para el implementer:** la firma exacta de `create_checkout` y el orden/tipos de sus parámetros están en `supabase/migrations/20260707120000_order_terms_consent.sql:19-99`. Ajustá la llamada `firmCheckout()` (número y orden de args, y cómo devuelve order/reservation ids) a esa firma real antes de correr. Si `create_checkout` no devuelve ambos ids en una fila, adaptá la lectura.

- [ ] **Step 2: Correr el itest y verificar que falla (RED)**

Run: `npm run test:integration -- manual-pending`
Expected: FAIL — hoy `p_ttl` no acepta NULL / la reserva sale con `expires_at = now()+10min`, no NULL. (Si falla por firma de args, corregí la llamada primero, luego confirmá el RED por el `expires_at`.)

- [ ] **Step 3: Migración — `create_checkout` con `p_ttl` nullable**

Crear `supabase/migrations/20260707200000_checkout_null_ttl.sql` como un `create or replace function create_checkout(...)` que **copia verbatim** el cuerpo actual (`20260707120000_order_terms_consent.sql:19-99`), cambiando SOLO el cálculo de `expires_at`:

```sql
-- B1: p_ttl nullable → hold firme (expires_at NULL) para reservas manuales pendientes.
-- El GiST bloquea por status (no por expires_at), y expire_stale_holds ignora NULL
-- (NULL < now() es falso), así que el hold no se auto-expira. El checkout del cliente
-- no pasa p_ttl → default '10 minutes', sin cambios. Cuerpo idéntico salvo expires_at.
create or replace function create_checkout(
  -- ... MISMA firma y parámetros que 20260707120000, con p_ttl interval default '10 minutes' ...
) returns ... language plpgsql set search_path = public, pg_temp as $$
...
begin
  perform expire_stale_holds(p_resource);
  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at, ...)
    values (p_resource, 'booking', 'held', p_starts, p_ends,
            case when p_ttl is null then null else now() + p_ttl end,   -- ← único cambio
            ...)
    returning id into v_res;
  ...  -- resto idéntico
end;
$$;
```

> **Implementer:** copiá el cuerpo completo real de `20260707120000_order_terms_consent.sql` y aplicá SOLO el cambio del `case when p_ttl is null`. No alteres ninguna otra línea (orden/lines/points/terms). Mantené la firma exacta.

- [ ] **Step 4: Aplicar la migración y verificar GREEN**

Run: `npm run db:reset` (aplica la migración) → `npm run test:integration -- manual-pending`
Expected: PASS (held + expires_at NULL; el segundo checkout aborta por GiST).

- [ ] **Step 5: Enhebrar el TTL por la capa app**

En `src/application/ports/checkout.ts`, agregar a `CreateCheckoutParams`:

```typescript
  /** TTL del hold. undefined → 10 min (checkout cliente); null → hold firme (manual pendiente). */
  holdTtlMinutes?: number | null;
```

En `src/infrastructure/db/checkout-repository.ts`, en la llamada `this.db.rpc("create_checkout", {...})`, agregar el arg `p_ttl`:

```typescript
      p_ttl: params.holdTtlMinutes === null ? null : `${params.holdTtlMinutes ?? 10} minutes`,
```

> **Implementer:** verificá el nombre real del parámetro RPC (`p_ttl`) y que Supabase lo serialice como interval string. Si el RPC ya recibía otros params por nombre, seguí ese estilo.

En `src/application/checkout/checkout-service.ts`, `createBooking` acepta `opts?: { enforceLeadTime?: boolean; firmHold?: boolean }`; cuando `opts.firmHold`, pasar `holdTtlMinutes: null` a `repo.createCheckout(...)`:

```typescript
        holdTtlMinutes: opts?.firmHold ? null : undefined,
```

- [ ] **Step 6: Gate + unit + commit**

Run: `npm run db:reset` (restaurar seed) · `npx eslint . && npm run build` · `npm test`
Expected: eslint 0, build 0, unit 317/317.

```bash
git add supabase/migrations/20260707200000_checkout_null_ttl.sql src/application/ports/checkout.ts \
  src/infrastructure/db/checkout-repository.ts src/application/checkout/checkout-service.ts \
  src/infrastructure/db/manual-pending.itest.ts
git commit -m "$(cat <<'EOF'
feat(reservas): create_checkout admite hold firme (p_ttl NULL)

Un p_ttl nullable produce una reserva held con expires_at NULL que bloquea el
cupo vía el GiST (que filtra por status, no por expires_at) sin auto-expirar.
Base para las reservas manuales pendientes de pago. El checkout del cliente
(sin p_ttl) mantiene el default de 10 min.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Barrido de holds manuales abandonados

**Contexto.** Un hold firme (expires_at NULL) nunca lo recupera `expire_stale_holds` (que solo mira `expires_at < now()`). Necesita un barrido propio que, tras 72 h sin pagar, cancele la orden y libere el cupo. Mirror de `expire_abandoned_reschedules` (`20260707140000_reschedule_charge.sql:117-131`) + `release_abandoned_redemptions`. Discriminador: orden `pending_payment` con reserva `held` y `expires_at IS NULL` (los holds del cliente tienen expiración de 10 min, no NULL; las cortesías son `confirmed` sin orden).

**Files:**
- Create: `supabase/migrations/20260707210000_expire_manual_holds.sql`
- Modify: `src/composition.ts` (wrapper `expireAbandonedManualHolds` + llamada en `reconcilePending`)
- Test: `src/infrastructure/db/manual-pending.itest.ts`

- [ ] **Step 1: itest RED — barre >72 h; respeta frescas y holds del cliente**

Agregar a `manual-pending.itest.ts`:

```typescript
describe("expire_abandoned_manual_holds", () => {
  it("cancela pendientes manuales >72 h (orden cancelled, reserva expired) y respeta frescas", async () => {
    const stale = await firmCheckout();
    await pg.query("update orders set created_at = now() - interval '73 hours' where id=$1", [stale.order_id]);
    // Otra reserva manual fresca en OTRO slot (no debe tocarse).
    const fresh = await pg.query<{ order_id: string; reservation_id: string }>(
      `select * from create_checkout($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)`,
      [resourceId, `${MON}T16:00:00-04:00`, `${MON}T17:00:00-04:00`, 9990, 8395, 1595, "CLP", "M2", "m2@e.cl", null,
       JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 9990, subtotal_clp: 9990 }]), null, "staff", null]);

    const n = await pg.query<{ n: number }>("select expire_abandoned_manual_holds() n");
    expect(Number(n.rows[0].n)).toBe(1);
    expect((await pg.query<{ status: string }>("select status from orders where id=$1", [stale.order_id])).rows[0].status).toBe("cancelled");
    expect((await pg.query<{ status: string }>("select status from reservations where id=$1", [stale.reservation_id])).rows[0].status).toBe("expired");
    // La fresca queda intacta.
    expect((await pg.query<{ status: string }>("select status from orders where id=$1", [fresh.rows[0].order_id])).rows[0].status).toBe("pending_payment");
  });
});
```

> **Implementer:** ajustá la llamada `create_checkout` de la reserva fresca a la firma real (igual que `firmCheckout`, con distinto horario). Confirmá el nombre de columna `created_at` en `orders`.

- [ ] **Step 2: Correr y verificar RED**

Run: `npm run test:integration -- manual-pending`
Expected: FAIL — `function expire_abandoned_manual_holds() does not exist`.

- [ ] **Step 3: Migración del barrido**

Crear `supabase/migrations/20260707210000_expire_manual_holds.sql`:

```sql
-- B1: barre reservas manuales pendientes abandonadas (hold firme, expires_at NULL) tras
-- p_older_than sin pagar → cancel_unpaid_order (reserva 'expired' + orden 'cancelled').
-- Discriminador: orden pending_payment con reserva held y expires_at IS NULL. No toca los
-- holds del cliente (expiración de 10 min, no NULL) ni cortesías (confirmed, sin orden).
create function expire_abandoned_manual_holds(p_older_than interval default '72 hours')
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_count int := 0; r record;
begin
  for r in
    select o.id from orders o
      where o.status = 'pending_payment'
        and o.created_at < now() - p_older_than
        and exists (
          select 1 from reservations res
          where res.order_id = o.id and res.status = 'held' and res.expires_at is null
        )
  loop
    perform cancel_unpaid_order(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
```

- [ ] **Step 4: Aplicar y verificar GREEN**

Run: `npm run db:reset` → `npm run test:integration -- manual-pending`
Expected: PASS (stale barrido; fresca intacta).

- [ ] **Step 5: Wrapper + wiring en el reconcile**

En `src/composition.ts`, agregar (junto a `expireAbandonedReschedules`, líneas 187-191):

```typescript
/** Barre reservas manuales pendientes abandonadas (>72 h sin pagar). */
export async function expireAbandonedManualHolds(client: SupabaseClient<Database> = db()): Promise<number> {
  const { data } = await client.rpc("expire_abandoned_manual_holds");
  return data ?? 0;
}
```

Y dentro de `reconcilePending` (tras la llamada a `expireAbandonedReschedules`, línea 134):

```typescript
  await expireAbandonedManualHolds(client).catch((e) => console.error("[reconcile:manual-holds]", e));
```

- [ ] **Step 6: Gate + commit**

Run: `npm run db:reset` · `npx eslint . && npm run build` · `npm test`

```bash
git add supabase/migrations/20260707210000_expire_manual_holds.sql src/composition.ts src/infrastructure/db/manual-pending.itest.ts
git commit -m "$(cat <<'EOF'
feat(reservas): barrido de reservas manuales pendientes abandonadas (72 h)

expire_abandoned_manual_holds cancela las órdenes pending_payment con hold
firme (expires_at NULL) más viejas que 72 h y libera el cupo, vía
cancel_unpaid_order. Cableado en el cron de reconcile. No toca holds de
cliente (expiración 10 min) ni cortesías.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Método de creación "pendiente"

**Contexto.** Hoy el método manual es cortesia/efectivo/transferencia y los pagos offline liquidan en el mismo submit. Agregamos **"pendiente"**: crea la reserva con hold firme y orden `pending_payment`, sin confirmar. Efectivo/transferencia siguen siendo el atajo "pagar ahora" (walk-in). Cortesía intacta.

**Files:**
- Modify: `lib/manual-booking.ts` (`MANUAL_METHODS` += `"pendiente"`; validación)
- Modify: `app/admin/(panel)/reservas/nueva/actions.ts` (rama pendiente)
- Modify: `app/admin/(panel)/reservas/nueva/_components/CobroCard.tsx` (opción + copy)
- Modify: `app/admin/(panel)/reservas/nueva/_components/BookingConsole.tsx` (CTA/estado según pendiente)
- Modify: `app/admin/(panel)/reservas/nueva/_components/SuccessPanel.tsx` (mensaje pendiente)
- Test: `app/admin/(panel)/reservas/nueva/*.test.ts` (unit de validación) + `manual-pending.itest.ts`

- [ ] **Step 1: unit RED — `validateManualBooking` acepta "pendiente"**

En el test de `lib/manual-booking.ts` (buscar `manual-booking.test.ts`; si no existe, crearlo), agregar:

```typescript
it("acepta el método 'pendiente'", () => {
  const r = validateManualBooking({ date: "2026-08-01", startMinute: 600, durationHours: 1, method: "pendiente", addonKeys: [], customer: { email: "a@b.cl" } });
  expect(r.ok).toBe(true);
});
```

Run: `npm test -- manual-booking` → FAIL (método no permitido).

- [ ] **Step 2: Ampliar `MANUAL_METHODS`**

En `lib/manual-booking.ts`, agregar `"pendiente"` a `MANUAL_METHODS` (queda `["pendiente","efectivo","transferencia","cortesia"]`). Correr `npm test -- manual-booking` → PASS.

- [ ] **Step 3: itest RED — crear pendiente deja orden pending + held NULL + sin boleta**

Este camino se prueba mejor en la capa itest a través del `CheckoutService` (que la acción usa). Agregar a `manual-pending.itest.ts` un test que use `CheckoutService.createBooking(..., { enforceLeadTime: false, firmHold: true })` (import como en `reschedule.itest.ts`) y verifique: orden `pending_payment`, reserva `held` con `expires_at` NULL, **sin** `tax_documents` (no confirmada):

```typescript
it("createBooking con firmHold deja pending_payment + held NULL, sin boleta", async () => {
  const svc = new CheckoutService(new PricingService(new SupabaseRatePlanRepository(db)), new SupabaseCheckoutRepository(db));
  const b = await svc.createBooking(
    { resourceId, date: MON, startMinute: 840, durationHours: 1, customer: { email: "p@e.cl" } },
    { enforceLeadTime: false, firmHold: true });
  if (!b.ok) throw new Error(b.error);
  const o = await pg.query<{ status: string }>("select status from orders where id=$1", [b.value.orderId]);
  expect(o.rows[0].status).toBe("pending_payment");
  const res = await pg.query<{ status: string; expires_at: string | null }>(
    "select status, expires_at from reservations where order_id=$1", [b.value.orderId]);
  expect(res.rows[0]).toMatchObject({ status: "held", expires_at: null });
  expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1", [b.value.orderId])).rows[0].n).toBe("0");
});
```

Run: `npm run test:integration -- manual-pending` → PASS (Task 1 ya habilitó `firmHold`; este test fija el contrato de "pendiente" a nivel servicio como regresión).

- [ ] **Step 4: Rama "pendiente" en la acción**

En `app/admin/(panel)/reservas/nueva/actions.ts`, dentro de `createManualBookingAction`, antes de la rama offline (líneas 76+), agregar la rama pendiente (crea con `firmHold`, NO confirma):

```typescript
    // Pendiente de pago: crea la reserva con hold firme y orden pending_payment; se
    // liquida después desde la ficha (marcar pagado / link MP). Sin confirmar, sin boleta.
    if (method === "pendiente") {
      const attested = input.termsAccepted === true;
      const booking = await checkoutService().createBooking(
        {
          resourceId: resource.id, date, startMinute, durationHours, addonKeys, customer,
          ...(attested ? { termsSource: "staff" as const, termsVersion: TERMS_VERSION } : {}),
        },
        { enforceLeadTime: false, firmHold: true },
      );
      if (!booking.ok) throw new Error(checkoutErrorMessage(booking.error));
      const reservationId = await repo.setNotesForOrder(booking.value.orderId, notes || null).catch(() => null);
      revalidatePath("/admin/reservas");
      return { reservationId, orderId: booking.value.orderId, amount: booking.value.amount };
    }
```

(La rama offline existente queda igual, para efectivo/transferencia "pagar ahora".)

- [ ] **Step 5: UI — CobroCard + BookingConsole + SuccessPanel**

En `CobroCard.tsx`, agregar la opción `{ key: "pendiente", label: "Pendiente" }` como PRIMERA en `METHODS` (queda default). Ajustar el CTA y el footer: para `pendiente`, CTA "Crear pendiente"/"Creando…" y footer "Sin cobro ahora · se liquida después (efectivo/transferencia o link de pago)."

En `BookingConsole.tsx`: el default `useState<ManualPaymentMethod>("pendiente")`; `canSubmit` para pendiente igual que offline (requiere `quote !== null`, ya que hay cobro). En `SuccessPanel.tsx` (o su composición en `BookingConsole`): cuando el resultado es pendiente (orderId presente pero no se confirmó), el mensaje/WhatsApp dice "Reserva creada, pendiente de pago" y enlaza a `/admin/reservas/${reservationId}` para liquidarla.

> **Implementer:** seguí el patrón exacto de la barra de métodos (`role="radiogroup"`, `CobroCard.tsx:122-137`) y del CTA (`CobroCard.tsx:157-175`). El tipo `ManualPaymentMethod` sale de `MANUAL_METHODS`. No dupliques lógica: reusá el mismo submit de `BookingConsole` (solo cambia el `method` enviado).

- [ ] **Step 6: Gate + unit + commit**

Run: `npm run db:reset` · `npx eslint . && npm run build` · `npm test`

```bash
git add lib/manual-booking.ts "app/admin/(panel)/reservas/nueva/actions.ts" \
  "app/admin/(panel)/reservas/nueva/_components/CobroCard.tsx" \
  "app/admin/(panel)/reservas/nueva/_components/BookingConsole.tsx" \
  "app/admin/(panel)/reservas/nueva/_components/SuccessPanel.tsx" \
  lib/manual-booking.test.ts src/infrastructure/db/manual-pending.itest.ts
git commit -m "$(cat <<'EOF'
feat(reservas): método de creación manual "pendiente" (cobrar después)

Una reserva manual puede crearse pendiente: hold firme + orden pending_payment,
sin confirmar ni emitir boleta. Efectivo/transferencia siguen liquidando en el
acto (walk-in); cortesía intacta.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Liquidación desde la ficha — tarjeta "Cobro"

**Contexto.** En la ficha de una reserva con orden `pending_payment`, el admin liquida marcando pagado (efectivo/transferencia → `confirmOffline`) o compartiendo un link MP (`createPreferenceForOrder` → el webhook confirma). `confirm_payment` es idempotente (`where status <> 'paid'`): si el cliente paga el link justo cuando el admin marca efectivo, gana el primero, sin doble boleta.

**Files:**
- Modify: `app/admin/(panel)/reservas/[id]/actions.ts` (`markPaidOfflineAction`, `sharePaymentLinkAction`)
- Modify: `app/admin/(panel)/reservas/[id]/page.tsx` (tarjeta "Cobro" cuando pending)
- Create: `app/admin/(panel)/reservas/[id]/_components/CobroPendiente.tsx` (client: picker + link + WhatsApp)
- Test: `app/admin/(panel)/reservas/[id]/*.test.ts` o `manual-pending.itest.ts` (convergencia idempotente)

- [ ] **Step 1: itest RED — offline y link convergen en confirm_payment sin doble boleta**

Agregar a `manual-pending.itest.ts` (a nivel RPC, que es donde vive la idempotencia):

```typescript
describe("liquidación idempotente de una pendiente", () => {
  it("marcar pagado y luego 'pagar el link' → una sola confirmación, una sola boleta", async () => {
    const r = await firmCheckout(); // pending + held NULL
    // 1) Marcar pagado offline.
    expect(await pg.query<{ c: string }>("select confirm_payment($1,$2) c", [r.order_id, "offline:efectivo"])).toBeTruthy();
    // 2) El "pago del link" llega después (confirm_payment de nuevo, otro payment id).
    await pg.query("select confirm_payment($1,$2)", [r.order_id, "mp_123"]);
    const o = await pg.query<{ status: string; pid: string }>("select status, mp_payment_id pid from orders where id=$1", [r.order_id]);
    expect(o.rows[0].status).toBe("paid");
    expect(o.rows[0].pid).toBe("offline:efectivo"); // gana el primero (where status <> 'paid')
    expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='boleta'", [r.order_id])).rows[0].n).toBe("1");
  });
});
```

Run: `npm run test:integration -- manual-pending` → PASS de inmediato (fija la idempotencia existente de `confirm_payment` como garantía del diseño de liquidación; es un characterization test — declaralo así en el commit).

- [ ] **Step 2: Acciones de liquidación**

En `app/admin/(panel)/reservas/[id]/actions.ts`, agregar (siguiendo el patrón de `markAccessAction` para el `run()`/FormData y de `miembros/actions.ts` para el host):

```typescript
export async function markPaidOfflineAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.create");
    const reservationId = str(fd, "reservationId");
    const method = str(fd, "method");
    if (method !== "efectivo" && method !== "transferencia") throw new Error("Método inválido.");
    const order = await adminRepository().orderForReservation(reservationId);
    if (!order || order.status !== "pending_payment") throw new Error("La reserva no está pendiente de pago.");
    const status = await adminRepository().confirmOffline(order.orderId, method);
    if (status !== "confirmed") throw new Error("No se pudo registrar el pago (el cupo pudo expirar).");
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

export async function sharePaymentLinkAction(reservationId: string): Promise<ActionDataResult<{ initPoint: string; amount: number }>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    const order = await adminRepository().orderForReservation(reservationId);
    if (!order || order.status !== "pending_payment") throw new Error("La reserva no está pendiente de pago.");
    const host = hostFromHeaders(await headers());
    const pref = await paymentService(db(), host).createPreferenceForOrder(order.orderId, { expiresInMinutes: 72 * 60 });
    if (!pref.ok) throw new Error(pref.error);
    return { initPoint: pref.value.initPoint, amount: order.amountClp };
  });
}
```

> **Implementer:** agregá los imports que falten (`headers` de `next/headers`, `hostFromHeaders` de `@/lib/urls`, `db`/`paymentService` de `@/src/composition`, `ActionResult`/`ActionDataResult`/`run`/`runData`). Confirmá que `orderForReservation` devuelve `{ orderId, status, amountClp }` (`admin-repository.ts:619-649`).

- [ ] **Step 3: Componente cliente `CobroPendiente`**

Crear `app/admin/(panel)/reservas/[id]/_components/CobroPendiente.tsx` (client). Combina:
- Un `<ActionForm action={markPaidOfflineAction} success="Pago registrado.">` con `<input type="hidden" name="reservationId">` y un `role="radiogroup"` efectivo/transferencia (mismo patrón visual que `CobroCard`), + `SubmitButton` "Marcar pagado".
- Un botón "Generar link de pago" que llama `sharePaymentLinkAction(reservationId)` vía `useTransition`; al volver `{ initPoint, amount }`, renderiza "Abrir link de pago" (`<a href={initPoint} target="_blank">`) + "Enviar por WhatsApp" vía `waLink(customerPhone, msg)` (patrón exacto de `RescheduleDialog.tsx:333-359`), con fallback "sin teléfono; copia el link" y un `CopyButton`.

Props: `{ reservationId: string; amount: number; customerPhone: string | null }`.

> **Implementer:** el template exacto del bloque de link + WhatsApp es `RescheduleDialog.tsx:333-359`. `waLink` sale de `@/lib/whatsapp` y devuelve `null` si el teléfono no es válido — manejá ese caso.

- [ ] **Step 4: Tarjeta "Cobro" en la ficha**

En `app/admin/(panel)/reservas/[id]/page.tsx`, justo después de la tarjeta "Pago" (líneas 266-274), agregar:

```tsx
          {b.orderId && b.orderStatus === "pending_payment" && b.status !== "cancelled" && (
            <Card title="Cobro">
              <p className="text-sm leading-relaxed text-bone-dim">
                Reserva pendiente de pago. Márcala pagada (efectivo/transferencia) o comparte un link de Mercado Pago.
              </p>
              <div className="mt-4">
                <CobroPendiente reservationId={b.id} amount={b.amount ?? 0} customerPhone={b.customerPhone} />
              </div>
            </Card>
          )}
```

Importar `CobroPendiente`. (La tarjeta "Zona de peligro" ya cubre cancelar una pendiente vía el `ConfirmForm` existente — no cambia.)

- [ ] **Step 5: Verificación en el browser (local-first)**

Con dev corriendo y Supabase local: crear una reserva manual **pendiente** desde `/admin/reservas/nueva`; abrir su ficha; verificar la tarjeta "Cobro". Probar (a) "Marcar pagado" (efectivo) → la orden pasa a pagada, aparece la boleta, el timeline registra "Pago confirmado · efectivo (manual)", la tarjeta "Cobro" desaparece; y (b) en otra pendiente, "Generar link de pago" → se abre el link MP y el botón de WhatsApp arma el mensaje. (El cobro real por el túnel MP es opcional; la confirmación por webhook ya está cubierta por el flujo existente.)

- [ ] **Step 6: Gate + commit**

Run: `npm run db:reset` (si corriste itests) · `npx eslint . && npm run build` · reiniciar `npm run dev`

```bash
git add "app/admin/(panel)/reservas/[id]/actions.ts" "app/admin/(panel)/reservas/[id]/page.tsx" \
  "app/admin/(panel)/reservas/[id]/_components/CobroPendiente.tsx" src/infrastructure/db/manual-pending.itest.ts
git commit -m "$(cat <<'EOF'
feat(reservas): liquidar una reserva pendiente desde la ficha (Cobro)

Tarjeta "Cobro" cuando la orden está pending_payment: marcar pagado
(efectivo/transferencia → confirm_payment) o compartir un link de Mercado
Pago (createPreferenceForOrder → el webhook confirma). Idempotente: gana la
primera liquidación, sin doble boleta. Reusa el permiso reservations.create.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review (cobertura del spec B1)

- **Estado/cupo** (orden pending + held firme, GiST bloquea, sin auto-expirar) → Task 1. ✓
- **Barrido 72 h** → Task 2. ✓
- **Crear pendiente** (método nuevo, sin confirmar) → Task 3. ✓
- **Liquidación offline / link, convergen en confirm_payment idempotente** → Task 4. ✓
- **UX creación (pendiente default + atajo pagar-ahora)** → Task 3 (CobroCard + rama offline existente). ✓
- **RBAC** (reusa `reservations.create`, sin cambio de paridad) → Global Constraints + Task 4. ✓
- **Fuera de alcance B1:** el arreglo #4 (pago partido) va en su propio plan (Parte B2); el cobro real E2E por túnel MP es verificación manual opcional.
