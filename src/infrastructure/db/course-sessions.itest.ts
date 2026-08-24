/**
 * Integración: agendar la generación bloquea la sala de verdad.
 *
 * El test que más importa es el de disponibilidad: prueba que una sesión de curso
 * desaparece de /reservar SIN que el motor de disponibilidad sepa nada del curso
 * (filtra por status, nunca por kind). Si alguien "limpia" ese query agregando un
 * filtro de kind, este test cae.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AvailabilityService } from "@/src/application/availability/availability-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { planSessions } from "@/src/domain/course/sessions";
import { futureDate } from "@/tests/dates";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseCourseRepository } from "./course-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { SupabaseSchedulingRepository } from "./scheduling-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const availability = new AvailabilityService(new SupabaseSchedulingRepository(db));
const checkout = new CheckoutService(
  new PricingService(new SupabaseRatePlanRepository(db)),
  new SupabaseCheckoutRepository(db),
);
const course = new SupabaseCourseRepository(db);
const pg = new Client({ connectionString: DB_URL });

const TZ = "America/Santiago";
const MON = futureDate(1); // lunes futuro, dentro del horario de apertura
const TITULOS = ["Sonido", "Beatmatching", "Armado de set", "Set final"];

let resourceId: string;

async function generation(code = "G01"): Promise<string> {
  const { rows } = await pg.query<{ id: string }>(
    `insert into course_generations
       (resource_id, code, name, status, seats, price_duo_clp, price_individual_clp, price_prueba_clp)
     values ($1, $2, 'Primera generación', 'borrador', 6, 79990, 139990, 19990) returning id`,
    [resourceId, code],
  );
  return rows[0].id;
}

/** Grilla semanal de 4×2 h a las 20:00, empezando el lunes futuro. */
const plan = (titles: readonly string[] = TITULOS) =>
  planSessions({ firstDate: MON, startMinute: 20 * 60, durationHours: 2, titles, tz: TZ });

const schedule = (gen: string, sessions = plan()) => course.scheduleSessions(gen, sessions);

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources where active limit 1")).rows[0].id;
});

afterAll(async () => {
  await pg.query("truncate course_enrollments, course_sessions, course_leads, course_generations cascade");
  await pg.query("truncate reservations, orders, order_lines cascade");
  await pg.end();
});

beforeEach(async () => {
  // course_sessions apunta a reservations con ON DELETE RESTRICT: se va primero.
  await pg.query("truncate course_enrollments, course_sessions, course_leads, course_generations cascade");
  await pg.query("truncate reservations, orders, order_lines cascade");
});

describe("schedule_course_generation — todo o nada", () => {
  it("crea las cuatro sesiones y sus bloques de sala", async () => {
    const gen = await generation();
    expect(await schedule(gen)).toBe(4);

    const res = await pg.query(
      "select count(*)::int as n from reservations where kind = 'curso' and status = 'confirmed'",
    );
    expect(res.rows[0].n).toBe(4);

    const ses = await pg.query(
      "select n, reservation_id from course_sessions where generation_id = $1 order by n", [gen]);
    expect(ses.rows.map((r) => r.n)).toEqual([1, 2, 3, 4]);
    expect(ses.rows.every((r) => r.reservation_id !== null)).toBe(true);
  });

  it("las cuatro caen a las 20:00 hora local", async () => {
    const gen = await generation();
    await schedule(gen);
    const { rows } = await pg.query<{ hora: string }>(
      `select to_char(starts_at at time zone 'America/Santiago', 'HH24:MI') as hora
         from reservations where kind = 'curso' order by starts_at`,
    );
    expect(rows.map((r) => r.hora)).toEqual(["20:00", "20:00", "20:00", "20:00"]);
  });

  // La razón de ser del diseño atómico: una generación a medio agendar es peor
  // que ninguna (el dueño no sabe cuál falta y la landing promete cuatro).
  it("si la sesión 3 choca con una reserva pagada, NO queda ninguna sesión", async () => {
    const sessions = plan();
    const tercera = sessions[2];

    // Un cliente ya tiene esa hora.
    const ocupada = await checkout.createBooking({
      resourceId,
      date: tercera.startsAt.slice(0, 10),
      startMinute: 20 * 60,
      durationHours: 2,
      customer: { email: "cliente@correo.cl" },
    });
    expect(ocupada.ok).toBe(true);

    const gen = await generation();
    await expect(schedule(gen, sessions)).rejects.toThrow(/curso_slot_taken:3/);

    const res = await pg.query("select count(*)::int as n from reservations where kind = 'curso'");
    expect(res.rows[0].n).toBe(0);
    const ses = await pg.query("select count(*)::int as n from course_sessions");
    expect(ses.rows[0].n).toBe(0);
  });

  it("re-enviar el formulario no duplica bloques", async () => {
    const gen = await generation();
    await schedule(gen);
    await expect(schedule(gen)).rejects.toThrow(/curso_already_scheduled/);
    const res = await pg.query("select count(*)::int as n from reservations where kind = 'curso'");
    expect(res.rows[0].n).toBe(4);
  });

  it("una sesión en el pasado se rechaza", async () => {
    const gen = await generation();
    const pasado = [{ n: 1, title: "Ayer", startsAt: "2020-01-01T20:00:00.000Z", endsAt: "2020-01-01T22:00:00.000Z" }];
    await expect(schedule(gen, pasado)).rejects.toThrow(/curso_in_past:1/);
  });

  it("una generación cerrada no se puede agendar", async () => {
    const gen = await generation();
    await pg.query("update course_generations set status = 'cerrada' where id = $1", [gen]);
    await expect(schedule(gen)).rejects.toThrow(/curso_generation_not_schedulable/);
  });
});

describe("preview_course_conflicts — mostrar el choque antes de intentar", () => {
  it("nombra la sesión, el cliente y el monto con el que choca", async () => {
    const sessions = plan();
    const segunda = sessions[1];
    const b = await checkout.createBooking({
      resourceId,
      date: segunda.startsAt.slice(0, 10),
      startMinute: 20 * 60,
      durationHours: 2,
      customer: { name: "Valentina Díaz", email: "vale@correo.cl" },
    });
    expect(b.ok).toBe(true);

    const conflicts = await course.previewConflicts(resourceId, sessions);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].n).toBe(2);
    expect(conflicts[0].customerName).toBe("Valentina Díaz");
    expect(conflicts[0].amountClp).toBeGreaterThan(0);
  });

  it("sin choques devuelve vacío y no escribe nada", async () => {
    expect(await course.previewConflicts(resourceId, plan())).toHaveLength(0);
    const res = await pg.query("select count(*)::int as n from reservations");
    expect(res.rows[0].n).toBe(0);
  });
});

describe("la sala queda bloqueada de verdad", () => {
  // EL test del feature. El motor de disponibilidad no sabe qué es un curso.
  it("la hora de la sesión desaparece de la disponibilidad pública", async () => {
    const gen = await generation();
    await schedule(gen);

    const r = await availability.getDayAvailability(resourceId, MON);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.booked).toContainEqual({ start: 1200, end: 1320 }); // 20:00–22:00
  });

  it("el checkout público sobre esa hora devuelve slot_taken", async () => {
    const gen = await generation();
    await schedule(gen);

    const b = await checkout.createBooking({
      resourceId, date: MON, startMinute: 20 * 60, durationHours: 1,
      customer: { email: "otro@correo.cl" },
    });
    expect(b.ok).toBe(false);
    if (b.ok) return;
    expect(b.error).toBe("slot_taken");
  });

  it("una hora adyacente sigue vendible", async () => {
    const gen = await generation();
    await schedule(gen);
    const b = await checkout.createBooking({
      resourceId, date: MON, startMinute: 18 * 60, durationHours: 2, // 18:00–20:00
      customer: { email: "vecino@correo.cl" },
    });
    expect(b.ok).toBe(true);
  });
});

describe("mover y cancelar sesiones", () => {
  it("mover una sesión libera la hora vieja y toma la nueva", async () => {
    const gen = await generation();
    await schedule(gen);
    const { rows } = await pg.query<{ id: string }>(
      "select id from course_sessions where generation_id = $1 and n = 1", [gen]);

    const nueva = planSessions({
      firstDate: MON, startMinute: 10 * 60, durationHours: 2, titles: ["x"], tz: TZ,
    })[0];
    await course.moveSession(rows[0].id, nueva.startsAt, nueva.endsAt);

    const r = await availability.getDayAvailability(resourceId, MON);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.booked).toContainEqual({ start: 600, end: 720 });   // 10:00 tomada
    expect(r.value.booked).not.toContainEqual({ start: 1200, end: 1320 }); // 20:00 libre
  });

  it("mover a una hora ocupada falla y no mueve nada", async () => {
    const gen = await generation();
    await schedule(gen);
    const ses = await pg.query<{ id: string; reservation_id: string }>(
      "select id, reservation_id from course_sessions where generation_id = $1 and n = 1", [gen]);
    const antes = await pg.query("select starts_at from reservations where id = $1", [ses.rows[0].reservation_id]);

    // La sesión 2 ya ocupa su horario: mover la 1 encima debe fallar.
    const s2 = plan()[1];
    await expect(
      course.moveSession(ses.rows[0].id, s2.startsAt, s2.endsAt),
    ).rejects.toThrow(/curso_slot_taken/);

    const despues = await pg.query("select starts_at from reservations where id = $1", [ses.rows[0].reservation_id]);
    expect(despues.rows[0].starts_at).toEqual(antes.rows[0].starts_at);
  });

  // Cancelar es cambio de estado, no DELETE: la hora se libera igual (el GiST
  // solo mira held/confirmed) y queda el rastro en booking_events.
  it("cancelar una sesión libera la hora y deja rastro", async () => {
    const gen = await generation();
    await schedule(gen);
    const { rows } = await pg.query<{ id: string; reservation_id: string }>(
      "select id, reservation_id from course_sessions where generation_id = $1 and n = 1", [gen]);
    await course.cancelSession(rows[0].id);

    const b = await checkout.createBooking({
      resourceId, date: MON, startMinute: 20 * 60, durationHours: 2,
      customer: { email: "aprovecha@correo.cl" },
    });
    expect(b.ok).toBe(true);

    const ev = await pg.query(
      "select type from booking_events where reservation_id = $1 order by seq", [rows[0].reservation_id]);
    expect(ev.rows.map((r) => r.type)).toContain("curso_session_cancelled");
    const res = await pg.query("select status from reservations where id = $1", [rows[0].reservation_id]);
    expect(res.rows[0].status).toBe("cancelled"); // no borrada
  });
});
