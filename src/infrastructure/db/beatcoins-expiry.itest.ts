/**
 * Beatcoins que vencen (migración 20261014120100), contra la DB real: la parte protegida
 * (lo ganado antes del corte nunca vence), el reloj de 12 meses que reinicia cada reserva,
 * expire_beatcoins y los candidatos a aviso. Los tests mueven el corte
 * (beatcoins_settings.expiry_from) para simular el antes y el después. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { futureDate } from "@/tests/dates";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
let originalFrom: string;
const DAY = futureDate(2, 3);
const LINES = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1 h", quantity: 1, unit_price_clp: 15000, subtotal_clp: 15000 },
]);

const clean = () => pg.query("truncate reservations, orders, order_lines, payment_intents, points_ledger, booking_events, customers cascade");
const setCutoff = (sql: string) => pg.query(`update beatcoins_settings set expiry_from = ${sql}`);

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  originalFrom = (await pg.query<{ f: string }>("select expiry_from::text f from beatcoins_settings")).rows[0].f;
});
beforeEach(async () => {
  await clean();
  await setCutoff("now() + interval '30 days'"); // por defecto: todavía antes del corte
});
afterAll(async () => {
  await clean();
  await pg.query("update beatcoins_settings set expiry_from = $1", [originalFrom]);
  await pg.end();
});

async function customer(email = "ana@e.cl"): Promise<string> {
  const { rows } = await pg.query<{ id: string }>("insert into customers (email, name) values ($1, 'Ana') returning id", [email]);
  return rows[0].id;
}

const apply = (c: string, kind: string, amount: number, ref: string, order: string | null = null) =>
  pg.query("select apply_points($1, $2, $3::points_entry_kind, $4, $5)", [c, order, kind, amount, ref]);

type State = { balance: number; protected: number; activity: boolean; n30: boolean; n7: boolean };
async function state(c: string): Promise<State> {
  const { rows } = await pg.query<State>(
    `select points_balance balance, points_protected protected, points_activity_at is not null activity,
            points_expiry_notice_30_at is not null n30, points_expiry_notice_7_at is not null n7
       from customers where id = $1`,
    [c],
  );
  return rows[0];
}
async function expectConsistent(c: string) {
  const { rows } = await pg.query<{ s: number }>("select coalesce(sum(amount),0)::int s from points_ledger where customer_id = $1", [c]);
  expect((await state(c)).balance).toBe(rows[0].s);
}

/** Pedido real (sin pagar) para movimientos que dependen de su fecha de creación. */
async function order(hour: number, createdAt?: string): Promise<string> {
  const { rows } = await pg.query<{ o: string }>(
    `select create_checkout(p_resource => $1::uuid, p_starts => $2::timestamptz, p_ends => $3::timestamptz,
       p_amount => 15000, p_net => 12605, p_tax => 2395, p_currency => 'CLP',
       p_customer => '{"name":"Ana","email":"ana@e.cl"}'::jsonb, p_snapshot => '{}'::jsonb,
       p_lines => $4::jsonb, p_ttl => null, p_terms_source => 'staff') o`,
    [resourceId, `${DAY}T${hour}:00:00-03:00`, `${DAY}T${hour + 1}:00:00-03:00`, LINES],
  );
  if (createdAt) await pg.query("update orders set created_at = $2 where id = $1", [rows[0].o, createdAt]);
  return rows[0].o;
}

describe("parte protegida", () => {
  it("antes del corte, todo lo ganado queda protegido", async () => {
    const c = await customer();
    await apply(c, "earn", 1000, "a");
    await apply(c, "redeem", -300, "b");
    await apply(c, "earn", 200, "c");
    expect(await state(c)).toMatchObject({ balance: 900, protected: 900, activity: true });
    await expectConsistent(c);
  });

  it("después del corte, lo nuevo vence y se gasta primero", async () => {
    const c = await customer();
    await apply(c, "earn", 1000, "legacy");
    await setCutoff("now() - interval '1 day'");
    await apply(c, "earn", 500, "nuevo");
    expect(await state(c)).toMatchObject({ balance: 1500, protected: 1000 });
    await apply(c, "redeem", -300, "canje1");
    expect(await state(c)).toMatchObject({ balance: 1200, protected: 1000 });
    await apply(c, "redeem", -700, "canje2"); // agota los 200 que vencen y toca 500 protegidos
    expect(await state(c)).toMatchObject({ balance: 500, protected: 500 });
    await apply(c, "earn_revoke", -600, "claw"); // deuda: la parte protegida no baja de 0
    expect(await state(c)).toMatchObject({ balance: -100, protected: 0 });
    await expectConsistent(c);
  });

  it("lo que vuelve de un pedido anterior al corte vuelve protegido; de uno nuevo, no", async () => {
    const c = await customer();
    await apply(c, "earn", 1000, "legacy");
    const viejo = await order(14, "2026-01-01T12:00:00Z");
    await setCutoff("now() - interval '1 day'");
    const nuevo = await order(16);
    await apply(c, "redeem", -1000, "", viejo);
    expect(await state(c)).toMatchObject({ balance: 0, protected: 0 });
    await apply(c, "redeem_restore", 600, "r1", viejo);
    expect(await state(c)).toMatchObject({ balance: 600, protected: 600 });
    await apply(c, "redeem_restore", 300, "r2", nuevo);
    expect(await state(c)).toMatchObject({ balance: 900, protected: 600 });
    await expectConsistent(c);
  });
});

describe("el reloj", () => {
  it("earn y redeem reinician el reloj y los avisos; un ajuste no", async () => {
    const c = await customer();
    await setCutoff("now() - interval '1 day'");
    await apply(c, "adjust", 400, "regalo");
    expect((await state(c)).activity).toBe(false);
    await pg.query("update customers set points_expiry_notice_30_at = now(), points_expiry_notice_7_at = now() where id = $1", [c]);
    await apply(c, "adjust", 100, "regalo2");
    expect(await state(c)).toMatchObject({ n30: true, n7: true });
    await apply(c, "earn", 50, "reserva");
    expect(await state(c)).toMatchObject({ activity: true, n30: false, n7: false });
  });
});

describe("expire_beatcoins", () => {
  async function stale(c: string, months: number) {
    await pg.query(`update customers set points_activity_at = now() - make_interval(months => $2) where id = $1`, [c, months]);
  }

  it("antes del corte no vence nada", async () => {
    const c = await customer();
    await apply(c, "adjust", 400, "x");
    await pg.query("update customers set points_protected = 0 where id = $1", [c]);
    await stale(c, 24);
    expect((await pg.query("select * from expire_beatcoins()")).rows).toEqual([]);
  });

  it("vence solo la parte no protegida, una vez, y deja el ledger cuadrado", async () => {
    const c = await customer();
    await apply(c, "earn", 1000, "legacy");
    await setCutoff("now() - interval '13 months'");
    await apply(c, "earn", 500, "nuevo");
    await stale(c, 12);
    const first = await pg.query<{ customer_id: string; expired: number }>("select * from expire_beatcoins()");
    expect(first.rows).toEqual([{ customer_id: c, expired: 500 }]);
    expect(await state(c)).toMatchObject({ balance: 1000, protected: 1000 });
    const { rows } = await pg.query(
      "select points_last_expired_amount amt, points_last_expired_at is not null at, points_expired_notice_at from customers where id = $1",
      [c],
    );
    expect(rows[0]).toEqual({ amt: 500, at: true, points_expired_notice_at: null });
    expect((await pg.query("select * from expire_beatcoins()")).rows).toEqual([]);
    await expectConsistent(c);
  });

  it("el reloj cuenta desde el corte si la última actividad es anterior", async () => {
    const c = await customer();
    await setCutoff("now() - interval '6 months'");
    await apply(c, "adjust", 300, "regalo");
    await stale(c, 24); // actividad vieja, pero el corte fue hace 6 meses → vence en 6 meses más
    expect((await pg.query("select * from expire_beatcoins()")).rows).toEqual([]);
  });

  it("dentro de los 12 meses no vence; con saldo negativo, nada", async () => {
    const a = await customer("a@e.cl");
    const b = await customer("b@e.cl");
    await setCutoff("now() - interval '2 years'");
    await apply(a, "earn", 500, "nuevo");
    await stale(a, 11);
    await apply(b, "earn_revoke", -200, "deuda");
    await stale(b, 24);
    expect((await pg.query("select * from expire_beatcoins()")).rows).toEqual([]);
  });
});

describe("beatcoins_expiry_due", () => {
  const due = async (days: number) =>
    (await pg.query<{ customer_id: string; expirable: number; protected: number }>("select * from beatcoins_expiry_due($1)", [days])).rows;
  const expiresIn = (c: string, days: number) =>
    pg.query(
      `update customers set points_activity_at = now() + make_interval(days => $2) - make_interval(months => 12) where id = $1`,
      [c, days],
    );

  it("separa la ventana de 30 días de la de 7 y respeta los avisos ya enviados", async () => {
    const lejos = await customer("lejos@e.cl");
    const mes = await customer("mes@e.cl");
    const semana = await customer("semana@e.cl");
    await setCutoff("now() - interval '2 years'");
    for (const c of [lejos, mes, semana]) await apply(c, "earn", 400, "x");
    await expiresIn(lejos, 45);
    await expiresIn(mes, 20);
    await expiresIn(semana, 3);
    expect((await due(30)).map((r) => r.customer_id)).toEqual([mes]);
    expect((await due(7)).map((r) => r.customer_id)).toEqual([semana]);
    expect((await due(7))[0]).toMatchObject({ expirable: 400, protected: 0 });
    await pg.query("update customers set points_expiry_notice_30_at = now() where id = $1", [mes]);
    expect(await due(30)).toEqual([]);
  });

  it("sin correo no es candidato; una ventana inválida falla", async () => {
    const c = await customer("x@e.cl");
    await pg.query("update customers set email = null, phone = '+56911112222' where id = $1", [c]);
    await setCutoff("now() - interval '2 years'");
    await apply(c, "earn", 400, "x");
    await expiresIn(c, 3);
    expect(await due(7)).toEqual([]);
    await expect(pg.query("select * from beatcoins_expiry_due(10)")).rejects.toThrow(/beatcoins_bad_window/);
  });
});

describe("permisos", () => {
  it("anon y authenticated no pueden ejecutar los RPC de Beatcoins", async () => {
    const { rows } = await pg.query<{ ok: boolean }>(
      `select bool_or(has_function_privilege(r, f, 'execute')) ok
         from unnest(array['anon','authenticated']) r,
              unnest(array['apply_points(uuid,uuid,points_entry_kind,int,text)',
                           'expire_beatcoins(timestamptz)',
                           'beatcoins_expiry_due(int,timestamptz)',
                           'beatcoins_expires_at(timestamptz)']) f`,
    );
    expect(rows[0].ok).toBe(false);
  });

  it("cada cliente recibe un token de baja distinto", async () => {
    await customer("a@e.cl");
    await customer("b@e.cl");
    const { rows } = await pg.query<{ n: number }>("select count(distinct email_unsubscribe_token)::int n from customers");
    expect(rows[0].n).toBe(2);
  });
});
