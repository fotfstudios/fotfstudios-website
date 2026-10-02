/**
 * Recordatorio de pago de reservas manuales pendientes: `payment_reminders_due` (pre-filtro)
 * trabaja sobre el mismo universo que expire_abandoned_manual_holds_ids (mismo
 * predicado y mismo reloj); el servicio decide si quedan ≤ 24 h. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { PaymentReminderService } from "@/src/application/reminders/payment-reminder-service";
import { manualHoldFreesAt } from "@/src/domain/scheduling/manual-hold-deadline";
import { futureDate } from "@/tests/dates";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabasePaymentReminderRepository } from "./payment-reminder-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
const db = createServiceClient(URL, KEY);
const checkout = new CheckoutService(new PricingService(new SupabaseRatePlanRepository(db)), new SupabaseCheckoutRepository(db));
const repo = new SupabasePaymentReminderRepository(db);
let resourceId: string;
const cleanup = "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, reschedules, customers cascade";
const DAY = futureDate(2);

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

/** Reserva como la crea el admin con "Pendiente de pago" (hold firme), o como la crea un cliente (10 min). */
async function book(startMinute: number, opts: { firm?: boolean; email?: string | null } = {}) {
  const res = await checkout.createBooking(
    { resourceId, date: DAY, startMinute, durationHours: 1, customer: opts.email === null ? { name: "Sin mail" } : { email: opts.email ?? "m@e.cl" } },
    { enforceLeadTime: false, firmHold: opts.firm ?? true },
  );
  if (!res.ok) throw new Error(`book failed: ${res.error}`);
  return res.value.orderId;
}
const age = (orderId: string, hours: number) =>
  pg.query(`update orders set created_at = now() - make_interval(hours => $2) where id=$1`, [orderId, hours]);
const dueIds = async () => (await repo.due()).map((r) => r.orderId);

/** Mueve la sesión a `now() + hours` (para los casos en que el inicio llega antes que el barrido). */
const startIn = (orderId: string, hours: number) =>
  pg.query(
    `update reservations set starts_at = now() + make_interval(hours => $2), ends_at = now() + make_interval(hours => $2 + 1)
      where order_id = $1`,
    [orderId, hours],
  );

describe("payment_reminders_due — pre-filtro", () => {
  it("sesión lejana: candidata con reloj ≥ 48 h, no con 47 h", async () => {
    const old = await book(600);
    const young = await book(720);
    await age(old, 49);
    await age(young, 47);
    const due = await repo.due();
    expect(due.map((r) => r.orderId)).toEqual([old]);
    expect(due[0].customerEmail).toBe("m@e.cl");
    expect(new Date(due[0].startsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("sesión dentro de 24 h: candidata con reloj ≥ 12 h, aunque no lleve 48 h", async () => {
    const id = await book(600);
    await age(id, 13);
    await startIn(id, 10);
    expect(await dueIds()).toEqual([id]);
  });

  it("recién creada (< 12 h): nunca candidata, aunque la sesión sea pronto", async () => {
    const id = await book(600);
    await age(id, 6);
    await startIn(id, 10);
    expect(await dueIds()).toEqual([]);
  });

  it("sesión ya iniciada: no hay a qué recordar", async () => {
    const id = await book(600);
    await age(id, 49);
    await startIn(id, -1);
    expect(await dueIds()).toEqual([]);
  });

  it("un link de pago reciente reinicia el reloj (mismo reloj que el barrido)", async () => {
    const id = await book(600);
    await age(id, 49);
    await pg.query(
      `insert into payment_intents (order_id, provider, preference_id, amount_clp, currency, status, created_at)
       values ($1, 'mercadopago', 'pref-reciente', 9990, 'CLP', 'created', now() - interval '1 hour')`,
      [id],
    );
    expect(await dueIds()).toEqual([]);
  });

  it("no toca holds de cliente (10 min) ni pedidos pagados", async () => {
    const customer = await book(600, { firm: false });
    const paid = await book(720);
    await age(customer, 49);
    await age(paid, 49);
    await pg.query("update orders set status = 'paid' where id=$1", [paid]);
    expect(await dueIds()).toEqual([]);
  });

  it("lo liberado por el barrido ya no es candidato", async () => {
    const id = await book(600);
    await age(id, 73);
    expect(await dueIds()).toEqual([id]);
    await pg.query("select expire_abandoned_manual_holds()");
    expect(await dueIds()).toEqual([]);
  });

  it("devuelve el reloj (clock_start) que usa el barrido", async () => {
    const id = await book(600);
    await age(id, 49);
    const { rows } = await pg.query<{ created_at: Date }>("select created_at from orders where id=$1", [id]);
    expect(new Date((await repo.due())[0].clockStart).getTime()).toBe(rows[0].created_at.getTime());
  });

  it("no lo pueden ejecutar anon ni authenticated (devuelve emails de clientes)", async () => {
    const { rows } = await pg.query<{ anon: boolean; auth: boolean; svc: boolean }>(
      `select has_function_privilege('anon', 'payment_reminders_due(interval)', 'execute') anon,
              has_function_privilege('authenticated', 'payment_reminders_due(interval)', 'execute') auth,
              has_function_privilege('service_role', 'payment_reminders_due(interval)', 'execute') svc`,
    );
    expect(rows[0]).toEqual({ anon: false, auth: false, svc: true });
  });
});

describe("reclamo payment_reminder_sent_at", () => {
  it("el segundo reclamo pierde; soltar lo vuelve candidato", async () => {
    const id = await book(600);
    await age(id, 49);
    expect(await repo.markSent(id)).toBe(true);
    expect(await repo.markSent(id)).toBe(false);
    expect(await dueIds()).toEqual([]);
    await repo.releaseSent(id);
    expect(await dueIds()).toEqual([id]);
  });
});

describe("PaymentReminderService.sweep contra la DB", () => {
  it("sesión en 10 h (plazo = inicio): manda una vez, cuenta los sin email, la segunda corrida no manda", async () => {
    const withMail = await book(600);
    const noMail = await book(720, { email: null });
    for (const id of [withMail, noMail]) {
      await age(id, 13);
      await startIn(id, 10 + (id === noMail ? 2 : 0));
    }
    const notifications = { notifyPaymentReminder: vi.fn(async () => true) };
    const service = new PaymentReminderService(repo, notifications);

    expect(await service.sweep()).toEqual({ sent: 1, skippedNoEmail: 1 });
    expect(notifications.notifyPaymentReminder).toHaveBeenCalledWith(withMail, expect.objectContaining({ clockStart: expect.any(String) }));
    expect(await service.sweep()).toEqual({ sent: 0, skippedNoEmail: 1 });
    expect(notifications.notifyPaymentReminder).toHaveBeenCalledTimes(1);
  });

  it("sesión lejana con reloj de 49 h: candidata, pero solo manda si al barrido le quedan ≤ 24 h", async () => {
    const id = await book(600);
    await age(id, 49);
    const notifications = { notifyPaymentReminder: vi.fn(async () => true) };
    const service = new PaymentReminderService(repo, notifications);
    const { rows } = await pg.query<{ clock: Date }>("select created_at clock from orders where id=$1", [id]);
    const expected = manualHoldFreesAt(rows[0].clock).getTime() - Date.now() <= 24 * 3600_000 ? 1 : 0;
    expect((await service.sweep()).sent).toBe(expected);
  });
});
