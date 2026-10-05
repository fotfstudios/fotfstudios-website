/**
 * Método de pago como columna propia + guardia de pago duplicado
 * (migración 20261007120000). Contra la DB real: `orders.payment_method` lo escribe
 * confirm_payment (3 argumentos) y su envoltorio de 2 (prefijo `offline:` viejo), un
 * segundo pago sobre una orden ya pagada devuelve 'already_paid' sin tocar nada, la
 * re-entrega del MISMO id de MP sigue idempotente, y log_duplicate_payment deja rastro.
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { futureDate } from "@/tests/dates";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, reschedules, customers, booking_events cascade";
const MON = futureDate(1);

const lines1h = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 9990, subtotal_clp: 9990 },
]);

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

/** Pedido pendiente con hold firme (el camino de la reserva manual "pendiente"). */
async function pendingOrder(hour = 14): Promise<string> {
  const { rows } = await pg.query<{ order_id: string }>(
    `select create_checkout(
       p_resource => $1::uuid, p_starts => $2::timestamptz, p_ends => $3::timestamptz,
       p_amount => 9990, p_net => 8395, p_tax => 1595, p_currency => 'CLP',
       p_customer => $4::jsonb, p_snapshot => '{}'::jsonb, p_lines => $5::jsonb,
       p_ttl => null, p_terms_source => 'staff') as order_id`,
    [
      resourceId,
      `${MON}T${hour}:00:00-04:00`,
      `${MON}T${hour + 1}:00:00-04:00`,
      JSON.stringify({ name: "Ana", email: "ana@e.cl" }),
      lines1h,
    ],
  );
  return rows[0].order_id;
}

async function order(id: string) {
  return (
    await pg.query<{ status: string; method: string | null; pid: string | null; snapshot: unknown }>(
      "select status, payment_method method, mp_payment_id pid, payment_snapshot snapshot from orders where id = $1",
      [id],
    )
  ).rows[0];
}

const count = async (sql: string, args: unknown[]) =>
  Number((await pg.query<{ n: string }>(sql, args)).rows[0].n);

describe("confirm_payment escribe el método", () => {
  it("offline (3 argumentos): método efectivo; mp_payment_id conserva el prefijo por compatibilidad", async () => {
    const id = await pendingOrder();
    const r = await pg.query<{ c: string }>("select confirm_payment($1, null::text, 'transferencia') c", [id]);
    expect(r.rows[0].c).toBe("confirmed");
    expect(await order(id)).toMatchObject({ status: "paid", method: "transferencia", pid: "offline:transferencia" });
  });

  it("Mercado Pago: guarda el id real y el método", async () => {
    const id = await pendingOrder();
    await pg.query("select confirm_payment($1, 'mp_777', 'mercadopago')", [id]);
    expect(await order(id)).toMatchObject({ method: "mercadopago", pid: "mp_777" });
  });

  it("el envoltorio de 2 argumentos traduce el prefijo viejo (código en producción durante el push)", async () => {
    const a = await pendingOrder(10);
    const b = await pendingOrder(12);
    await pg.query("select confirm_payment($1, 'offline:efectivo')", [a]);
    await pg.query("select confirm_payment($1, 'mp_1')", [b]);
    expect(await order(a)).toMatchObject({ method: "efectivo", pid: "offline:efectivo" });
    expect(await order(b)).toMatchObject({ method: "mercadopago", pid: "mp_1" });
  });

  it("canje 100 % puntos en create_checkout → método puntos", async () => {
    const cust = (
      await pg.query<{ id: string }>(
        "insert into customers (name, email, points_balance) values ('Pía', 'pia@e.cl', 20000) returning id",
      )
    ).rows[0].id;
    const { rows } = await pg.query<{ order_id: string }>(
      `select create_checkout(
         p_resource => $1::uuid, p_starts => $2::timestamptz, p_ends => $3::timestamptz,
         p_amount => 0, p_net => 0, p_tax => 0, p_currency => 'CLP',
         p_customer => '{}'::jsonb, p_snapshot => '{}'::jsonb, p_lines => $4::jsonb,
         p_customer_id => $5::uuid, p_points => 9990) as order_id`,
      [resourceId, `${MON}T16:00:00-04:00`, `${MON}T17:00:00-04:00`, lines1h, cust],
    );
    expect(await order(rows[0].order_id)).toMatchObject({ status: "paid", method: "puntos" });
  });

  it("rechaza un método desconocido y MP sin id", async () => {
    const id = await pendingOrder();
    await expect(pg.query("select confirm_payment($1, null::text, 'cheque')", [id])).rejects.toThrow(/payment_method_invalid/);
    await expect(pg.query("select confirm_payment($1, null::text, 'mercadopago')", [id])).rejects.toThrow(/payment_id_required/);
  });
});

describe("guardia de pago duplicado", () => {
  it("pagada en efectivo + llega un pago de MP → 'already_paid' y la orden queda intacta", async () => {
    const id = await pendingOrder();
    await pg.query("select confirm_payment($1, null::text, 'efectivo')", [id]);
    const r = await pg.query<{ c: string }>("select confirm_payment($1, 'mp_999', 'mercadopago') c", [id]);
    expect(r.rows[0].c).toBe("already_paid");
    expect(await order(id)).toMatchObject({ status: "paid", method: "efectivo", pid: "offline:efectivo" });
    expect(await count("select count(*)::text n from tax_documents where order_id=$1 and kind='boleta'", [id])).toBe(1);
    expect(
      await count("select count(*)::text n from booking_events where order_id=$1 and type='payment_confirmed'", [id]),
    ).toBe(1);
  });

  it("re-entrega del MISMO id de MP → sigue 'confirmed', sin efectos dobles", async () => {
    const id = await pendingOrder();
    await pg.query("select confirm_payment($1, 'mp_5', 'mercadopago')", [id]);
    const again = await pg.query<{ c: string }>("select confirm_payment($1, 'mp_5', 'mercadopago') c", [id]);
    expect(again.rows[0].c).toBe("confirmed");
    expect(await count("select count(*)::text n from tax_documents where order_id=$1", [id])).toBe(1);
  });

  it("dos pagos offline seguidos (doble clic) → el segundo es 'already_paid'", async () => {
    const id = await pendingOrder();
    await pg.query("select confirm_payment($1, null::text, 'efectivo')", [id]);
    const r = await pg.query<{ c: string }>("select confirm_payment($1, null::text, 'transferencia') c", [id]);
    expect(r.rows[0].c).toBe("already_paid");
    expect((await order(id)).method).toBe("efectivo");
  });

  it("log_duplicate_payment deja el evento en la línea de tiempo con lo que ya estaba guardado", async () => {
    const id = await pendingOrder();
    await pg.query("select confirm_payment($1, null::text, 'efectivo')", [id]);
    await pg.query("select log_duplicate_payment($1, 'mp_999', 9990)", [id]);
    const ev = await pg.query<{ category: string; ref: string; amount: number; detail: Record<string, unknown> }>(
      "select category, payment_ref ref, amount_clp amount, detail from booking_events where order_id=$1 and type='duplicate_payment'",
      [id],
    );
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0]).toMatchObject({
      category: "Pagos",
      ref: "mp_999",
      amount: 9990,
      detail: { stored_method: "efectivo", stored_payment_id: "offline:efectivo" },
    });
  });
});
