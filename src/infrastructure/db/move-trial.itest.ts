/**
 * Mover la sesión de prueba del curso (migración 20261011120000), contra la DB real:
 * move_trial_reservation cambia solo la hora (1 h, futura, sin choque), deja el rastro de
 * un reagendamiento sin pedido + el evento 'reschedule_moved', reinicia el recordatorio y
 * recalcula el vencimiento del crédito. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { futureDate } from "@/tests/dates";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const DAY = futureDate(3);
const at = (hh: string, day = DAY) => `${day}T${hh}:00:00-03:00`;

const clean = async () => {
  await pg.query("truncate course_credits cascade");
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

/** Reserva vía create_checkout (hold firme, como la crea el admin); devuelve la reserva. */
async function reservation(kind: "trial" | "booking" = "trial", hh = "16"): Promise<{ id: string; orderId: string }> {
  const { rows } = await pg.query<{ order_id: string }>(
    `select create_checkout(
       p_resource => $1::uuid, p_starts => $2::timestamptz, p_ends => $3::timestamptz,
       p_amount => 19990, p_net => 16798, p_tax => 3192, p_currency => 'CLP',
       p_customer => '{"name":"Martín","email":"martin@e.cl"}'::jsonb, p_snapshot => '{}'::jsonb,
       p_lines => '[{"line_type":"room_time","description":"Sesión de prueba Curso DJ · 1 h","quantity":1,"unit_price_clp":19990,"subtotal_clp":19990}]'::jsonb,
       p_ttl => null, p_terms_source => 'staff', p_order_kind => $4) as order_id`,
    [resourceId, at(hh), at(String(Number(hh) + 1)), kind],
  );
  const orderId = rows[0].order_id;
  const r = await pg.query<{ id: string }>("select id from reservations where order_id = $1", [orderId]);
  return { id: r.rows[0].id, orderId };
}

const move = (id: string, starts: string, ends: string) =>
  pg.query<{ m: { old_starts_at: string; old_ends_at: string; order_id: string } }>(
    "select move_trial_reservation($1, $2::timestamptz, $3::timestamptz) m",
    [id, starts, ends],
  );

const row = async (id: string) =>
  (
    await pg.query<{ starts: string; ends: string; reminder: string | null }>(
      "select starts_at::text starts, ends_at::text ends, reminder_sent_at::text reminder from reservations where id = $1",
      [id],
    )
  ).rows[0];

const ms = (s: string) => new Date(s).getTime();

describe("move_trial_reservation", () => {
  it("mueve la prueba, reinicia el recordatorio y devuelve la hora vieja + el pedido", async () => {
    const t = await reservation();
    await pg.query("update reservations set reminder_sent_at = now() where id = $1", [t.id]);
    const { rows } = await move(t.id, at("18"), at("19"));
    expect(ms(rows[0].m.old_starts_at)).toBe(ms(at("16")));
    expect(ms(rows[0].m.old_ends_at)).toBe(ms(at("17")));
    expect(rows[0].m.order_id).toBe(t.orderId);
    const r = await row(t.id);
    expect(ms(r.starts)).toBe(ms(at("18")));
    expect(ms(r.ends)).toBe(ms(at("19")));
    expect(r.reminder).toBeNull();
  });

  it("libera la hora vieja: otra reserva puede tomarla", async () => {
    const t = await reservation();
    await move(t.id, at("18"), at("19"));
    await expect(reservation("booking", "16")).resolves.toBeTruthy();
  });

  it("deja un reagendamiento sin pedido ni plata y el evento 'reschedule_moved'", async () => {
    const t = await reservation();
    await move(t.id, at("18"), at("19"));
    const r = await pg.query(
      `select original_order_id, kind, status, delta_clp, old_starts_at, new_starts_at
         from reschedules where reservation_id = $1`,
      [t.id],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ original_order_id: null, kind: "equal", status: "applied", delta_clp: 0 });
    const ev = await pg.query<{ detail: { old_starts_at: string; new_starts_at: string }; reschedule_id: string }>(
      "select detail, reschedule_id from booking_events where reservation_id = $1 and type = 'reschedule_moved'",
      [t.id],
    );
    expect(ev.rows).toHaveLength(1);
    expect(ms(ev.rows[0].detail.old_starts_at)).toBe(ms(at("16")));
    expect(ms(ev.rows[0].detail.new_starts_at)).toBe(ms(at("18")));
    expect(ev.rows[0].reschedule_id).toBeTruthy();
  });

  it("recalcula el vencimiento del crédito vivo, no el de uno consumido", async () => {
    const t = await reservation();
    await pg.query("select confirm_payment($1, null::text, 'transferencia')", [t.orderId]);
    await move(t.id, at("18"), at("19"));
    const c = await pg.query<{ expires: string }>(
      "select expires_at::text expires from course_credits where source_reservation_id = $1",
      [t.id],
    );
    expect(ms(c.rows[0].expires)).toBe(ms(at("18")) + 7 * 24 * 3600_000);

    // Consumido: su vencimiento ya no importa y no se toca.
    await pg.query(
      "update course_credits set consumed_order_id = $2, consumed_at = now() where source_reservation_id = $1",
      [t.id, t.orderId],
    );
    await move(t.id, at("20"), at("21"));
    const c2 = await pg.query<{ expires: string }>(
      "select expires_at::text expires from course_credits where source_reservation_id = $1",
      [t.id],
    );
    expect(ms(c2.rows[0].expires)).toBe(ms(at("18")) + 7 * 24 * 3600_000);
  });

  it("sobre una hora ocupada → trial_slot_taken y nada cambia", async () => {
    const t = await reservation();
    await reservation("booking", "18");
    await expect(move(t.id, at("18"), at("19"))).rejects.toThrow(/trial_slot_taken/);
    expect(ms((await row(t.id)).starts)).toBe(ms(at("16")));
    const r = await pg.query("select 1 from reschedules where reservation_id = $1", [t.id]);
    expect(r.rowCount).toBe(0);
  });

  it.each([
    ["dura distinto de 1 h", () => [at("18"), at("20")], /trial_bad_range/],
    ["al pasado", () => ["2020-01-01T10:00:00-03:00", "2020-01-01T11:00:00-03:00"], /trial_in_past/],
    ["a la misma hora", () => [at("16"), at("17")], /trial_same_slot/],
  ])("rechaza moverla %s", async (_label, range, err) => {
    const t = await reservation();
    const [s, e] = range();
    await expect(move(t.id, s, e)).rejects.toThrow(err);
  });

  it("no mueve un ensayo (booking) ni una prueba cancelada", async () => {
    const b = await reservation("booking");
    await expect(move(b.id, at("18"), at("19"))).rejects.toThrow(/trial_not_movable/);
    const t = await reservation("trial", "12");
    await pg.query("update reservations set status = 'cancelled', cancelled_at = now() where id = $1", [t.id]);
    await expect(move(t.id, at("18"), at("19"))).rejects.toThrow(/trial_not_movable/);
  });
});
