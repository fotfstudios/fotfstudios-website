/**
 * Mover una hora de práctica libre del curso (migración 20261012120000), contra la DB real:
 * move_practice_reservation cambia solo el horario (la duración es la de la reserva), no toca
 * el saldo, conserva el PIN cargado y reinicia su envío y el recordatorio, y deja el rastro de
 * un reagendamiento sin pedido. Requiere Supabase local.
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
const DAY = futureDate(4, 2);
const at = (hhmm: string, day = DAY) => `${day}T${hhmm}:00-03:00`;
const ms = (s: string) => new Date(s).getTime();

const clean = async () => {
  await pg.query(
    "truncate course_credits, course_practice_redemptions, course_enrollments, course_sessions, course_leads, course_generations cascade",
  );
  await pg.query("truncate reservations, orders, order_lines, tax_documents, points_ledger, booking_events, customers cascade");
};
beforeAll(async () => {
  await pg.connect();
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await pg.end();
});

/** Inscripción pagada con una práctica de `hours` horas desde las 16:00. */
async function practice(hours = 2): Promise<{ enrollmentId: string; reservationId: string; generationId: string }> {
  const r = await repo.createProgram({
    plan: "individual",
    students: [{ name: "Alumno", email: "a@correo.cl", phone: "+56912345678" }],
    prices: PRECIOS,
  });
  await pg.query("select confirm_course_payment($1, 'offline:transferencia', 'transferencia')", [r.orderId]);
  const enrollmentId = r.enrollmentIds[0];
  const end = `${String(16 + hours).padStart(2, "0")}:00`;
  const reservationId = await repo.redeemPracticeHours(enrollmentId, { startsAt: at("16:00"), endsAt: at(end), hours });
  const g = await pg.query<{ g: string }>("select generation_id g from course_enrollments where id = $1", [enrollmentId]);
  return { enrollmentId, reservationId, generationId: g.rows[0].g };
}

const move = (id: string, starts: string) =>
  pg.query<{ m: { old_starts_at: string; old_ends_at: string; ends_at: string; enrollment_id: string; access_loaded: boolean } }>(
    "select move_practice_reservation($1, $2::timestamptz) m",
    [id, starts],
  );

const row = async (id: string) =>
  (
    await pg.query<{
      starts: string;
      ends: string;
      reminder: string | null;
      code: string | null;
      loaded: string | null;
      sent: string | null;
      removed: string | null;
    }>(
      `select starts_at::text starts, ends_at::text ends, reminder_sent_at::text reminder, access_code code,
              access_loaded_at::text loaded, access_sent_at::text sent, access_removed_at::text removed
         from reservations where id = $1`,
      [id],
    )
  ).rows[0];

const redeemed = async (enrollmentId: string) =>
  (await pg.query<{ n: number }>("select practice_hours_redeemed n from course_enrollments where id = $1", [enrollmentId])).rows[0].n;

describe("move_practice_reservation", () => {
  it("mueve conservando la duración (2 h) y devuelve la hora vieja, el fin nuevo y la inscripción", async () => {
    const p = await practice(2);
    const { rows } = await move(p.reservationId, at("10:00"));
    expect(ms(rows[0].m.old_starts_at)).toBe(ms(at("16:00")));
    expect(ms(rows[0].m.old_ends_at)).toBe(ms(at("18:00")));
    expect(ms(rows[0].m.ends_at)).toBe(ms(at("12:00")));
    expect(rows[0].m.enrollment_id).toBe(p.enrollmentId);
    const r = await row(p.reservationId);
    expect(ms(r.starts)).toBe(ms(at("10:00")));
    expect(ms(r.ends)).toBe(ms(at("12:00")));
  });

  it("no toca el saldo ni la redención", async () => {
    const p = await practice(2);
    const before = await redeemed(p.enrollmentId);
    await move(p.reservationId, at("10:00"));
    expect(await redeemed(p.enrollmentId)).toBe(before);
    const red = await pg.query("select 1 from course_practice_redemptions where reservation_id = $1 and released_at is null", [
      p.reservationId,
    ]);
    expect(red.rowCount).toBe(1);
  });

  it("libera la hora vieja", async () => {
    const p = await practice(2);
    await move(p.reservationId, at("10:00"));
    const free = await pg.query(
      `select count(*)::int n from reservations where status in ('held','confirmed')
         and tstzrange(starts_at, ends_at) && tstzrange($1::timestamptz, $2::timestamptz)`,
      [at("16:00"), at("18:00")],
    );
    expect(free.rows[0].n).toBe(0);
  });

  it("PIN cargado: se conserva (código + cargado) y se reinician su envío y el recordatorio", async () => {
    const p = await practice(1);
    await pg.query(
      "update reservations set access_code = '4471', access_loaded_at = now(), access_sent_at = now(), reminder_sent_at = now() where id = $1",
      [p.reservationId],
    );
    const { rows } = await move(p.reservationId, at("10:00"));
    expect(rows[0].m.access_loaded).toBe(true);
    const r = await row(p.reservationId);
    expect(r).toMatchObject({ code: "4471", sent: null, reminder: null, removed: null });
    expect(r.loaded).not.toBeNull();
  });

  it("PIN ya quitado de la cerradura: el mismo código vuelve a 'por cargar'", async () => {
    const p = await practice(1);
    await pg.query(
      "update reservations set access_code = '4471', access_loaded_at = now(), access_sent_at = now(), access_removed_at = now() where id = $1",
      [p.reservationId],
    );
    const { rows } = await move(p.reservationId, at("10:00"));
    expect(rows[0].m.access_loaded).toBe(false);
    expect(await row(p.reservationId)).toMatchObject({ code: "4471", loaded: null, sent: null, removed: null });
  });

  it("deja un reagendamiento sin pedido ni plata y el evento 'reschedule_moved'", async () => {
    const p = await practice(1);
    await move(p.reservationId, at("10:00"));
    const r = await pg.query("select original_order_id, kind, status, delta_clp from reschedules where reservation_id = $1", [
      p.reservationId,
    ]);
    expect(r.rows).toEqual([{ original_order_id: null, kind: "equal", status: "applied", delta_clp: 0 }]);
    const ev = await pg.query<{ detail: { old_starts_at: string; new_starts_at: string } }>(
      "select detail from booking_events where reservation_id = $1 and type = 'reschedule_moved'",
      [p.reservationId],
    );
    expect(ev.rows).toHaveLength(1);
    expect(ms(ev.rows[0].detail.new_starts_at)).toBe(ms(at("10:00")));
  });

  it("sobre una hora ocupada → practica_slot_taken y nada cambia", async () => {
    const p = await practice(2);
    await pg.query(
      "insert into reservations (resource_id, kind, status, starts_at, ends_at) select resource_id, 'block', 'confirmed', $2, $3 from reservations where id = $1",
      [p.reservationId, at("11:00"), at("12:00")],
    );
    await expect(move(p.reservationId, at("10:00"))).rejects.toThrow(/practica_slot_taken/);
    expect(ms((await row(p.reservationId)).starts)).toBe(ms(at("16:00")));
    expect((await pg.query("select 1 from reschedules where reservation_id = $1", [p.reservationId])).rowCount).toBe(0);
  });

  it.each([
    ["al pasado", () => "2020-01-01T10:00:00-03:00", /practica_en_pasado/],
    ["a la misma hora", () => at("16:00"), /practica_mismo_horario/],
  ])("rechaza moverla %s", async (_label, starts, err) => {
    const p = await practice(1);
    await expect(move(p.reservationId, starts())).rejects.toThrow(err);
  });

  it("rechaza un día fuera del plazo de la práctica", async () => {
    const p = await practice(1);
    await pg.query("update course_generations set practice_valid_until = $2::date where id = $1", [p.generationId, DAY]);
    const later = futureDate(4, 3);
    await expect(move(p.reservationId, at("10:00", later))).rejects.toThrow(/practica_vencida/);
  });

  it("no mueve una práctica liberada ni una reserva que no es práctica", async () => {
    const p = await practice(1);
    await pg.query("select release_practice_hours($1)", [p.reservationId]);
    await expect(move(p.reservationId, at("10:00"))).rejects.toThrow(/practica_no_movible/);

    const other = await pg.query<{ id: string }>(
      "insert into reservations (resource_id, kind, status, starts_at, ends_at) select resource_id, 'booking', 'confirmed', $2, $3 from reservations where id = $1 returning id",
      [p.reservationId, at("20:00"), at("21:00")],
    );
    await expect(move(other.rows[0].id, at("10:00"))).rejects.toThrow(/practica_no_movible/);
  });

  it("no mueve si la inscripción ya no está pagada", async () => {
    const p = await practice(1);
    await pg.query("update course_enrollments set status = 'anulada' where id = $1", [p.enrollmentId]);
    await expect(move(p.reservationId, at("10:00"))).rejects.toThrow(/practica_no_elegible/);
  });
});
