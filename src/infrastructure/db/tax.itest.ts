/** Integración: cada pago crea una boleta pendiente (neto/IVA del pedido). */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const checkout = new CheckoutService(
  new PricingService(new SupabaseRatePlanRepository(db)),
  new SupabaseCheckoutRepository(db),
);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup = "truncate reservations, orders, order_lines, tax_documents cascade";

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

async function payOrder(start: number, email: string) {
  const b = await checkout.createBooking({
    resourceId,
    date: "2024-01-01",
    startMinute: start,
    durationHours: 1,
    customer: { email },
  });
  if (!b.ok) throw new Error(b.error);
  await pg.query("select confirm_payment($1,$2)", [b.value.orderId, "pay-" + start]);
  return b.value.orderId;
}

describe("boleta", () => {
  it("crea boleta pendiente con neto/IVA del pedido, idempotente", async () => {
    const orderId = await payOrder(600, "a@e.cl");

    const doc = await pg.query<{ kind: string; status: string; neto: number; iva: number; total: number }>(
      "select kind, status, neto, iva, total from tax_documents where order_id=$1",
      [orderId],
    );
    expect(doc.rows.length).toBe(1);
    expect(doc.rows[0].kind).toBe("boleta");
    expect(doc.rows[0].status).toBe("pendiente");
    expect(doc.rows[0].neto + doc.rows[0].iva).toBe(doc.rows[0].total);

    const order = await pg.query<{ net_clp: number; tax_clp: number; amount_clp: number }>(
      "select net_clp, tax_clp, amount_clp from orders where id=$1",
      [orderId],
    );
    expect(doc.rows[0].neto).toBe(order.rows[0].net_clp);
    expect(doc.rows[0].iva).toBe(order.rows[0].tax_clp);
    expect(doc.rows[0].total).toBe(order.rows[0].amount_clp);

    // reprocesar el pago no duplica la boleta
    await pg.query("select confirm_payment($1,$2)", [orderId, "pay-600"]);
    const again = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='boleta'",
      [orderId],
    );
    expect(Number(again.rows[0].n)).toBe(1);
  });

  it("create_nota_credito genera una NC pendiente", async () => {
    const orderId = await payOrder(660, "b@e.cl");
    await pg.query("select create_nota_credito($1)", [orderId]);
    const nc = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'",
      [orderId],
    );
    expect(Number(nc.rows[0].n)).toBe(1);
  });
});
