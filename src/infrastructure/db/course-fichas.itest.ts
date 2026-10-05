/**
 * Integración: quien se inscribe al curso, practica o viene a una prueba es CLIENTE
 * y tiene ficha (`customers`), igual que quien reserva la sala. La ficha se crea con
 * la misma regla que el checkout (`upsert_guest_customer`) y queda enlazada desde la
 * inscripción, el pedido, la práctica y las sesiones guiadas.
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

const PRECIOS = { duo: 149990, individual: 249990, prueba: 19990 };
const alumno = (n: number) => ({ name: `Alumno ${n}`, email: `f${n}@correo.cl`, phone: "+56912345678" });
const TZ = "America/Santiago";

const ficha = async (email: string) =>
  (await raw("select id, name, email, phone from customers where email = $1", [email])).rows[0] as
    | { id: string; name: string | null; email: string; phone: string | null }
    | undefined;
const enrollment = async (id: string) =>
  (await raw("select customer_id from course_enrollments where id = $1", [id])).rows[0].customer_id as string | null;
const orderCustomer = async (orderId: string) =>
  (await raw("select customer_id from orders where id = $1", [orderId])).rows[0].customer_id as string | null;
const pay = (orderId: string) => raw("select confirm_course_payment($1, 'offline:transferencia', 'transferencia')", [orderId]);

const clean = async () => {
  await raw(
    "truncate course_credits, course_practice_redemptions, course_enrollments, course_sessions, course_leads, course_generations cascade",
  );
  await raw("truncate reservations, orders, order_lines, tax_documents, points_ledger, customers cascade");
};
beforeEach(clean);
afterAll(async () => {
  await clean();
  if (connected) await pg.end();
});

describe("inscribirse crea la ficha del alumno", () => {
  it("individual: ficha con nombre, email y teléfono; la enlazan la inscripción y el pedido", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    const f = await ficha("f1@correo.cl");
    expect(f).toMatchObject({ name: "Alumno 1", email: "f1@correo.cl", phone: "+56912345678" });
    expect(await enrollment(r.enrollmentIds[0])).toBe(f!.id);
    expect(await orderCustomer(r.orderId)).toBe(f!.id);
  });

  it("dúo: una ficha por persona; el pedido queda a nombre de quien compró", async () => {
    const r = await repo.createProgram({ plan: "duo", students: [alumno(1), alumno(2)], prices: PRECIOS });
    const [f1, f2] = [await ficha("f1@correo.cl"), await ficha("f2@correo.cl")];
    expect(f1 && f2).toBeTruthy();
    expect(await enrollment(r.enrollmentIds[0])).toBe(f1!.id);
    expect(await enrollment(r.enrollmentIds[1])).toBe(f2!.id);
    expect(await orderCustomer(r.orderId)).toBe(f1!.id);
  });

  it("si ya era cliente (reservó la sala o vino a una prueba), reutiliza su ficha", async () => {
    const prev = (
      await raw("insert into customers (email, name, phone) values ('f1@correo.cl', 'Ya Cliente', '+56900000000') returning id")
    ).rows[0].id;
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    expect(await enrollment(r.enrollmentIds[0])).toBe(prev);
    expect((await raw("select count(*)::int as n from customers")).rows[0].n).toBe(1);
  });
});

describe("las demás puertas de entrada también", () => {
  it("emitir el crédito de una sesión de prueba crea la ficha (vino a la sala)", async () => {
    await repo.issueTrialCredit({ email: "Prueba@Correo.cl", amountClp: 19990, sessionStartsAt: new Date().toISOString() });
    expect(await ficha("prueba@correo.cl")).toBeTruthy();
  });

  it("un reemplazante tiene su propia ficha; el pedido sigue a nombre de quien pagó", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    const payer = (await ficha("f1@correo.cl"))!.id;
    await repo.substituteStudent(r.enrollmentIds[0], { name: "Reemplazo", email: "reemplazo@correo.cl" });
    const sub = await ficha("reemplazo@correo.cl");
    expect(sub).toMatchObject({ name: "Reemplazo" });
    expect(await enrollment(r.enrollmentIds[0])).toBe(sub!.id);
    expect(await orderCustomer(r.orderId)).toBe(payer);
  });

  it("una hora de práctica queda enlazada a la ficha del alumno", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await pay(r.orderId);
    const day = futureDate(5, 3);
    const res = await repo.redeemPracticeHours(r.enrollmentIds[0], {
      startsAt: `${day}T16:30:00-03:00`, endsAt: `${day}T17:30:00-03:00`, hours: 1,
    });
    const c = (await raw("select customer_id from reservations where id = $1", [res])).rows[0].customer_id;
    expect(c).toBe((await ficha("f1@correo.cl"))!.id);
  });

  it("las sesiones guiadas quedan enlazadas a la ficha, y pasan al reemplazante", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await pay(r.orderId);
    const plan = planSessions({
      firstDate: futureDate(2), startMinute: 19 * 60, durationHours: 1.5, titles: ["A", "B"], tz: TZ,
    });
    await repo.scheduleSessions(r.generationId, plan);
    const links = async () =>
      (
        await raw(
          `select distinct r.customer_id from course_sessions cs join reservations r on r.id = cs.reservation_id
            where cs.generation_id = $1`,
          [r.generationId],
        )
      ).rows.map((x) => x.customer_id);
    expect(await links()).toEqual([(await ficha("f1@correo.cl"))!.id]);
    await repo.substituteStudent(r.enrollmentIds[0], { name: "Reemplazo", email: "reemplazo@correo.cl" });
    expect(await links()).toEqual([(await ficha("reemplazo@correo.cl"))!.id]);
  });
});

describe("los puntos no se acumulan por el curso (términos §6)", () => {
  it("award_retro_points ignora un pedido de curso pagado", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await pay(r.orderId);
    const f = (await ficha("f1@correo.cl"))!.id;
    const awarded = (await raw("select award_retro_points($1) as n", [f])).rows[0].n;
    expect(awarded).toBe(0);
    expect((await raw("select count(*)::int as n from points_ledger where customer_id = $1", [f])).rows[0].n).toBe(0);
  });
});

describe("la ficha muestra el curso", () => {
  it("enrollmentsForCustomer lista sus programas, con su estado y práctica", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await pay(r.orderId);
    const f = (await ficha("f1@correo.cl"))!.id;
    const list = await repo.enrollmentsForCustomer(f);
    expect(list).toEqual([
      expect.objectContaining({ enrollmentId: r.enrollmentIds[0], status: "pagada", practiceHoursTotal: 6, plan: "individual" }),
    ]);
    expect(list[0].generationCode).toMatch(/^P\d{4}$/);
  });
});

describe("backfill: quienes se inscribieron antes de esto", () => {
  it("crea y enlaza las fichas de inscripciones, pedidos, práctica y créditos sin ficha", async () => {
    const r = await repo.createProgram({ plan: "individual", students: [alumno(1)], prices: PRECIOS });
    await pay(r.orderId);
    // Simula el estado previo: nada enlazado y ninguna ficha.
    await raw("update course_enrollments set customer_id = null");
    await raw("update orders set customer_id = null");
    await raw("insert into course_credits (email, amount_clp, issued_at, expires_at) values ('solo-prueba@correo.cl', 19990, now(), now() + interval '7 days')");
    // delete y no truncate: truncate … cascade vaciaría también inscripciones y pedidos.
    await raw("delete from customers");

    await raw("select backfill_course_customers()");
    const f = await ficha("f1@correo.cl");
    expect(f).toBeTruthy();
    expect(await enrollment(r.enrollmentIds[0])).toBe(f!.id);
    expect(await orderCustomer(r.orderId)).toBe(f!.id);
    expect(await ficha("solo-prueba@correo.cl")).toBeTruthy();

    // Idempotente: correrlo de nuevo no duplica.
    await raw("select backfill_course_customers()");
    expect((await raw("select count(*)::int as n from customers")).rows[0].n).toBe(2);
  });
});
