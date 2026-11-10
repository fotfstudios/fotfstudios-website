/**
 * Motor de reseñas contra la DB real: la ventana (≥3 h, ≤7 días tras el fin), el candado
 * "una vez por cliente" (customers.review_requested_at) y la regla del curso (solo la última
 * sesión). Requiere Supabase local. El reloj es el de la DB (la función usa now()).
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewRequestService } from "@/src/application/reminders/review-request-service";
import { SupabaseReviewRequestRepository } from "./review-request-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseReviewRequestRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup =
  "truncate course_sessions, course_generations, reservations, orders, order_lines, booking_events, points_ledger, customers cascade";

const h = 3600_000;

/** Cliente con email; `asked`=true lo marca como ya invitado a reseñar. */
async function customer(o: { email?: string; name?: string; asked?: boolean } = {}): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `insert into customers (email, name, review_requested_at) values ($1, $2, $3) returning id`,
    [o.email ?? "ana@e.cl", o.name ?? "Ana", o.asked ? new Date().toISOString() : null],
  );
  return r.rows[0].id;
}

/**
 * Reserva que TERMINÓ hace `endsAgoH` horas (dura 1 h); slot único para no chocar el EXCLUDE.
 * La ficha se resuelve por `email` (customer_email denormalizado), como en producción.
 */
async function resv(o: {
  endsAgoH: number;
  kind?: "booking" | "prueba" | "curso";
  status?: "held" | "confirmed" | "cancelled";
  email?: string | null;
}): Promise<string> {
  const ends = new Date(Date.now() - o.endsAgoH * h);
  const starts = new Date(ends.getTime() - h);
  const r = await pg.query<{ id: string }>(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, customer_email)
       values ($1, $2, $3, $4, $5, $6) returning id`,
    [resourceId, o.kind ?? "booking", o.status ?? "confirmed", starts.toISOString(), ends.toISOString(), o.email === undefined ? "ana@e.cl" : o.email],
  );
  return r.rows[0].id;
}

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

describe("reviewsDue — la ventana y el candado", () => {
  it("devuelve una reserva de sala completada hace 4 h, cliente sin invitar (visit=sala)", async () => {
    const c = await customer();
    const id = await resv({ endsAgoH: 4 });
    const due = await repo.reviewsDue();
    expect(due).toEqual([{ reservationId: id, customerId: c, email: "ana@e.cl", name: "Ana", visit: "sala" }]);
  });

  it("excluye: terminó hace 1 h (muy reciente), hace 8 días (fuera de ventana), held, sin ficha, ya invitado", async () => {
    await customer();
    // Slots separados ≥2 h: la exclusion constraint rechaza rangos que compartan borde.
    await resv({ endsAgoH: 1 }); // ana, < 3 h
    await customer({ email: "b@e.cl" });
    await resv({ endsAgoH: 24 * 8, email: "b@e.cl" }); // > 7 días
    await customer({ email: "c@e.cl" });
    await resv({ endsAgoH: 8, status: "held", email: "c@e.cl" });
    await resv({ endsAgoH: 12, email: "ghost@e.cl" }); // sin ficha (email sin customer)
    await customer({ email: "d@e.cl", asked: true });
    await resv({ endsAgoH: 16, email: "d@e.cl" }); // ya invitado
    expect(await repo.reviewsDue()).toEqual([]);
  });

  it("prueba completada → visit=prueba", async () => {
    await customer();
    await resv({ endsAgoH: 4, kind: "prueba" });
    expect((await repo.reviewsDue()).map((r) => r.visit)).toEqual(["prueba"]);
  });
});

describe("curso — no dispara por reserva (el alumno se capta por su prueba)", () => {
  it("una sesión guiada del curso no pide reseña, aunque exista la ficha", async () => {
    // Una guiada no conserva customer_email al enlazarse a course_sessions, y su kind no
    // está en la lista. El alumno ya quedó cubierto por el disparo de su prueba.
    await customer({ email: "z@e.cl", name: "Zoe" });
    await resv({ endsAgoH: 4, kind: "curso", email: "z@e.cl" });
    expect(await repo.reviewsDue()).toEqual([]);
  });
});

describe("el reclamo por cliente", () => {
  it("dos reclamos simultáneos del mismo cliente: uno gana; release lo suelta", async () => {
    const c = await customer();
    await resv({ endsAgoH: 4 });
    const [a, b] = await Promise.all([repo.claimReviewRequested(c), repo.claimReviewRequested(c)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await repo.reviewsDue()).toEqual([]);
    await repo.releaseReviewRequested(c);
    expect((await repo.reviewsDue()).length).toBe(1);
  });
});

describe("ReviewRequestService.sweep contra la DB", () => {
  it("un cliente con dos sesiones completadas recibe UN correo; la segunda corrida no manda nada", async () => {
    await customer();
    await resv({ endsAgoH: 4 });
    await resv({ endsAgoH: 8 });
    const notifications = { notifyReviewRequest: vi.fn(async () => {}) };
    const svc = new ReviewRequestService(repo, notifications);
    expect(await svc.sweep()).toEqual({ sent: 1, skippedAlreadyAsked: 1 });
    expect(await svc.sweep()).toEqual({ sent: 0, skippedAlreadyAsked: 0 });
    expect(notifications.notifyReviewRequest).toHaveBeenCalledTimes(1);
  });
});
