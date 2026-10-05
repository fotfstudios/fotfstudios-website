/**
 * La prueba del Curso de DJ como reserva propia (migración 20261007130000), contra la
 * DB real: create_checkout con p_order_kind='trial' crea reserva 'prueba' + pedido
 * 'trial'; confirm_payment emite el crédito por lo pagado (vence 7 días después de la
 * sesión, uno por reserva); un reembolso total lo anula; extend_course_credit lo
 * extiende; inscribirse cierra la solicitud por email. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { futureDate } from "@/tests/dates";
import { SupabaseCourseRepository } from "./course-repository";
import { createServiceClient } from "./supabase-client";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
const repo = new SupabaseCourseRepository(
  createServiceClient(process.env.SUPABASE_URL ?? "http://127.0.0.1:54421", process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""),
);
const PRECIOS = { duo: 149990, individual: 249990, prueba: 19990 };
let resourceId: string;
const DAY = futureDate(3);
const STARTS = `${DAY}T16:00:00-03:00`;

const clean = async () => {
  await pg.query(
    "truncate course_credits, course_practice_redemptions, course_enrollments, course_sessions, course_leads, course_generations cascade",
  );
  await pg.query("truncate reservations, orders, order_lines, payment_intents, tax_documents, points_ledger, booking_events, customers cascade");
};

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await pg.end();
});

/** Prueba pendiente (hold firme, como la crea el admin), 1 h a $19.990 con IVA. */
async function trial(email = "martin@e.cl", kind: "trial" | "booking" = "trial"): Promise<string> {
  const { rows } = await pg.query<{ order_id: string }>(
    `select create_checkout(
       p_resource => $1::uuid, p_starts => $2::timestamptz, p_ends => $3::timestamptz,
       p_amount => 19990, p_net => 16798, p_tax => 3192, p_currency => 'CLP',
       p_customer => $4::jsonb, p_snapshot => '{}'::jsonb,
       p_lines => '[{"line_type":"room_time","description":"Sesión de prueba Curso DJ · 1 h","quantity":1,"unit_price_clp":19990,"subtotal_clp":19990}]'::jsonb,
       p_ttl => null, p_terms_source => 'staff', p_order_kind => $5) as order_id`,
    [resourceId, STARTS, `${DAY}T17:00:00-03:00`, JSON.stringify({ name: "Martín", email }), kind],
  );
  return rows[0].order_id;
}

const credit = async (orderId: string) =>
  (
    await pg.query<{ id: string; email: string; amount: number; expires: string; voided: string | null }>(
      `select c.id, c.email, c.amount_clp amount, c.expires_at::text expires, c.voided_at::text voided
         from course_credits c join reservations r on r.id = c.source_reservation_id where r.order_id = $1`,
      [orderId],
    )
  ).rows;

describe("create_checkout con p_order_kind", () => {
  it("una prueba nace como reserva 'prueba' + pedido 'trial'", async () => {
    const id = await trial();
    const r = await pg.query<{ rk: string; ok: string }>(
      "select r.kind rk, o.kind ok from orders o join reservations r on r.order_id = o.id where o.id = $1",
      [id],
    );
    expect(r.rows[0]).toEqual({ rk: "prueba", ok: "trial" });
  });

  it("por defecto sigue siendo un ensayo (booking/booking)", async () => {
    const id = await trial("x@e.cl", "booking");
    const r = await pg.query<{ rk: string; ok: string }>(
      "select r.kind rk, o.kind ok from orders o join reservations r on r.order_id = o.id where o.id = $1",
      [id],
    );
    expect(r.rows[0]).toEqual({ rk: "booking", ok: "booking" });
  });

  it("rechaza un tipo de pedido desconocido", async () => {
    await expect(
      pg.query(
        `select create_checkout(p_resource => $1::uuid, p_starts => $2::timestamptz, p_ends => $3::timestamptz,
           p_amount => 1, p_net => 1, p_tax => 0, p_currency => 'CLP', p_customer => '{}'::jsonb,
           p_snapshot => '{}'::jsonb, p_lines => '[]'::jsonb, p_order_kind => 'course')`,
        [resourceId, STARTS, `${DAY}T17:00:00-03:00`],
      ),
    ).rejects.toThrow(/order_kind_invalid/);
  });
});

describe("crédito de la prueba", () => {
  it("al pagarse nace el crédito por lo pagado, que vence 7 días después de la sesión", async () => {
    const id = await trial("Martin@E.cl");
    expect((await pg.query<{ c: string }>("select confirm_payment($1, null::text, 'transferencia') c", [id])).rows[0].c).toBe(
      "confirmed",
    );
    const [c] = await credit(id);
    expect(c).toMatchObject({ email: "martin@e.cl", amount: 19990, voided: null });
    expect(new Date(c.expires).getTime()).toBe(new Date(STARTS).getTime() + 7 * 24 * 3600_000);
    // Boleta de la prueba (sala con IVA) + evento de pago en su línea de tiempo.
    const t = await pg.query<{ neto: number; iva: number }>("select neto, iva from tax_documents where order_id = $1", [id]);
    expect(t.rows).toEqual([{ neto: 16798, iva: 3192 }]);
    const ev = await pg.query("select 1 from booking_events where order_id = $1 and type = 'payment_confirmed'", [id]);
    expect(ev.rowCount).toBe(1);
  });

  it("una re-entrega del mismo pago no duplica el crédito", async () => {
    const id = await trial();
    await pg.query("select confirm_payment($1, 'mp_1', 'mercadopago')", [id]);
    await pg.query("select confirm_payment($1, 'mp_1', 'mercadopago')", [id]);
    expect(await credit(id)).toHaveLength(1);
  });

  it("un ensayo pagado no emite crédito", async () => {
    const id = await trial("x@e.cl", "booking");
    await pg.query("select confirm_payment($1, null::text, 'efectivo')", [id]);
    expect((await pg.query("select 1 from course_credits")).rowCount).toBe(0);
  });

  it("devuelta entera: el crédito queda anulado; una devolución parcial no lo toca", async () => {
    const a = await trial("a@e.cl");
    await pg.query("select confirm_payment($1, null::text, 'transferencia')", [a]);
    await pg.query("select mark_refunded($1, 'offline:manual', 5000)", [a]);
    expect((await credit(a))[0].voided).toBeNull();
    await pg.query("select mark_refunded($1, 'offline:manual')", [a]);
    expect((await credit(a))[0].voided).not.toBeNull();
  });
});

describe("extend_course_credit", () => {
  const issue = async (expires: string, extra = "") =>
    (
      await pg.query<{ id: string }>(
        `insert into course_credits (email, amount_clp, expires_at${extra ? ", " + extra.split("=")[0] : ""})
         values ('e@e.cl', 19990, $1${extra ? ", " + extra.split("=")[1] : ""}) returning id`,
        [expires],
      )
    ).rows[0].id;
  const expiresOf = async (id: string) =>
    new Date((await pg.query<{ e: string }>("select expires_at::text e from course_credits where id = $1", [id])).rows[0].e).getTime();

  it("vigente: suma 7 días a su vencimiento y suelta el aviso de vencimiento", async () => {
    const until = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
    const id = await issue(until);
    await pg.query("update course_credits set expiry_reminder_sent_at = now() where id = $1", [id]);
    await pg.query("select extend_course_credit($1)", [id]);
    expect(await expiresOf(id)).toBe(new Date(until).getTime() + 7 * 24 * 3600_000);
    const r = await pg.query("select extended_count n, expiry_reminder_sent_at s from course_credits where id = $1", [id]);
    expect(r.rows[0]).toEqual({ n: 1, s: null });
  });

  it("vencido: cuenta 7 días desde hoy", async () => {
    const id = await issue(new Date(Date.now() - 3 * 24 * 3600_000).toISOString());
    const before = Date.now();
    await pg.query("select extend_course_credit($1)", [id]);
    expect(await expiresOf(id)).toBeGreaterThanOrEqual(before + 7 * 24 * 3600_000 - 5000);
  });

  it("anulado o usado: no se extiende", async () => {
    const id = await issue(new Date(Date.now() + 86_400_000).toISOString(), "voided_at=now()");
    await expect(pg.query("select extend_course_credit($1)", [id])).rejects.toThrow(/curso_credito_no_extensible/);
  });
});

describe("inscribirse cierra la solicitud", () => {
  it("sin lead explícito, cierra por email la solicitud abierta (nueva/contactada), no la descartada", async () => {
    await pg.query(
      `insert into course_leads (name, email, phone, plan, experience, availability, status) values
         ('Martín', 'martin@e.cl', '+56911111111', 'prueba', 'cero', 'tardes', 'contactada'),
         ('Otro', 'otro@e.cl', '+56922222222', 'prueba', 'cero', 'tardes', 'nueva'),
         ('Martín viejo', 'MARTIN@e.cl', '+56911111111', 'prueba', 'cero', 'tardes', 'descartada')`,
    );
    await repo.createProgram({
      plan: "individual",
      students: [{ name: "Martín", email: "Martin@e.cl", phone: "+56911111111" }],
      prices: PRECIOS,
    });
    const r = await pg.query<{ email: string; status: string }>("select email, status from course_leads order by name");
    expect(r.rows).toEqual([
      { email: "martin@e.cl", status: "inscrita" },
      { email: "MARTIN@e.cl", status: "descartada" },
      { email: "otro@e.cl", status: "nueva" },
    ]);
  });

  it("un crédito anulado no se puede usar al inscribir", async () => {
    const id = (
      await pg.query<{ id: string }>(
        "insert into course_credits (email, amount_clp, expires_at, voided_at) values ('m@e.cl', 19990, now() + interval '3 days', now()) returning id",
      )
    ).rows[0].id;
    await expect(
      repo.createProgram({
        plan: "individual",
        students: [{ name: "M", email: "m@e.cl", phone: "+56911111111" }],
        prices: PRECIOS,
        creditId: id,
      }),
    ).rejects.toThrow();
  });
});
