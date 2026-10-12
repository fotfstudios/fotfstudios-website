/**
 * Transferencia como respaldo del checkout público (migración 20261016120000). Contra la DB
 * real: request_transfer estira el hold de 10 min a min(ahora + 2 h, inicio − 1 h) solo con
 * el interruptor prendido y ≥ 3 h de anticipación; declare_transfer ("Ya transferí") lo
 * sostiene hasta min(ahora + 48 h, inicio); ambas son idempotentes, dejan su evento en la
 * línea de tiempo y el dueño liquida con confirm_payment('transferencia') como siempre.
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, reschedules, customers, booking_events cascade";

const lines1h = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 9990, subtotal_clp: 9990 },
]);

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.query("update checkout_settings set transfer_enabled = false");
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
  await pg.query("update checkout_settings set transfer_enabled = true");
});

/** Checkout público (hold de 10 min) que empieza dentro de `startsIn` (intervalo SQL). */
async function checkout(startsIn: string): Promise<string> {
  const { rows } = await pg.query<{ order_id: string }>(
    `select create_checkout(
       p_resource => $1::uuid,
       p_starts => date_trunc('minute', now() + $2::interval),
       p_ends => date_trunc('minute', now() + $2::interval + interval '1 hour'),
       p_amount => 9990, p_net => 8395, p_tax => 1595, p_currency => 'CLP',
       p_customer => $3::jsonb, p_snapshot => '{}'::jsonb, p_lines => $4::jsonb,
       p_ttl => interval '10 minutes', p_terms_source => 'customer') as order_id`,
    [resourceId, startsIn, JSON.stringify({ name: "Ana", email: "ana@e.cl" }), lines1h],
  );
  return rows[0].order_id;
}

const rpc = async (fn: "request_transfer" | "declare_transfer", id: string) =>
  (await pg.query<{ r: string }>(`select ${fn}($1) r`, [id])).rows[0].r;

/** Minutos que le quedan al hold, y los que faltan para el inicio. */
async function hold(id: string) {
  const { rows } = await pg.query<{ left: number; to_start: number; status: string }>(
    `select round(extract(epoch from expires_at - now()) / 60)::int "left",
            round(extract(epoch from starts_at - now()) / 60)::int to_start, status
       from reservations where order_id = $1`,
    [id],
  );
  return rows[0];
}

const events = async (id: string) =>
  (
    await pg.query<{ type: string; category: string }>(
      "select type, category from booking_events where order_id = $1 order by occurred_at, type",
      [id],
    )
  ).rows;

describe("request_transfer", () => {
  it("con el interruptor apagado no toca nada", async () => {
    await pg.query("update checkout_settings set transfer_enabled = false");
    const id = await checkout("3 days");
    expect(await rpc("request_transfer", id)).toBe("disabled");
    expect((await hold(id)).left).toBeLessThanOrEqual(10);
  });

  it("estira el hold a 2 h, marca la orden y deja el evento", async () => {
    const id = await checkout("3 days");
    expect(await rpc("request_transfer", id)).toBe("ok");
    expect((await hold(id)).left).toBe(120);
    const o = await pg.query("select transfer_requested_at is not null req from orders where id = $1", [id]);
    expect(o.rows[0].req).toBe(true);
    expect(await events(id)).toContainEqual({ type: "transfer_requested", category: "Pagos" });
  });

  it("con menos de 3 h al inicio no se ofrece", async () => {
    const id = await checkout("150 minutes");
    expect(await rpc("request_transfer", id)).toBe("too_late");
  });

  it("el plazo nunca pasa de una hora antes del inicio", async () => {
    // Con los valores por defecto (3 h de anticipación) manda la ventana de 2 h; el tope
    // de inicio − 1 h es el respaldo si alguien acorta p_min_lead.
    const id = await checkout("90 minutes");
    expect(await pg.query("select request_transfer($1, p_min_lead => interval '1 hour') r", [id]).then((r) => r.rows[0].r)).toBe("ok");
    const h = await hold(id);
    expect(h.left).toBe(h.to_start - 60);
  });

  it("es idempotente: la segunda llamada no vuelve a estirar el plazo", async () => {
    const id = await checkout("3 days");
    await rpc("request_transfer", id);
    await pg.query("update reservations set expires_at = now() + interval '30 minutes' where order_id = $1", [id]);
    expect(await rpc("request_transfer", id)).toBe("ok");
    expect((await hold(id)).left).toBe(30);
    expect((await events(id)).filter((e) => e.type === "transfer_requested")).toHaveLength(1);
  });

  it("un hold vencido o una orden pagada no se pasan a transferencia", async () => {
    const id = await checkout("3 days");
    await pg.query("update reservations set expires_at = now() - interval '1 minute' where order_id = $1", [id]);
    expect(await rpc("request_transfer", id)).toBe("no_hold");

    const paid = await checkout("4 days");
    await pg.query("select confirm_payment($1, 'mp_1', 'mercadopago')", [paid]);
    expect(await rpc("request_transfer", paid)).toBe("not_pending");
  });
});

describe("declare_transfer", () => {
  it("solo sobre una orden en transferencia", async () => {
    const id = await checkout("3 days");
    expect(await rpc("declare_transfer", id)).toBe("not_transfer");
  });

  it("sostiene el cupo 48 h, es idempotente y el dueño liquida con confirm_payment", async () => {
    const id = await checkout("5 days");
    await rpc("request_transfer", id);
    expect(await rpc("declare_transfer", id)).toBe("ok");
    expect((await hold(id)).left).toBe(48 * 60);
    expect(await rpc("declare_transfer", id)).toBe("already");
    expect(await events(id)).toContainEqual({ type: "transfer_declared", category: "Pagos" });

    const c = await pg.query<{ c: string }>("select confirm_payment($1, null::text, 'transferencia') c", [id]);
    expect(c.rows[0].c).toBe("confirmed");
    expect((await hold(id)).status).toBe("confirmed");
  });

  it("nunca más allá del inicio de la sesión", async () => {
    const id = await checkout("3 days");
    await rpc("request_transfer", id);
    await pg.query("update reservations set starts_at = now() + interval '5 hours', ends_at = now() + interval '6 hours' where order_id = $1", [id]);
    expect(await rpc("declare_transfer", id)).toBe("ok");
    const h = await hold(id);
    expect(h.left).toBe(h.to_start);
  });

  it("si el plazo ya venció, avisa expired", async () => {
    const id = await checkout("3 days");
    await rpc("request_transfer", id);
    await pg.query("update reservations set expires_at = now() - interval '1 minute' where order_id = $1", [id]);
    expect(await rpc("declare_transfer", id)).toBe("expired");
  });
});
