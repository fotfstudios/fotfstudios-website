# Reagendamiento money-safety/SII (Parte A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los tres defectos money-safety/SII confirmados en los caminos de reagendamiento: A1 (reembolso sin reparación en el "más barato"), A2 (boletas apiladas en el "más caro"), A3 (nota de crédito espuria de $0 en slot_taken).

**Architecture:** Arquitectura hexagonal existente. A1 es un reordenamiento en la capa de aplicación (`RescheduleService`): sembrar el asiento en la DB **antes** del reembolso irreversible en MP. A2 y A3 son cambios a funciones Postgres vía nuevas migraciones `create or replace`. Las tres se prueban TDD: A1 en la capa unit de servicio, A2/A3 en la capa itest de RPC (+ unit de webhook para A3).

**Tech Stack:** Next.js 15 · TypeScript · Supabase (Postgres, migraciones SQL) · Vitest (unit + `*.itest.ts`) · `pg` para itests.

## Global Constraints

- **Gate obligatorio antes de cada commit:** `npx eslint .` y `npm run build` deben salir 0. (CLAUDE.md)
- **Tests unit:** `npm test` (vitest run) — no debe romper ninguno de los 317 existentes.
- **Tests de integración:** requieren Supabase local (`npm run db:start`, puertos 544xx: API 54421, DB 54422). Flujo de migración: crear migración → `npm run db:reset` → `npm run db:types` → `npm run test:integration`.
- **Restaurar seed:** los itests truncan tablas transaccionales. Correr `npm run db:reset` **después** de los itests, siempre. (memoria `restore-seed-after-tests`)
- **Reiniciar dev** tras `npm run build` (reescribe `.next`).
- **Commits:** Conventional Commits, identidad `FOTF Studios <292203776+fotfstudios@users.noreply.github.com>`, trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Rama `feat/reschedule` (no push directo a `main`; el usuario abre PR).
- **Invariantes a preservar:** **I1** una sola boleta viva por pedido = `amount_clp − refunded_amount_clp`; **I2** MP nunca se ejecuta antes de que el asiento DB esté durable, salvo compensación recuperable.
- **Migraciones nuevas** con timestamp posterior a `20260707160000`; toda función con `set search_path = public, pg_temp`.

---

### Task 1: A1 — `reschedule_down` sembrar-primero (reembolso al final)

**Contexto.** Hoy `RescheduleService.reschedule` (camino "más barato" con pago MP real) hace
`refundPayment` (MP, irreversible) → `recordEvent` (inbox) → `settleDown` (asiento, abortable por
GiST). Si el asiento aborta, la plata ya salió y el inbox suprime el webhook. **Fix:** invertir a
`settleDown` (siembra, aborta limpio sin tocar plata) → `refundPayment` → `recordEvent` →
`setRefundId`. El caso offline no cambia (sin MP, un solo `settleDown`).

**Files:**
- Modify: `src/application/ports/reschedule.ts` (hacer `refundId` nullable en `RescheduleSettleDownParams`; agregar `setRefundId` a `ReschedulePort`)
- Modify: `src/application/admin/reschedule-service.ts:102-116` (reordenar el bloque `delta.kind === "refund"`)
- Modify: `src/infrastructure/db/reschedule-repository.ts` (implementar `setRefundId`)
- Test: `src/application/admin/reschedule-service.test.ts:101-151` (reordenar aserciones; nuevo test slot-taken)
- Test: `src/infrastructure/db/reschedule.itest.ts` (nuevo caso: `reschedule_down` con `p_refund_id` NULL siembra bien)

**Interfaces:**
- Consumes: `ReschedulePort.settleDown(p: RescheduleSettleDownParams)`, `PaymentGateway.refundPayment(id, amount)`, `RescheduleInbox.recordEvent(key, type, payload)`.
- Produces: `RescheduleSettleDownParams.refundId: string | null`; `ReschedulePort.setRefundId(orderId: string, refundId: string): Promise<void>`.

- [ ] **Step 1: Reescribir el test de orden a sembrar-primero (RED)**

En `src/application/admin/reschedule-service.test.ts`, reemplazar el test "más barato con pago MP" (líneas 101-122) por:

```typescript
  it("más barato con pago MP → settleDown PRIMERO → refund → inbox → setRefundId (en ese orden)", async () => {
    const calls: string[] = [];
    const gw = makeGateway({
      refundPayment: vi.fn(async () => {
        calls.push("refund");
        return { id: "ref_9", status: "approved", amount: 2000 };
      }),
    });
    const inbox = makeInbox({ recordEvent: vi.fn(async () => { calls.push("record"); return true; }) });
    const repo = makeRepo(CTX);
    (repo.settleDown as ReturnType<typeof vi.fn>).mockImplementation(async () => { calls.push("settle"); });
    (repo.setRefundId as ReturnType<typeof vi.fn>).mockImplementation(async () => { calls.push("setRefundId"); });

    const { service } = svc({ pricing: makePricing(7990), gw, repo, inbox });
    const res = await service.reschedule(input);

    expect(res.ok && res.value).toEqual({ kind: "refunded", amount: 2000, offline: false });
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_123", 2000);
    expect(inbox.recordEvent).toHaveBeenCalledWith("refund:ref_9", "refund", expect.anything());
    expect(repo.setRefundId).toHaveBeenCalledWith("o1", "ref_9");
    const settle = (repo.settleDown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(settle).toMatchObject({ refundId: null, refundAmount: 2000 });
    expect(calls).toEqual(["settle", "refund", "record", "setRefundId"]); // asiento → MP → inbox → id
  });
```

Reemplazar el test "más barato + MP falla → aborta, sin asiento" (líneas 145-151) por el invariante de money-safety invertido:

```typescript
  it("más barato + slot tomado en la siembra (settleDown lanza) → NO se reembolsa en MP", async () => {
    const repo = makeRepo(CTX);
    (repo.settleDown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Ese horario ya está tomado."));
    const gw = makeGateway();
    const { service } = svc({ pricing: makePricing(7990), gw, repo });
    await expect(service.reschedule(input)).rejects.toThrow("Ese horario ya está tomado.");
    expect(gw.refundPayment).not.toHaveBeenCalled(); // I2: nada de plata si el asiento aborta
  });
```

Actualizar el test "loopback ganó" (líneas 136-143): con sembrar-primero el asiento YA ocurrió antes del inbox, así que ahora `settleDown` SÍ se llamó y `setRefundId` NO:

```typescript
  it("más barato + loopback ganó (recordEvent→false) tras el asiento → refund_looped_back", async () => {
    const inbox = makeInbox({ recordEvent: vi.fn(async () => false) });
    const repo = makeRepo(CTX);
    const { service } = svc({ pricing: makePricing(7990), repo, inbox });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toEqual({ kind: "refund_looped_back" });
    expect(repo.settleDown).toHaveBeenCalledOnce(); // el asiento ya ocurrió (siembra-primero)
    expect(repo.setRefundId).not.toHaveBeenCalled();
  });
```

Agregar `setRefundId` al mock `makeRepo` (líneas 39-47):

```typescript
function makeRepo(ctx: RescheduleContext | null): ReschedulePort {
  return {
    loadContext: vi.fn(async () => ctx),
    moveEqual: vi.fn(async () => {}),
    settleDown: vi.fn(async () => {}),
    setRefundId: vi.fn(async () => {}),
    createCharge: vi.fn(async () => ({ rescheduleId: "rs1", deltaOrderId: "do1" })),
    moveCourtesy: vi.fn(async () => {}),
  };
}
```

- [ ] **Step 2: Correr los tests unit y verificar que fallan (RED)**

Run: `npm test -- reschedule-service`
Expected: FAIL — `repo.setRefundId is not a function` / el orden `["settle","refund","record","setRefundId"]` no coincide (aún es refund-first) / `TS2339` en `settleDown({ refundId: null })` (aún es `string`).

- [ ] **Step 3: Ampliar el puerto — `refundId` nullable + `setRefundId`**

En `src/application/ports/reschedule.ts`, cambiar `RescheduleSettleDownParams.refundId` a nullable y agregar el método al puerto:

```typescript
export interface RescheduleSettleDownParams extends RescheduleMoveParams {
  refundId: string | null;
  refundAmount: number;
}
```

En la interfaz `ReschedulePort`, agregar tras `settleDown`:

```typescript
  /** Fija el mp_refund_id en la orden tras un reembolso MP exitoso (post-siembra). */
  setRefundId(orderId: string, refundId: string): Promise<void>;
```

- [ ] **Step 4: Reordenar el servicio a sembrar-primero**

En `src/application/admin/reschedule-service.ts`, reemplazar el bloque `if (delta.kind === "refund") { ... }` (líneas 102-116) por:

```typescript
    if (delta.kind === "refund") {
      // Pago offline: sin MP y sin inbox (la devolución física la hace el dueño).
      if (!isRealMpPayment(ctx.order.mpPaymentId)) {
        await this.repo.settleDown({ ...base, refundId: "offline:reschedule", refundAmount: delta.amount });
        return ok({ kind: "refunded", amount: delta.amount, offline: true });
      }
      // MP real — I2: SEMBRAR primero (el asiento aborta limpio por GiST si el slot se
      // tomó en la carrera, SIN tocar plata), y recién con el asiento firme reembolsar.
      await this.repo.settleDown({ ...base, refundId: null, refundAmount: delta.amount });
      const refund = await this.gateway.refundPayment(ctx.order.mpPaymentId, delta.amount);
      // Reclamar el inbox para que el loopback de ESTE reembolso dedupee (no cancele el
      // booking ya movido). Si el loopback ganó la ventana (raro), se avisa para revisión.
      const fresh = await this.inbox.recordEvent(`refund:${refund.id}`, "refund", refund);
      if (!fresh) return ok({ kind: "refund_looped_back" });
      await this.repo.setRefundId(ctx.order.id, refund.id);
      return ok({ kind: "refunded", amount: delta.amount, offline: false });
    }
```

Actualizar el comentario de clase (líneas 44-47) para reflejar el nuevo orden:

```typescript
 * Orden money-safety: en el camino MP real el asiento (reschedule_down) va PRIMERO
 * —aborta limpio por GiST sin tocar plata—, luego el reembolso irreversible en MP, y
 * el inbox reclama el refund id para que el webhook loopback no cancele el booking vivo.
```

- [ ] **Step 5: Implementar `setRefundId` en el repositorio**

En `src/infrastructure/db/reschedule-repository.ts`, agregar el método a `SupabaseRescheduleRepository` (tras `settleDown`):

```typescript
  async setRefundId(orderId: string, refundId: string): Promise<void> {
    const { error } = await this.db.from("orders").update({ mp_refund_id: refundId }).eq("id", orderId);
    if (error) throw new Error(rescheduleError(error.message));
  }
```

- [ ] **Step 6: Correr los tests unit y verificar que pasan (GREEN)**

Run: `npm test -- reschedule-service`
Expected: PASS (todos los casos, incl. el nuevo orden y el invariante de money-safety).

- [ ] **Step 7: Gate y commit**

Run: `npx eslint . && npm run build`
Expected: exit 0 en ambos.

```bash
git add src/application/ports/reschedule.ts src/application/admin/reschedule-service.ts \
  src/infrastructure/db/reschedule-repository.ts src/application/admin/reschedule-service.test.ts
git commit -m "$(cat <<'EOF'
fix(reservas): reagendar más barato siembra antes de reembolsar (money-safety)

El asiento (reschedule_down) va primero: aborta limpio por GiST si el slot se
tomó en la carrera, SIN tocar plata. Recién con el asiento firme se reembolsa
en MP y el inbox reclama el refund id. Elimina el escenario "plata afuera sin
registro" y el doble reembolso al reintentar.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: itest — `reschedule_down` con `p_refund_id` NULL siembra correctamente (RED)**

En `src/infrastructure/db/reschedule.itest.ts`, dentro de `describe("reschedule_down (refund delta)")`, agregar:

```typescript
  it("con p_refund_id NULL (siembra-primero) mueve + NC + boleta del saldo, mp_refund_id queda null", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pd3");
    await pg.query("select reschedule_down($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [
      reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, null, 2000, null,
    ]);
    const o = await pg.query<{ status: string; refunded: number; refund_id: string | null }>(
      "select status, refunded_amount_clp refunded, mp_refund_id refund_id from orders where id=$1", [orderId]);
    expect(o.rows[0]).toMatchObject({ status: "paid", refunded: 2000, refund_id: null });
    const docs = await pg.query<{ kind: string; total: number }>("select kind, total from tax_documents where order_id=$1", [orderId]);
    expect(docs.rows.filter((d) => d.kind === "nota_credito").map((d) => d.total)).toContain(9990);
    expect(docs.rows.filter((d) => d.kind === "boleta").map((d) => d.total)).toContain(7990);
  });
```

Run: `npm run db:start` (si no corre) y luego `npm run test:integration -- reschedule`
Expected: PASS de inmediato — `reschedule_down` ya hace `coalesce(p_refund_id, mp_refund_id)`, así que NULL siembra bien. (Este itest fija la garantía como regresión; no requiere cambio de SQL.)

- [ ] **Step 9: Restaurar seed y commit del itest**

Run: `npm run db:reset`  (restaura el seed que el itest truncó)

```bash
git add src/infrastructure/db/reschedule.itest.ts
git commit -m "$(cat <<'EOF'
test(reservas): reschedule_down con refund_id NULL siembra sin fijar mp_refund_id

Fija como regresión el contrato de la siembra-primero: el asiento contable
(NC + boleta del saldo, refunded acumulado) no depende del refund id, que se
fija recién tras el reembolso MP exitoso.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: A2 — Consolidar boletas en el encarecimiento (slot libre)

**Contexto.** `apply_reschedule_charge` (slot libre) apila una boleta incremental por el delta sobre
la orden original, dejando 2 boletas y rompiendo I1. **Fix:** en vez de apilar, anular la boleta viva
anterior con una NC y re-emitir una boleta por el nuevo total (como hace `reschedule_down`). Se emite
NC ANTES de sumar el delta a `amount_clp` (para que el ratio neto/IVA reverse exacto la boleta vieja),
y la boleta nueva DESPUÉS (para que el ratio dé el nuevo total).

**Files:**
- Create: `supabase/migrations/20260707170000_reschedule_charge_consolidate_boleta.sql`
- Test: `src/infrastructure/db/reschedule.itest.ts:170-228` (actualizar aserciones de boletas)

**Interfaces:**
- Consumes: `create_nota_credito_amount(order, total)`, `create_boleta_amount(order, total)` (existentes).
- Produces: `apply_reschedule_charge` (misma firma; cuerpo slot-libre modificado).

- [ ] **Step 1: Actualizar los itests del encarecimiento a la consolidación (RED)**

En `src/infrastructure/db/reschedule.itest.ts`, en el test "create_reschedule_charge NO mueve... apply (slot libre) la mueve y dobla el delta" (líneas 196-197), reemplazar la aserción de boleta incremental por la del set consolidado:

```typescript
    const docs = await pg.query<{ kind: string; total: number }>("select kind, total from tax_documents where order_id=$1 order by created_at", [orderId]);
    // Consolidación: boleta vieja 9990, NC 9990 que la anula, boleta nueva 12990 (= live).
    expect(docs.rows.filter((d) => d.kind === "boleta").map((d) => d.total).sort()).toEqual([9990, 12990]);
    expect(docs.rows.filter((d) => d.kind === "nota_credito").map((d) => d.total)).toEqual([9990]);
```

En el test "apply repetido → noop" (líneas 226-227), la boleta viva pasa a ser 12990 y no debe duplicarse:

```typescript
    expect((await pg.query<{ amount: number }>("select amount_clp amount from orders where id=$1", [orderId])).rows[0].amount).toBe(12990); // no doblado
    expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='boleta' and total=12990", [orderId])).rows[0].n).toBe("1");
```

Agregar un test que fija el invariante I1 (una NC posterior calza con la boleta viva):

```typescript
  it("tras el encarecimiento, un mark_refunded posterior emite NC que calza con la boleta viva (12990)", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "cinv");
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select apply_reschedule_charge($1,$2)", [c.rows[0].delta_order_id, "mp_inv"]);
    await pg.query("select mark_refunded($1,$2,$3)", [orderId, "mp_ref_inv", 12990]);
    const ncs = await pg.query<{ total: number }>("select total from tax_documents where order_id=$1 and kind='nota_credito' order by created_at", [orderId]);
    // Dos NC: la de consolidación (9990) y la del reembolso total posterior (12990, = boleta viva).
    expect(ncs.rows.map((d) => d.total)).toEqual([9990, 12990]);
  });
```

- [ ] **Step 2: Correr el itest y verificar que falla (RED)**

Run: `npm run test:integration -- reschedule`
Expected: FAIL — hoy hay una boleta incremental de 3000 y ninguna NC en el slot-libre; las nuevas aserciones (boletas [9990,12990], NC [9990]) no se cumplen.

- [ ] **Step 3: Crear la migración de consolidación**

Crear `supabase/migrations/20260707170000_reschedule_charge_consolidate_boleta.sql`:

```sql
-- A2: el encarecimiento (apply_reschedule_charge, slot libre) consolida en vez de apilar.
-- Antes: sumaba el delta a amount_clp e insertaba una boleta incremental → 2 boletas vivas,
-- rompiendo el invariante "una sola boleta viva = amount − refunded" (I1). Ahora anula la
-- boleta viva anterior con una NC y re-emite una boleta por el nuevo total, igual que
-- reschedule_down. El resto de la función (slot tomado, earn, estados) queda idéntico.
create or replace function apply_reschedule_charge(p_delta_order uuid, p_payment_id text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_resched uuid; v_reservation uuid; v_order uuid;
  v_starts timestamptz; v_ends timestamptz; v_delta int; v_snapshot jsonb; v_lines jsonb;
  v_delta_net int; v_delta_tax int; v_customer uuid; v_earn int;
  v_old_live int;
begin
  select id, reservation_id, original_order_id, new_starts_at, new_ends_at, delta_clp, new_snapshot, new_lines
    into v_resched, v_reservation, v_order, v_starts, v_ends, v_delta, v_snapshot, v_lines
    from reschedules where delta_order_id = p_delta_order and status = 'pending_charge'
    for update;
  if v_resched is null then return 'noop'; end if;

  select net_clp, tax_clp into v_delta_net, v_delta_tax from orders where id = p_delta_order;

  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_delta_order and status not in ('paid', 'fulfilled');

  begin
    update reservations set starts_at = v_starts, ends_at = v_ends
      where id = v_reservation and status = 'confirmed';
  exception when exclusion_violation then
    insert into tax_documents (order_id, kind, neto, iva, total)
      values (p_delta_order, 'boleta', v_delta_net, v_delta_tax, v_delta);
    update reschedules set status = 'failed_slot_taken' where id = v_resched;
    return 'slot_taken';
  end;

  -- Slot libre. CONSOLIDAR (I1): NC por la boleta viva anterior ANTES de subir amount_clp
  -- (el ratio neto/IVA reversa exacto la boleta vieja), luego mover el total, luego boleta
  -- nueva por el total nuevo.
  select amount_clp - refunded_amount_clp into v_old_live from orders where id = v_order;
  perform create_nota_credito_amount(v_order, v_old_live);

  update orders
    set amount_clp = amount_clp + v_delta,
        net_clp = net_clp + v_delta_net,
        tax_clp = tax_clp + v_delta_tax,
        pricing_snapshot = coalesce(v_snapshot, pricing_snapshot)
    where id = v_order;

  perform create_boleta_amount(v_order, v_old_live + v_delta);  -- boleta por el nuevo total

  delete from order_lines where order_id = v_order;
  insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
    select v_order, l.line_type, case when l.line_type = 'room_time' then v_reservation end,
           l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
    from jsonb_to_recordset(v_lines)
      as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);

  select c.id into v_customer
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = v_order;
  if v_customer is not null then
    v_earn := floor(0.05 * v_delta)::int;
    if v_earn > 0 then perform apply_points(v_customer, v_order, 'earn', v_earn, 'reschedule:' || p_delta_order); end if;
  end if;

  update orders set status = 'fulfilled' where id = p_delta_order;
  update reschedules set status = 'applied', applied_at = now() where id = v_resched;
  return 'applied';
end;
$$;
```

- [ ] **Step 4: Aplicar la migración**

Run: `npm run db:reset`
Expected: aplica todas las migraciones incl. la nueva, re-siembra. Sin errores SQL.

- [ ] **Step 5: Correr el itest y verificar que pasa (GREEN)**

Run: `npm run test:integration -- reschedule`
Expected: PASS — boletas [9990, 12990] + NC [9990] en slot libre; idempotencia con boleta 12990; la NC posterior calza (I1).

- [ ] **Step 6: Restaurar seed, gate y commit**

Run: `npm run db:reset`  (restaura el seed que el itest truncó)
Run: `npx eslint . && npm run build`
Expected: exit 0.

```bash
git add supabase/migrations/20260707170000_reschedule_charge_consolidate_boleta.sql src/infrastructure/db/reschedule.itest.ts
git commit -m "$(cat <<'EOF'
fix(reservas): el encarecimiento consolida boletas en vez de apilar (SII)

apply_reschedule_charge (slot libre) ahora anula la boleta viva con una NC y
re-emite una boleta por el nuevo total, en vez de apilar una boleta incremental.
Restaura el invariante "una sola boleta viva": una NC posterior calza con un
DTE emitido, en vez de abarcar dos boletas (inválida ante el SII).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: A3 — Inbox-first en slot_taken + guard de nota de crédito $0

**Contexto.** El reembolso del excedente en slot_taken no registra `refund:{id}` en el inbox; la
re-entrega del webhook (que la propia creación del reembolso dispara) vuelve a llamar `mark_refunded`
sobre la orden de delta ya reembolsada → `v_boleta = 0` → NC espuria de $0. **Fix (dos capas):**
(1) registrar el inbox en la rama slot_taken del webhook; (2) guard defensivo en `mark_refunded` /
`create_nota_credito_amount` para no emitir documentos de $0.

**Files:**
- Modify: `src/application/payment/webhook-service.ts:76-80` (registrar inbox en slot_taken)
- Create: `supabase/migrations/20260707180000_refund_zero_guard.sql` (guard $0)
- Test: `src/application/payment/webhook-service.test.ts:120-130` (aserción inbox-first)
- Test: `src/infrastructure/db/reschedule.itest.ts` (mark_refunded con boleta viva 0 → sin documento)

**Interfaces:**
- Consumes: `PaymentNotificationRepository.recordEvent`, `mark_refunded(order, refund_id, amount)`.
- Produces: `mark_refunded` / `create_nota_credito_amount` con early-return en total ≤ 0 (misma firma).

- [ ] **Step 1: Test unit — slot_taken registra el inbox (RED)**

En `src/application/payment/webhook-service.test.ts`, en el test "slot tomado al pagar..." (líneas 120-130), agregar la aserción de inbox-first:

```typescript
  it("slot tomado al pagar → devuelve el excedente, registra el inbox y marca refund → reschedule_slot_taken", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({ applyCharge: vi.fn(async () => "slot_taken" as const) });
    const gw = makeGateway({ status: "approved", externalReference: "do1", amount: 3000 });
    (gw.refundPayment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ref_slot", status: "approved", amount: 3000 });
    const svc = new WebhookService(gw, repo, fin);
    const res = await svc.handlePaymentNotification("payd");
    expect(res).toEqual({ result: "reschedule_slot_taken", orderId: "do1" });
    expect(gw.refundPayment).toHaveBeenCalledWith("payd");
    // Inbox-first: reclama refund:ref_slot para que la re-entrega del webhook dedupee.
    expect(repo.recordEvent).toHaveBeenCalledWith("refund:ref_slot", "refund", expect.anything());
    expect(fin.markChargeRefunded).toHaveBeenCalledWith("do1", "ref_slot");
  });
```

- [ ] **Step 2: Correr el test unit y verificar que falla (RED)**

Run: `npm test -- webhook-service`
Expected: FAIL — `recordEvent` no fue llamado con `refund:ref_slot` (la rama slot_taken hoy no registra el inbox).

- [ ] **Step 3: Registrar el inbox en la rama slot_taken**

En `src/application/payment/webhook-service.ts`, en la rama slot_taken (dentro de `if (this.finalizer)`), reemplazar:

```typescript
          if (outcome === "slot_taken") {
            const r = await this.gateway.refundPayment(paymentId);
            await this.finalizer.markChargeRefunded(orderId, r.id);
            return { result: "reschedule_slot_taken", orderId };
          }
```

por:

```typescript
          if (outcome === "slot_taken") {
            const r = await this.gateway.refundPayment(paymentId);
            // Inbox-first (como todos los demás caminos de reembolso): la creación del
            // reembolso dispara su propia notificación MP; sin esto, la re-entrega vería
            // el refund como fresco y emitiría una NC espuria de $0 sobre la orden de delta.
            await this.repo.recordEvent(`refund:${r.id}`, "refund", r);
            await this.finalizer.markChargeRefunded(orderId, r.id);
            return { result: "reschedule_slot_taken", orderId };
          }
```

- [ ] **Step 4: Correr el test unit y verificar que pasa (GREEN)**

Run: `npm test -- webhook-service`
Expected: PASS.

- [ ] **Step 5: itest — `mark_refunded` con boleta viva 0 no emite documento (RED)**

En `src/infrastructure/db/reschedule.itest.ts`, agregar un `describe` nuevo al final:

```typescript
describe("mark_refunded — guard $0", () => {
  it("con boleta viva 0 (ya totalmente reembolsada) no emite nota de crédito", async () => {
    const { orderId } = await paidBooking(600, "z0"); // boleta 9990
    await pg.query("select mark_refunded($1,$2,$3)", [orderId, "mp_full", 9990]); // reembolso total → live 0
    const before = await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'", [orderId]);
    // Segundo mark_refunded (re-entrega) sobre la orden ya reembolsada: no debe crear otra NC de $0.
    await pg.query("select mark_refunded($1,$2,$3)", [orderId, "mp_dup", 9990]);
    const after = await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'", [orderId]);
    expect(after.rows[0].n).toBe(before.rows[0].n); // sin NC nueva
    expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and total=0", [orderId])).rows[0].n).toBe("0");
  });
});
```

Run: `npm run test:integration -- reschedule`
Expected: FAIL — hoy el segundo `mark_refunded` inserta una `nota_credito` de total 0.

- [ ] **Step 6: Crear la migración del guard $0**

Crear `supabase/migrations/20260707180000_refund_zero_guard.sql`:

```sql
-- A3 (defensa en profundidad): nunca emitir un documento tributario de $0. La raíz del
-- bug es el reembolso de slot_taken que no registraba el inbox (arreglado en la capa app);
-- este guard evita que cualquier camino con monto 0 inserte una boleta/NC inválida.
create or replace function create_nota_credito_amount(p_order uuid, p_total int)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_net int;
begin
  if p_total is null or p_total <= 0 then return null; end if;  -- guard: sin documento de $0
  select round(p_total::numeric * net_clp / amount_clp)::int into v_net from orders where id = p_order;
  insert into tax_documents (order_id, kind, neto, iva, total)
    values (p_order, 'nota_credito', v_net, p_total - v_net, p_total)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function create_boleta_amount(p_order uuid, p_total int)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_net int;
begin
  if p_total is null or p_total <= 0 then return null; end if;  -- guard: sin documento de $0
  select round(p_total::numeric * net_clp / amount_clp)::int into v_net from orders where id = p_order;
  insert into tax_documents (order_id, kind, neto, iva, total)
    values (p_order, 'boleta', v_net, p_total - v_net, p_total)
    returning id into v_id;
  return v_id;
end;
$$;
```

- [ ] **Step 7: Aplicar la migración y verificar que el itest pasa (GREEN)**

Run: `npm run db:reset`
Run: `npm run test:integration -- reschedule`
Expected: PASS — el segundo `mark_refunded` ya no crea la NC de $0; cero documentos con total 0.

- [ ] **Step 8: Restaurar seed, gate y commit**

Run: `npm run db:reset`  (restaura el seed)
Run: `npx eslint . && npm run build`
Expected: exit 0.

```bash
git add src/application/payment/webhook-service.ts src/application/payment/webhook-service.test.ts \
  supabase/migrations/20260707180000_refund_zero_guard.sql src/infrastructure/db/reschedule.itest.ts
git commit -m "$(cat <<'EOF'
fix(pagos): slot_taken registra el inbox; sin nota de crédito de $0

El reembolso del excedente en slot_taken ahora registra refund:{id} en el
inbox (inbox-first, como los demás reembolsos), así la re-entrega del webhook
dedupea en vez de emitir una NC espuria de $0. Guard defensivo en
create_boleta_amount/create_nota_credito_amount: nunca un documento de $0.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Cierre de la Parte A

- [ ] **Suite completa + gate final**

Run: `npm test` → 317+ unit tests en verde (incl. los reordenados de A1/A3).
Run: `npm run db:reset && npm run test:integration -- reschedule` → itests de reagendamiento en verde.
Run: `npm run db:reset` → restaurar seed.
Run: `npx eslint . && npm run build` → exit 0.
Run: reiniciar `npm run dev` (reescribe `.next`).

La Parte B (ciclo de pago manual + arreglo #4 del pago partido) va en un plan aparte, tras esta.

## Self-review (cobertura del spec)

- **A1 (🔴 ALTO)** → Task 1 (siembra-primero, invariante I2, tests de orden y money-safety). ✓
- **A2 (🟠 boletas apiladas)** → Task 2 (consolidación NC+reboleta, invariante I1, test de NC posterior que calza). ✓
- **A3 (🟠 NC $0)** → Task 3 (inbox-first en slot_taken + guard $0). ✓
- **Menores** (fila duplicada equal, loopback cancel) → fuera de alcance, documentados en el spec. ✓
- **Parte B (#4, feature)** → plan aparte, fuera de este documento. ✓
