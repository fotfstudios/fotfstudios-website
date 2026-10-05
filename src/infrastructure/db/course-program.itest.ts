/**
 * Integración: el programa 1:1 del Curso de DJ (una fila de course_generations
 * por pedido). Las garantías viven en POSTGRES:
 *
 * - `create_course_program` crea programa + pedido + cupos en una transacción,
 *   con 6 horas de práctica por cupo.
 * - Cuando un programa se queda sin alumnos vivos —por CUALQUIER camino: anular,
 *   reembolso total, barrido de 72 h, o el UPDATE directo de "anular pagada"—
 *   sus sesiones agendadas sueltan la sala. Una cohorte antigua no se toca.
 * - Una sesión cancelada se puede volver a agendar.
 * - La práctica vence 90 días después de la última sesión.
 */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { planSessions } from "@/src/domain/course/sessions";
import { futureDate } from "@/tests/dates";
import { SupabaseCourseRepository } from "./course-repository";
import { createServiceClient } from "./supabase-client";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const repo = new SupabaseCourseRepository(
  createServiceClient(process.env.SUPABASE_URL ?? "http://127.0.0.1:54421", process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""),
);
const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

const TZ = "America/Santiago";
const TITULOS = ["Sonido", "Beatmatching", "Frases", "Rekordbox", "Set y FX", "Set final"];
const alumno = (n: number) => ({ name: `Alumno ${n}`, email: `p${n}@correo.cl`, phone: "+56912345678" });

async function resourceId(): Promise<string> {
  return (await raw("select id from resources where active order by created_at limit 1")).rows[0].id;
}

/** Programa vía el RPC, como lo hará el admin. Devuelve el pedido y el programa. */
async function program(
  plan: "individual" | "duo" = "individual",
  opts: { instructor?: string | null; students?: ReturnType<typeof alumno>[] } = {},
) {
  const students = opts.students ?? (plan === "duo" ? [alumno(1), alumno(2)] : [alumno(1)]);
  const amount = plan === "duo" ? 149990 * 2 : 249990;
  const { rows } = await raw(
    `select create_course_program(
       p_resource => $1, p_plan => $2, p_students => $3::jsonb,
       p_amount => $4, p_net => $4, p_tax => 0,
       p_price_duo => 149990, p_price_individual => 249990, p_price_prueba => 19990,
       p_instructor => $5) as order_id`,
    [await resourceId(), plan, JSON.stringify(students), amount, opts.instructor ?? null],
  );
  const orderId = rows[0].order_id as string;
  const gen = await raw("select generation_id from course_enrollments where order_id = $1 limit 1", [orderId]);
  return { orderId, generationId: gen.rows[0].generation_id as string };
}

/** Grilla semanal de 6 × 90 min a las 19:30, en formato del RPC. */
/** `futureDate(weekday, weeksAhead)`: martes, 2 semanas adelante. */
function grid(firstDate = futureDate(2)) {
  return planSessions({ firstDate, startMinute: 19 * 60 + 30, durationHours: 1.5, titles: TITULOS, tz: TZ }).map(
    (s) => ({ n: s.n, title: s.title, starts_at: s.startsAt, ends_at: s.endsAt }),
  );
}

async function schedule(generationId: string, sessions = grid()) {
  await raw("select schedule_course_generation($1, $2::jsonb)", [generationId, JSON.stringify(sessions)]);
}

async function sessionsOf(generationId: string) {
  const { rows } = await raw(
    `select cs.id, cs.n, cs.status, cs.instructor, cs.reservation_id, r.status as res_status
       from course_sessions cs join reservations r on r.id = cs.reservation_id
      where cs.generation_id = $1 order by cs.n`,
    [generationId],
  );
  return rows;
}

async function pay(orderId: string) {
  await raw("select confirm_course_payment($1, 'offline:transferencia', 'transferencia')", [orderId]);
}

beforeEach(async () => {
  await raw(
    "truncate course_credits, course_practice_redemptions, course_enrollments, course_sessions, course_leads, course_generations cascade",
  );
  await raw("truncate reservations, orders, order_lines, tax_documents, customers cascade");
});

afterAll(async () => {
  await raw(
    "truncate course_credits, course_practice_redemptions, course_enrollments, course_sessions, course_leads, course_generations cascade",
  );
  await raw("truncate reservations, orders, order_lines, tax_documents, customers cascade");
  if (connected) await pg.end();
});

describe("create_course_program", () => {
  it("individual: un programa de 1 cupo, código P####, 6 horas de práctica y pedido pendiente", async () => {
    const { orderId, generationId } = await program("individual", { instructor: "Benja" });

    const g = (await raw("select * from course_generations where id = $1", [generationId])).rows[0];
    expect(g).toMatchObject({
      kind: "programa", status: "abierta", seats: 1, practice_hours_per_seat: 6, instructor: "Benja",
      price_individual_clp: 249990, price_duo_clp: 149990, price_prueba_clp: 19990, name: "Alumno 1",
    });
    expect(g.code).toMatch(/^P\d{4}$/);

    const e = (await raw("select * from course_enrollments where order_id = $1", [orderId])).rows;
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ status: "reservada", practice_hours_total: 6, price_clp: 249990 });

    const o = (await raw("select kind, status, amount_clp from orders where id = $1", [orderId])).rows[0];
    expect(o).toEqual({ kind: "course", status: "pending_payment", amount_clp: 249990 });
  });

  it("dúo: 2 cupos en un pedido, cada uno con sus 6 horas", async () => {
    const { orderId, generationId } = await program("duo");
    const g = (await raw("select seats, name from course_generations where id = $1", [generationId])).rows[0];
    expect(g).toEqual({ seats: 2, name: "Alumno 1 y Alumno 2" });
    const e = (await raw("select practice_hours_total from course_enrollments where order_id = $1", [orderId])).rows;
    expect(e.map((r) => r.practice_hours_total)).toEqual([6, 6]);
  });

  it("los códigos son correlativos y muchos programas conviven abiertos", async () => {
    const a = await program("individual", { students: [alumno(1)] });
    const b = await program("individual", { students: [alumno(2)] });
    const codes = (
      await raw("select code from course_generations where id = any($1) order by code", [[a.generationId, b.generationId]])
    ).rows.map((r) => r.code);
    expect(Number(codes[1].slice(1))).toBe(Number(codes[0].slice(1)) + 1);
  });

  it("instructor vacío queda NULL, no ''", async () => {
    const { generationId } = await program("individual", { instructor: "   " });
    const g = (await raw("select instructor from course_generations where id = $1", [generationId])).rows[0];
    expect(g.instructor).toBeNull();
  });

  it("una generación creada a mano sigue siendo cohorte (el admin antiguo no cambia)", async () => {
    const { rows } = await raw(
      `insert into course_generations (resource_id, code, name, status, price_duo_clp, price_individual_clp, price_prueba_clp)
       values ($1, 'GX1', 'Cohorte', 'abierta', 79990, 139990, 19990) returning kind, seats`,
      [await resourceId()],
    );
    expect(rows[0]).toEqual({ kind: "cohorte", seats: 1 });
  });
});

describe("sesiones del programa", () => {
  it("agenda 6 sesiones de 90 min y copia el instructor del programa", async () => {
    const { generationId } = await program("individual", { instructor: "Benja" });
    await schedule(generationId);

    const { rows } = await raw(
      `select cs.n, cs.instructor,
              to_char(r.starts_at at time zone $2, 'HH24:MI') as desde,
              to_char(r.ends_at at time zone $2, 'HH24:MI') as hasta
         from course_sessions cs join reservations r on r.id = cs.reservation_id
        where cs.generation_id = $1 order by cs.n`,
      [generationId, TZ],
    );
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r).toMatchObject({ desde: "19:30", hasta: "21:00", instructor: "Benja" });
  });

  it("el instructor de una sesión puntual gana sobre el del programa", async () => {
    const { generationId } = await program("individual", { instructor: "Benja" });
    const sessions = grid().map((s) => (s.n === 3 ? { ...s, instructor: "Cami" } : s));
    await schedule(generationId, sessions);
    const rows = await sessionsOf(generationId);
    expect(rows.map((r) => r.instructor)).toEqual(["Benja", "Benja", "Cami", "Benja", "Benja", "Benja"]);
  });

  it("una sesión cancelada se puede volver a agendar con un bloque nuevo", async () => {
    const { generationId } = await program();
    await schedule(generationId);
    const s2 = (await sessionsOf(generationId))[1];
    await raw("select cancel_course_session($1)", [s2.id]);

    const day = futureDate(4, 20); // jueves, 20 semanas adelante (fuera de la grilla)
    await raw("select move_course_session($1, $2, $3)", [s2.id, `${day}T18:00:00-03:00`, `${day}T19:30:00-03:00`]);

    const after = (await sessionsOf(generationId))[1];
    expect(after.status).toBe("agendada");
    expect(after.res_status).toBe("confirmed");
    expect(after.reservation_id).not.toBe(s2.reservation_id);
    const old = (await raw("select status from reservations where id = $1", [s2.reservation_id])).rows[0];
    expect(old.status).toBe("cancelled");
    const ev = (
      await raw("select type from booking_events where reservation_id = $1", [after.reservation_id])
    ).rows.map((r) => r.type);
    expect(ev).toContain("curso_session_scheduled");
  });

  it("re-agendar una sesión cancelada sobre un horario tomado falla sin tocar nada", async () => {
    const { generationId } = await program();
    await schedule(generationId);
    const [s1, s2] = await sessionsOf(generationId);
    await raw("select cancel_course_session($1)", [s2.id]);

    const taken = (await raw("select starts_at, ends_at from reservations where id = $1", [s1.reservation_id])).rows[0];
    await expect(raw("select move_course_session($1, $2, $3)", [s2.id, taken.starts_at, taken.ends_at])).rejects.toThrow(
      /curso_slot_taken:2/,
    );
    expect((await sessionsOf(generationId))[1].status).toBe("cancelada");
  });
});

describe("un programa sin alumnos vivos suelta la sala", () => {
  async function expectReleased(generationId: string) {
    const rows = await sessionsOf(generationId);
    expect(rows.map((r) => r.status)).toEqual(Array(6).fill("cancelada"));
    expect(rows.map((r) => r.res_status)).toEqual(Array(6).fill("cancelled"));
    const g = (await raw("select status from course_generations where id = $1", [generationId])).rows[0];
    expect(g.status).toBe("cancelada");
    const ev = await raw(
      `select count(*)::int as n from booking_events
        where type = 'curso_session_cancelled' and detail ->> 'reason' = 'program_released'`,
    );
    expect(ev.rows[0].n).toBe(6);
  }

  async function expectKept(generationId: string) {
    const rows = await sessionsOf(generationId);
    expect(rows.every((r) => r.status === "agendada" && r.res_status === "confirmed")).toBe(true);
  }

  it("anular un pedido impago (cancel_course_order, también el barrido de 72 h)", async () => {
    const { orderId, generationId } = await program();
    await schedule(generationId);
    await raw("select cancel_course_order($1)", [orderId]);
    await expectReleased(generationId);
  });

  it("el barrido de pedidos abandonados también suelta la sala", async () => {
    const { orderId, generationId } = await program();
    await schedule(generationId);
    await raw("update orders set created_at = now() - interval '4 days' where id = $1", [orderId]);
    await raw("select expire_abandoned_course_holds()");
    await expectReleased(generationId);
  });

  it("reembolso total de un pedido pagado (mark_refunded)", async () => {
    const { orderId, generationId } = await program();
    await pay(orderId);
    await schedule(generationId);
    await raw("select mark_refunded($1, 'r-total', null)", [orderId]);
    await expectReleased(generationId);
  });

  it("un reembolso parcial NO suelta nada", async () => {
    const { orderId, generationId } = await program();
    await pay(orderId);
    await schedule(generationId);
    await raw("select mark_refunded($1, 'r-parcial', 50000)", [orderId]);
    await expectKept(generationId);
  });

  it("'anular pagada' sin reembolso (UPDATE directo desde la app)", async () => {
    const { orderId, generationId } = await program();
    await pay(orderId);
    await schedule(generationId);
    await raw("update course_enrollments set status = 'anulada', cancelled_at = now() where order_id = $1", [orderId]);
    await expectReleased(generationId);
  });

  it("dúo: si queda uno vivo, las sesiones siguen", async () => {
    const { orderId, generationId } = await program("duo");
    await pay(orderId);
    await schedule(generationId);
    await raw(
      "update course_enrollments set status = 'anulada' where id = (select id from course_enrollments where order_id = $1 order by seat_no limit 1)",
      [orderId],
    );
    await expectKept(generationId);
  });

  it("una cohorte antigua que se queda vacía conserva su agenda", async () => {
    const { rows } = await raw(
      `insert into course_generations (resource_id, code, name, status, seats, price_duo_clp, price_individual_clp, price_prueba_clp)
       values ($1, 'G01', 'Cohorte', 'abierta', 6, 79990, 139990, 19990) returning id`,
      [await resourceId()],
    );
    const gen = rows[0].id as string;
    const order = (
      await raw(
        "select create_course_enrollment($1, 'individual', $2::jsonb, 139990, 139990, 0) as id",
        [gen, JSON.stringify([alumno(9)])],
      )
    ).rows[0].id;
    await schedule(gen);
    await raw("select cancel_course_order($1)", [order]);
    await expectKept(gen);
  });

  it("es idempotente: un segundo cambio de estado no vuelve a registrar eventos", async () => {
    const { orderId, generationId } = await program();
    await schedule(generationId);
    await raw("select cancel_course_order($1)", [orderId]);
    await raw("update course_enrollments set status = 'expirada' where order_id = $1", [orderId]);
    await expectReleased(generationId);
  });
});

describe("vencimiento de la práctica", () => {
  async function paidProgram() {
    const { orderId, generationId } = await program();
    await pay(orderId);
    const e = (await raw("select id from course_enrollments where order_id = $1", [orderId])).rows[0].id as string;
    return { enrollmentId: e, generationId };
  }

  const redeem = (enrollmentId: string, day: string) =>
    raw("select redeem_practice_hours($1, $2, $3, 1::int2)", [
      enrollmentId, `${day}T15:00:00-03:00`, `${day}T16:00:00-03:00`,
    ]);

  it("sin sesiones agendadas no vence", async () => {
    const { enrollmentId, generationId } = await paidProgram();
    expect((await raw("select course_practice_valid_until($1) as d", [generationId])).rows[0].d).toBeNull();
    await expect(redeem(enrollmentId, futureDate(3, 30))).resolves.toBeTruthy();
  });

  it("vence 90 días después de la última sesión", async () => {
    const { enrollmentId, generationId } = await paidProgram();
    const first = futureDate(2);
    await schedule(generationId, grid(first));
    const last = (
      await raw(
        `select (max(r.ends_at) at time zone $2)::date as d from course_sessions cs
           join reservations r on r.id = cs.reservation_id where cs.generation_id = $1`,
        [generationId, TZ],
      )
    ).rows[0].d as Date;
    const until = (await raw("select course_practice_valid_until($1) as d", [generationId])).rows[0].d as Date;
    expect((until.getTime() - last.getTime()) / 86_400_000).toBe(90);

    const after = (await raw("select ($1::date + 1)::text as d", [until])).rows[0].d as string;
    await expect(redeem(enrollmentId, after)).rejects.toThrow(/practica_vencida/);
  });

  it("practice_valid_until fijado a mano gana sobre el cálculo", async () => {
    const { enrollmentId, generationId } = await paidProgram();
    await schedule(generationId);
    const day = futureDate(3);
    await raw("update course_generations set practice_valid_until = ($2::date - 1) where id = $1", [generationId, day]);
    await expect(redeem(enrollmentId, day)).rejects.toThrow(/practica_vencida/);
  });
});

const PRECIOS = { duo: 149990, individual: 249990, prueba: 19990 };

describe("adapter: createProgram", () => {
  it("crea el programa con los precios que recibe y devuelve sus ids", async () => {
    const r = await repo.createProgram({
      plan: "individual", students: [alumno(1)], prices: PRECIOS, instructor: "Benja",
    });
    expect(r.enrollmentIds).toHaveLength(1);
    const g = await repo.getGeneration(r.generationId);
    expect(g).toMatchObject({ kind: "programa", seats: 1, instructor: "Benja", practiceHoursPerSeat: 6 });
    expect(g?.prices).toEqual(PRECIOS);
    const o = (await raw("select amount_clp, net_clp, tax_clp from orders where id = $1", [r.orderId])).rows[0];
    expect(o).toEqual({ amount_clp: 249990, net_clp: 249990, tax_clp: 0 }); // exento de IVA
  });

  it("dúo: cobra el precio por persona × 2", async () => {
    const r = await repo.createProgram({ plan: "duo", students: [alumno(1), alumno(2)], prices: PRECIOS });
    expect(r.enrollmentIds).toHaveLength(2);
    const o = (await raw("select amount_clp from orders where id = $1", [r.orderId])).rows[0];
    expect(o.amount_clp).toBe(299980);
  });

  it("descuenta el crédito de la sesión de prueba", async () => {
    const creditId = await repo.issueTrialCredit({
      email: alumno(1).email, amountClp: 19990, sessionStartsAt: new Date().toISOString(),
    });
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS, creditId });
    const o = (await raw("select amount_clp from orders where id = $1", [r.orderId])).rows[0];
    expect(o.amount_clp).toBe(230000);
  });
});

describe("adapter: listLivePrograms", () => {
  it("un programa vivo trae alumnos, sesiones, próxima sesión, instructor y vencimiento de práctica", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS, instructor: "Benja" });
    await schedule(r.generationId);

    const [p] = await repo.listLivePrograms();
    expect(p).toMatchObject({ generationId: r.generationId, kind: "programa", plan: "individual", instructor: "Benja" });
    expect(p.code).toMatch(/^P\d{4}$/);
    expect(p.orderId).toBe(r.orderId);
    expect(p.orderStatus).toBe("pending_payment");
    expect(p.students).toEqual([
      expect.objectContaining({ enrollmentId: r.enrollmentIds[0], name: "Alumno 1", status: "reservada", practiceHoursTotal: 6, practiceHoursRedeemed: 0 }),
    ]);
    expect(p.sessions).toHaveLength(6);
    expect(p.sessions[0].instructor).toBe("Benja");
    expect(p.nextSession?.n).toBe(1);
    expect(p.practiceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sin sesiones: próxima sesión y vencimiento vacíos", async () => {
    await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    const [p] = await repo.listLivePrograms();
    expect(p.sessions).toEqual([]);
    expect(p.nextSession).toBeNull();
    expect(p.practiceValidUntil).toBeNull();
  });

  it("no lista programas anulados; sí la cohorte antigua con un alumno vivo", async () => {
    const dead = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await repo.cancelCourseOrder(dead.orderId);

    const { rows } = await raw(
      `insert into course_generations (resource_id, code, name, status, seats, price_duo_clp, price_individual_clp, price_prueba_clp)
       values ($1, 'G01', 'Primera generación', 'abierta', 6, 79990, 139990, 19990) returning id`,
      [await resourceId()],
    );
    await repo.createEnrollment({ generationId: rows[0].id, plan: "individual", students: [alumno(2)] });

    const list = await repo.listLivePrograms();
    expect(list.map((p) => p.code)).toEqual(["G01"]);
    expect(list[0].kind).toBe("cohorte");
  });
});

describe("adapter: instructor y sesión dictada", () => {
  it("setProgramInstructor / setSessionInstructor; vacío borra", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await repo.setProgramInstructor(r.generationId, "Cami");
    expect((await repo.getGeneration(r.generationId))?.instructor).toBe("Cami");
    await repo.setProgramInstructor(r.generationId, "  ");
    expect((await repo.getGeneration(r.generationId))?.instructor).toBeNull();

    await schedule(r.generationId);
    const s1 = (await repo.listSessions(r.generationId))[0];
    await repo.setSessionInstructor(s1.id, "Benja");
    expect((await repo.listSessions(r.generationId))[0].instructor).toBe("Benja");
  });

  it("markSessionDictada: la sesión queda dictada y su bloque sigue ocupando la sala", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await schedule(r.generationId);
    const s1 = (await repo.listSessions(r.generationId))[0];
    await repo.markSessionDictada(s1.id);
    const after = (await sessionsOf(r.generationId))[0];
    expect(after).toMatchObject({ status: "dictada", res_status: "confirmed" });
    await expect(repo.markSessionDictada(s1.id)).rejects.toThrow(/curso_session_unscheduled/);
  });
});

describe("adapter: coursesForEmail (lo que ve el alumno)", () => {
  it("trae instructor, saldo y vencimiento de práctica, y el fin de cada sesión", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS, instructor: "Benja" });
    await schedule(r.generationId);
    const [c] = await repo.coursesForEmail(alumno(1).email);
    expect(c).toMatchObject({ instructor: "Benja", practiceHoursTotal: 6, practiceHoursRedeemed: 0 });
    expect(c.practiceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.sessions).toHaveLength(6);
    expect(c.sessions[0].endsAt).toBeTruthy();
  });

  // Si "dictada" desapareciera, la lista del alumno se achicaría a medida que avanza el curso.
  it("una sesión dictada sigue en la lista del alumno; una cancelada no", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await schedule(r.generationId);
    const [s1, s2] = await repo.listSessions(r.generationId);
    await repo.markSessionDictada(s1.id);
    await repo.cancelSession(s2.id);

    const [c] = await repo.coursesForEmail(alumno(1).email);
    expect(c.sessions.map((s) => s.n)).toEqual([1, 3, 4, 5, 6]);
    expect(c.sessions[0].status).toBe("dictada");
  });
});

/** Una sesión sola, en hora de Chile: así se agenda "a pedido". */
const oneSession = (generationId: string, n: number, day: string, hhmm = "16:00", endHhmm = "17:30") =>
  repo.scheduleSession(generationId, {
    n,
    title: `Sesión ${n}`,
    startsAt: `${day}T${hhmm}:00-03:00`,
    endsAt: `${day}T${endHhmm}:00-03:00`,
  });

describe("schedule_course_session — una sesión a la vez (por agendar)", () => {
  const day = futureDate(4, 3); // jueves, 3 semanas adelante

  it("agenda solo la sesión pedida: bloque de sala, fila agendada e instructor del programa", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS, instructor: "Benja" });
    await oneSession(r.generationId, 3, day);

    const rows = await sessionsOf(r.generationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ n: 3, status: "agendada", res_status: "confirmed", instructor: "Benja" });
    const res = (await raw("select kind from reservations where id = $1", [rows[0].reservation_id])).rows[0];
    expect(res.kind).toBe("curso");
  });

  it("una sesión ya agendada no se agenda dos veces (para eso está Editar)", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await oneSession(r.generationId, 1, day);
    await expect(oneSession(r.generationId, 1, futureDate(5, 3))).rejects.toThrow(/curso_session_already_scheduled:1/);
  });

  it("si choca con otra reserva no deja nada a medias", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await raw(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at)
       values ($1, 'booking', 'confirmed', $2, $3)`,
      [await resourceId(), `${day}T17:00:00-03:00`, `${day}T18:00:00-03:00`],
    );
    await expect(oneSession(r.generationId, 2, day)).rejects.toThrow(/curso_slot_taken:2/);
    expect(await sessionsOf(r.generationId)).toHaveLength(0);
  });

  it("no agenda en el pasado ni fuera de 1..12", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await expect(oneSession(r.generationId, 1, "2026-01-08")).rejects.toThrow(/curso_in_past:1/);
    await expect(oneSession(r.generationId, 13, day)).rejects.toThrow(/curso_bad_session/);
  });

  it("una sesión cancelada se puede volver a agendar desde cero", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await oneSession(r.generationId, 1, day);
    const [s1] = await repo.listSessions(r.generationId);
    await repo.cancelSession(s1.id);
    await oneSession(r.generationId, 1, futureDate(5, 3), "18:00", "19:30");
    const rows = await sessionsOf(r.generationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "agendada", res_status: "confirmed" });
    expect(rows[0].reservation_id).not.toBe(s1.reservationId);
  });

  it("un programa anulado ya no se agenda", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await repo.cancelCourseOrder(r.orderId);
    await expect(oneSession(r.generationId, 1, day)).rejects.toThrow(/curso_generation_not_schedulable/);
  });

  it("con una sesión ya agendada, «agendar las 6» queda vetado (no duplica)", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await oneSession(r.generationId, 1, day);
    await expect(schedule(r.generationId)).rejects.toThrow(/curso_already_scheduled/);
  });
});

/** Contacto copiado a la reserva de cada sesión: de él cuelgan el PIN y el recordatorio. */
describe("contacto del alumno en las sesiones (PIN y recordatorio)", () => {
  const day = futureDate(4, 3);
  const contact = async (generationId: string) =>
    (
      await raw(
        `select r.customer_name, r.customer_email, r.customer_phone from course_sessions cs
           join reservations r on r.id = cs.reservation_id where cs.generation_id = $1 order by cs.n`,
        [generationId],
      )
    ).rows;

  it("programa pagado: la sesión lleva nombre, email y teléfono del alumno", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await pay(r.orderId);
    await oneSession(r.generationId, 1, day);
    expect(await contact(r.generationId)).toEqual([
      { customer_name: "Alumno 1", customer_email: "p1@correo.cl", customer_phone: "+56912345678" },
    ]);
  });

  it("programa impago: sin contacto (no hay PIN ni recordatorio); al pagar, aparece", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await oneSession(r.generationId, 1, day);
    expect((await contact(r.generationId))[0].customer_email).toBeNull();
    await pay(r.orderId);
    expect((await contact(r.generationId))[0].customer_email).toBe("p1@correo.cl");
  });

  it("un reemplazante pasa a ser el contacto de las sesiones que vienen", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await pay(r.orderId);
    await schedule(r.generationId);
    await repo.substituteStudent(r.enrollmentIds[0], { name: "Reemplazo", email: "reemplazo@correo.cl" });
    const rows = await contact(r.generationId);
    expect(rows.every((c) => c.customer_email === "reemplazo@correo.cl" && c.customer_name === "Reemplazo")).toBe(true);
  });

  it("dúo: el contacto es el primer cupo (quien compró)", async () => {
    const r = await repo.createProgram({ plan: "duo", students: [alumno(1), alumno(2)], prices: PRECIOS });
    await pay(r.orderId);
    await oneSession(r.generationId, 1, day);
    expect((await contact(r.generationId))[0].customer_email).toBe("p1@correo.cl");
  });

  it("re-agendar una sesión cancelada también lleva el contacto", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await pay(r.orderId);
    await oneSession(r.generationId, 1, day);
    const [s1] = await repo.listSessions(r.generationId);
    await repo.cancelSession(s1.id);
    await repo.moveSession(s1.id, `${futureDate(5, 3)}T18:00:00-03:00`, `${futureDate(5, 3)}T19:30:00-03:00`);
    expect((await contact(r.generationId))[0].customer_email).toBe("p1@correo.cl");
  });
});
