/**
 * Integración de puntos: earn/canje/claw-back contra la DB real (RPCs de la
 * migración customers_points). Gateway stub → no necesita MP. Invariante que se
 * verifica en cada escenario: customers.points_balance === sum(points_ledger).
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { CustomerService } from "@/src/application/customers/customer-service";
import { WebhookService } from "@/src/application/payment/webhook-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import type { PaymentGateway, PaymentInfo, PreferenceResult, RefundResult } from "@/src/application/ports/payment";
import { computeEarn } from "@/src/domain/points/points";
import { futureDate } from "@/tests/dates";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseCustomerRepository } from "./customer-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";
import { SupabaseWebhookRepository } from "./webhook-repository";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const checkout = new CheckoutService(
  new PricingService(new SupabaseRatePlanRepository(db)),
  new SupabaseCheckoutRepository(db),
);
const customers = new CustomerService(new SupabaseCustomerRepository(db));
const webhookRepo = new SupabaseWebhookRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

class StubGateway implements PaymentGateway {
  constructor(private readonly info: PaymentInfo) {}
  async createPreference(): Promise<PreferenceResult> {
    throw new Error("unused");
  }
  async getPayment(): Promise<PaymentInfo> {
    return this.info;
  }
  async findPaymentByOrder(): Promise<PaymentInfo | null> {
    return this.info;
  }
  async refundPayment(): Promise<RefundResult> {
    throw new Error("unused");
  }
}

// Cliente de prueba con usuario auth real (customers.id → auth.users.id).
const CUST_ID = "e0000000-0000-4000-a000-000000000001";
const CUST_EMAIL = "cliente@points.cl";
const OTHER_ID = "e0000000-0000-4000-a000-000000000002";
const OTHER_EMAIL = "otra@points.cl";

const MON = futureDate(1); // día futuro (valle a las 10:00 → $9.990/h)
const HOUR_PRICE = 9990;

const book = (start: number, opts: { email?: string; points?: number } = {}) =>
  checkout.createBooking({
    resourceId,
    date: MON,
    startMinute: start,
    durationHours: 1,
    customer: { email: opts.email ?? CUST_EMAIL },
    customerId: opts.points ? CUST_ID : undefined,
    pointsToRedeem: opts.points ?? 0,
  });

const payWebhook = async (orderId: string, paymentId: string, amount: number) => {
  const svc = new WebhookService(
    new StubGateway({ id: paymentId, status: "approved", externalReference: orderId, amount }),
    webhookRepo,
  );
  return (await svc.handlePaymentNotification(paymentId)).result;
};

const balance = async (id = CUST_ID) =>
  (await pg.query<{ b: number }>("select points_balance b from customers where id=$1", [id])).rows[0].b;
const ledgerSum = async (id = CUST_ID) =>
  Number(
    (await pg.query<{ s: string }>("select coalesce(sum(amount),0)::text s from points_ledger where customer_id=$1", [id]))
      .rows[0].s,
  );
const seedPoints = (amount: number, id = CUST_ID) =>
  pg.query("select apply_points($1, null, 'adjust', $2, 'seed-test')", [id, amount]);

/** El invariante contable del sistema. */
const expectBalanceConsistent = async (id = CUST_ID) => expect(await balance(id)).toBe(await ledgerSum(id));

const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, webhook_events, points_ledger, customers cascade";

const insertAuthUser = (id: string, email: string) =>
  pg.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
       $2, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
     ) on conflict (id) do nothing`,
    [id, email],
  );

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await insertAuthUser(CUST_ID, CUST_EMAIL);
  await insertAuthUser(OTHER_ID, OTHER_EMAIL);
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
  await pg.query("insert into customers (id, email) values ($1, $2), ($3, $4)", [
    CUST_ID,
    CUST_EMAIL,
    OTHER_ID,
    OTHER_EMAIL,
  ]);
});

describe("earn al confirmar pago", () => {
  it("otorga 5% del efectivo una sola vez (webhook repetido + RPC directo)", async () => {
    const b = await book(600);
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    expect(await payWebhook(b.value.orderId, "pay1", HOUR_PRICE)).toBe("paid");
    expect(await payWebhook(b.value.orderId, "pay1", HOUR_PRICE)).toBe("duplicate");
    await pg.query("select confirm_payment($1, 'pay1')", [b.value.orderId]); // re-entrada directa

    const earns = await pg.query<{ amount: number }>(
      "select amount from points_ledger where order_id=$1 and kind='earn'",
      [b.value.orderId],
    );
    expect(earns.rows).toHaveLength(1);
    expect(earns.rows[0].amount).toBe(computeEarn(HOUR_PRICE)); // 499
    await expectBalanceConsistent();
  });

  it("sin perfil de cliente no otorga (el retro lo cubre al crear la cuenta)", async () => {
    const b = await book(600, { email: "invitado@points.cl" });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    await payWebhook(b.value.orderId, "pay2", HOUR_PRICE);

    const rows = await pg.query("select 1 from points_ledger where order_id=$1", [b.value.orderId]);
    expect(rows.rowCount).toBe(0);
  });
});

describe("canje en el checkout", () => {
  it("carrera: dos checkouts por el mismo saldo → uno gana, el otro insufficient_points sin huérfanos", async () => {
    await seedPoints(HOUR_PRICE);

    const [r1, r2] = await Promise.all([
      book(600, { points: HOUR_PRICE }),
      book(720, { points: HOUR_PRICE }),
    ]);
    const okResults = [r1, r2].filter((r) => r.ok);
    const errResults = [r1, r2].filter((r) => !r.ok);
    expect(okResults).toHaveLength(1);
    expect(errResults).toHaveLength(1);
    if (!errResults[0].ok) expect(errResults[0].error).toBe("insufficient_points");

    // El perdedor no dejó orden ni hold: solo existe 1 orden y 1 reserva.
    expect(Number((await pg.query<{ n: string }>("select count(*)::text n from orders")).rows[0].n)).toBe(1);
    expect(Number((await pg.query<{ n: string }>("select count(*)::text n from reservations")).rows[0].n)).toBe(1);
    expect(await balance()).toBe(0);
    await expectBalanceConsistent();
  });

  it("canje 100%: confirmada sin MP — sin boleta, sin payment_intent, sin earn", async () => {
    await seedPoints(HOUR_PRICE);

    const b = await book(600, { points: HOUR_PRICE });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.value.paidWithPoints).toBe(true);
    expect(b.value.amount).toBe(0);

    const o = await pg.query<{ status: string; mp_payment_id: string; amount_clp: number; points_redeemed_clp: number }>(
      "select status, mp_payment_id, amount_clp, points_redeemed_clp from orders where id=$1",
      [b.value.orderId],
    );
    expect(o.rows[0]).toMatchObject({
      status: "paid",
      mp_payment_id: "offline:puntos",
      amount_clp: 0,
      points_redeemed_clp: HOUR_PRICE,
    });
    const r = await pg.query<{ status: string }>("select status from reservations where order_id=$1", [b.value.orderId]);
    expect(r.rows[0].status).toBe("confirmed");
    expect((await pg.query("select 1 from tax_documents where order_id=$1", [b.value.orderId])).rowCount).toBe(0);
    expect((await pg.query("select 1 from payment_intents where order_id=$1", [b.value.orderId])).rowCount).toBe(0);
    expect(
      (await pg.query("select 1 from points_ledger where order_id=$1 and kind='earn'", [b.value.orderId])).rowCount,
    ).toBe(0);
    // Las líneas suman el efectivo ($0).
    const lines = await pg.query<{ s: string }>(
      "select coalesce(sum(subtotal_clp),0)::text s from order_lines where order_id=$1",
      [b.value.orderId],
    );
    expect(Number(lines.rows[0].s)).toBe(0);
    await expectBalanceConsistent();
  });

  it("canje parcial: MP cobra el resto, boleta por el efectivo y earn solo sobre el efectivo", async () => {
    await seedPoints(4000);

    const b = await book(600, { points: 4000 });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.value.amount).toBe(HOUR_PRICE - 4000); // 5990
    expect(b.value.paidWithPoints).toBe(false);

    expect(await payWebhook(b.value.orderId, "pay3", 5990)).toBe("paid");

    const o = await pg.query<{ amount_clp: number; net_clp: number; tax_clp: number }>(
      "select amount_clp, net_clp, tax_clp from orders where id=$1",
      [b.value.orderId],
    );
    expect(o.rows[0].amount_clp).toBe(5990);
    expect(o.rows[0].net_clp + o.rows[0].tax_clp).toBe(5990);
    const boleta = await pg.query<{ total: number }>(
      "select total from tax_documents where order_id=$1 and kind='boleta'",
      [b.value.orderId],
    );
    expect(boleta.rows[0].total).toBe(5990);
    const earn = await pg.query<{ amount: number }>(
      "select amount from points_ledger where order_id=$1 and kind='earn'",
      [b.value.orderId],
    );
    expect(earn.rows[0].amount).toBe(computeEarn(5990)); // 299
    // seed 4000 − canje 4000 + earn 299
    expect(await balance()).toBe(computeEarn(5990));
    await expectBalanceConsistent();
  });
});

describe("liberación de canjes (órdenes que mueren sin pagar)", () => {
  it("sweep de abandonadas: repone una vez, y un pago tardío se auto-repara", async () => {
    await seedPoints(4000);
    const b = await book(600, { points: 4000 });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const orderId = b.value.orderId;

    await pg.query("update orders set created_at = now() - interval '73 hours' where id=$1", [orderId]);
    await pg.query("update reservations set status='expired' where order_id=$1", [orderId]);

    expect((await pg.query<{ n: number }>("select release_abandoned_redemptions() n")).rows[0].n).toBe(1);
    expect(await balance()).toBe(4000); // repuesto
    expect((await pg.query<{ n: number }>("select release_abandoned_redemptions() n")).rows[0].n).toBe(0); // no re-barre

    // Pago tardío (la página de estado reconcilia sin ventana): re-aplica el canje.
    await pg.query("select confirm_payment($1, 'late_pay')", [orderId]);
    const late = await pg.query<{ amount: number; ref: string }>(
      "select amount, ref from points_ledger where order_id=$1 and kind='redeem' and ref like 'late:%'",
      [orderId],
    );
    expect(late.rows[0]).toMatchObject({ amount: -4000, ref: "late:late_pay" });
    // seed 4000 − canje 4000 + release 4000 − re-canje 4000 + earn(5990) = 299
    expect(await balance()).toBe(computeEarn(5990));
    await expectBalanceConsistent();
  });

  it("cancel_unpaid_order y cancel_booking (impaga) reponen, idempotente", async () => {
    await seedPoints(8000);

    const b1 = await book(600, { points: 4000 });
    expect(b1.ok).toBe(true);
    if (!b1.ok) return;
    await pg.query("select cancel_unpaid_order($1)", [b1.value.orderId]);
    await pg.query("select cancel_unpaid_order($1)", [b1.value.orderId]); // repetido → no-op
    expect(await balance()).toBe(8000); // canje 4000 repuesto una sola vez

    const b2 = await book(720, { points: 4000 });
    expect(b2.ok).toBe(true);
    if (!b2.ok) return;
    const resId = (await pg.query<{ id: string }>("select id from reservations where order_id=$1", [b2.value.orderId]))
      .rows[0].id;
    await pg.query("select cancel_booking($1)", [resId]);
    expect(await balance()).toBe(8000);
    await expectBalanceConsistent();
  });
});

describe("claw-back en reembolsos (mark_refunded)", () => {
  it("parciales acumulados convergen exacto; replay del mismo refund es no-op", async () => {
    // Orden canónica del spec: C=20000, P=5000 (insertada directa para montos redondos).
    const { rows } = await pg.query<{ id: string }>(
      `insert into orders (status, amount_clp, net_clp, tax_clp, customer_email, points_redeemed_clp, mp_payment_id, paid_at)
       values ('paid', 20000, 16807, 3193, $1, 5000, 'payX', now()) returning id`,
      [CUST_EMAIL],
    );
    const orderId = rows[0].id;
    await seedPoints(5000);
    await pg.query("select apply_points($1, $2, 'redeem', -5000, '')", [CUST_ID, orderId]);
    await pg.query("select apply_points($1, $2, 'earn', 1000, '')", [CUST_ID, orderId]);
    // balance: 5000 − 5000 + 1000 = 1000

    await pg.query("select mark_refunded($1, 'r1', 6000)", [orderId]);
    const after1 = await pg.query<{ kind: string; amount: number }>(
      "select kind, amount from points_ledger where order_id=$1 and ref='r1' order by kind",
      [orderId],
    );
    expect(after1.rows).toEqual([
      { kind: "earn_revoke", amount: -300 }, // 1000 − floor(0.05·14000)
      { kind: "redeem_restore", amount: 1500 }, // floor(5000·6000/20000)
    ]);
    expect(await balance()).toBe(1000 - 300 + 1500);

    await pg.query("select mark_refunded($1, 'r2', 14000)", [orderId]);
    const earnNet = await pg.query<{ s: string }>(
      "select coalesce(sum(amount),0)::text s from points_ledger where order_id=$1 and kind in ('earn','earn_revoke')",
      [orderId],
    );
    expect(Number(earnNet.rows[0].s)).toBe(0); // todo el earn revocado
    const restored = await pg.query<{ s: string }>(
      "select coalesce(sum(amount),0)::text s from points_ledger where order_id=$1 and kind='redeem_restore'",
      [orderId],
    );
    expect(Number(restored.rows[0].s)).toBe(5000); // exactamente P, sin polvo

    // Replay de r1: la boleta viva ya es 0 → no-op completo.
    await pg.query("select mark_refunded($1, 'r1', 6000)", [orderId]);
    const orderNet = await pg.query<{ s: string }>(
      "select coalesce(sum(amount),0)::text s from points_ledger where order_id=$1",
      [orderId],
    );
    // redeem −5000 + earn 1000 − revokes 1000 + restores 5000 = 0
    expect(Number(orderNet.rows[0].s)).toBe(0);
    await expectBalanceConsistent();
  });

  it("orden 100% puntos: refund_points_order repone según lo pedido, sin NC", async () => {
    await seedPoints(HOUR_PRICE);
    const b = await book(600, { points: HOUR_PRICE });
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    await pg.query("select refund_points_order($1, $2, 'points:test')", [b.value.orderId, 4995]);

    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [b.value.orderId]);
    expect(o.rows[0].status).toBe("refunded");
    const r = await pg.query<{ status: string }>("select status from reservations where order_id=$1", [b.value.orderId]);
    expect(r.rows[0].status).toBe("cancelled");
    expect((await pg.query("select 1 from tax_documents where order_id=$1", [b.value.orderId])).rowCount).toBe(0);
    expect(await balance()).toBe(4995);
    await expectBalanceConsistent();
  });
});

describe("retro al crear la cuenta", () => {
  it("otorga por el historial retenido, idempotente, y sin duplicar earns vivos", async () => {
    // Historial del email ANTES de tener cuenta: pagada, fulfilled y reembolsada parcial.
    await pg.query("delete from customers where id=$1", [CUST_ID]); // aún sin cuenta
    await pg.query(
      `insert into orders (status, amount_clp, net_clp, tax_clp, customer_email, refunded_amount_clp)
       values ('paid',      19990, 16798, 3192, $1, 0),
              ('fulfilled', 10000,  8403, 1597, $1, 0),
              ('refunded',  20000, 16807, 3193, $1, 6000),
              ('cancelled',  9990,  8395, 1595, $1, 0)`, // cancelada: NO califica
      [CUST_EMAIL.toUpperCase()], // email histórico con mayúsculas: matchea igual
    );

    await customers.ensureCustomer(CUST_ID, CUST_EMAIL);
    // 999 + 500 + floor(0.05·14000)=700; la cancelada no suma.
    expect(await balance()).toBe(999 + 500 + 700);

    await customers.ensureCustomer(CUST_ID, CUST_EMAIL); // idempotente
    expect(await balance()).toBe(2199);

    // Una orden nueva ganada EN VIVO no se re-otorga al correr retro de nuevo.
    const b = await book(600);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    await payWebhook(b.value.orderId, "pay9", HOUR_PRICE);
    await customers.ensureCustomer(CUST_ID, CUST_EMAIL);
    expect(await balance()).toBe(2199 + computeEarn(HOUR_PRICE));
    await expectBalanceConsistent();
  });
});

describe("paridad SQL ↔ dominio y ownership", () => {
  it("floor(0.05·x) coincide entre computeEarn y la DB", async () => {
    for (const x of [0, 19, 20, 999, 5990, 9990, 19990, 26980, 49990]) {
      const sql = await pg.query<{ e: number }>("select floor(0.05 * $1)::int e", [x]);
      expect(sql.rows[0].e).toBe(computeEarn(x));
    }
  });

  it("las consultas de un cliente jamás devuelven filas del otro", async () => {
    const repo = new SupabaseCustomerRepository(db);
    const bA = await book(600, { email: CUST_EMAIL });
    const bB = await book(720, { email: OTHER_EMAIL });
    expect(bA.ok && bB.ok).toBe(true);
    await seedPoints(100, CUST_ID);
    await seedPoints(200, OTHER_ID);

    const bookingsA = await repo.bookingsForEmail(CUST_EMAIL);
    expect(bookingsA).toHaveLength(1);
    const movesA = await repo.movements(CUST_ID, 50);
    expect(movesA.every((m) => m.amount === 100)).toBe(true);

    await repo.updateProfile(CUST_ID, { name: "Cliente A", phone: null });
    const other = await repo.getProfile(OTHER_ID);
    expect(other?.name).toBeNull(); // el update de A no tocó a B
  });
});
