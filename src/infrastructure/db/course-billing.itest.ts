/**
 * Integración: inscripción → pedido → pago → boleta.
 *
 * El test que más importa es el último bloque: prueba que un pedido de curso NO
 * puede pasar por confirm_payment (caería en 'paid_no_hold', sin boleta y con el
 * alumno en silencio), que es exactamente la razón por la que existe una RPC
 * hermana en vez de un parche a la función del dinero de la sala.
 */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { futureDate } from "@/tests/dates";
import { SupabaseCourseRepository } from "./course-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseCourseRepository(db);
const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

let genSeq = 0;
/**
 * `status` es parámetro porque el índice course_generations_one_open solo admite
 * UNA generación abierta: un test de traslado necesita dos, y el destino sirve
 * igual en borrador (es justo donde se mueve a alguien cuya cohorte se canceló).
 */
async function generation(seats = 6, status = "abierta"): Promise<string> {
  const { rows } = await raw(
    `insert into course_generations
       (resource_id, code, name, status, seats, price_duo_clp, price_individual_clp, price_prueba_clp)
     values ((select id from resources where active limit 1), $1, 'Test', $2, $3, 79990, 139990, 19990)
     returning id`,
    [`GB${++genSeq}`, status, seats],
  );
  return rows[0].id;
}

const alumno = (n: number) => ({ name: `Alumno ${n}`, email: `a${n}@correo.cl`, phone: "+56912345678" });

beforeEach(async () => {
  await raw("truncate course_credits, course_practice_redemptions, course_enrollments, course_sessions, course_leads, course_generations cascade");
  await raw("truncate reservations, orders, order_lines, tax_documents cascade");
});

afterAll(async () => {
  // Dejar la DB como la encontramos: una generación "abierta" que sobreviva
  // choca con course_generations_one_open en el siguiente archivo que inserte una.
  await raw("truncate course_credits, course_enrollments, course_sessions, course_leads, course_generations cascade");
  await raw("truncate reservations, orders, order_lines, tax_documents cascade");
  if (connected) await pg.end();
});

describe("createEnrollment — cupos y pedido en una sola transacción", () => {
  it("individual: un asiento, un pedido pendiente y una línea", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [alumno(1)],
    });

    const o = await raw("select kind, status, amount_clp, net_clp, tax_clp from orders where id = $1", [orderId]);
    expect(o.rows[0]).toMatchObject({ kind: "course", status: "pending_payment", amount_clp: 139990 });
    // Neto + IVA cuadran con el bruto: la boleta no puede descuadrar.
    expect(o.rows[0].net_clp + o.rows[0].tax_clp).toBe(139990);

    const e = await raw("select seat_no, status, price_clp from course_enrollments where order_id = $1", [orderId]);
    expect(e.rows).toHaveLength(1);
    expect(e.rows[0]).toMatchObject({ seat_no: 1, status: "reservada", price_clp: 139990 });

    const l = await raw("select line_type, quantity, subtotal_clp from order_lines where order_id = $1", [orderId]);
    expect(l.rows[0]).toMatchObject({ line_type: "flat_service", quantity: 1, subtotal_clp: 139990 });
  });

  it("dúo: dos asientos compartiendo UN pedido, cobrado por persona", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({
      generationId: gen,
      plan: "duo",
      students: [alumno(1), alumno(2)],
    });

    const e = await raw("select seat_no from course_enrollments where order_id = $1 order by seat_no", [orderId]);
    expect(e.rows.map((r) => r.seat_no)).toEqual([1, 2]);
    const o = await raw("select amount_clp from orders where id = $1", [orderId]);
    expect(o.rows[0].amount_clp).toBe(79990 * 2);
  });

  // Media pareja inscrita no es un estado válido: si el segundo asiento no cabe,
  // se revierte todo, incluido el pedido.
  it("si el segundo asiento no cabe, no queda NADA: ni pedido ni primer asiento", async () => {
    const gen = await generation(1);
    await expect(
      repo.createEnrollment({ generationId: gen, plan: "duo", students: [alumno(1), alumno(2)] }),
    ).rejects.toThrow(/curso_sin_cupos/);

    expect((await raw("select count(*)::int as n from course_enrollments")).rows[0].n).toBe(0);
    expect((await raw("select count(*)::int as n from orders where kind = 'course'")).rows[0].n).toBe(0);
  });

  it("una generación cerrada no acepta inscripciones", async () => {
    const gen = await generation();
    await raw("update course_generations set status = 'cerrada' where id = $1", [gen]);
    await expect(
      repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(1)] }),
    ).rejects.toThrow(/curso_generation_closed/);
  });

  it("marca la solicitud como inscrita", async () => {
    const gen = await generation();
    const leadId = await repo.createLead(
      {
        name: "Camila",
        email: "cami@correo.cl",
        phone: "+56912345678",
        plan: "individual",
        experience: "cero",
        availability: "tardes",
        message: null,
      },
      gen,
    );
    await repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(1)], leadId });
    expect((await repo.getLead(leadId))?.status).toBe("inscrita");
  });
});

describe("confirm_course_payment — pago y boleta", () => {
  it("marca pagado, confirma los cupos y deja la boleta pendiente", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({ generationId: gen, plan: "duo", students: [alumno(1), alumno(2)] });

    expect(await repo.confirmCoursePayment(orderId, "offline:transferencia", "transferencia")).toBe("confirmed");

    const o = await raw("select status, paid_at from orders where id = $1", [orderId]);
    expect(o.rows[0].status).toBe("paid");
    expect(o.rows[0].paid_at).not.toBeNull();

    const e = await raw("select status, paid_method from course_enrollments where order_id = $1", [orderId]);
    expect(e.rows.every((r) => r.status === "pagada" && r.paid_method === "transferencia")).toBe(true);

    const t = await raw("select kind, status, total from tax_documents where order_id = $1", [orderId]);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ kind: "boleta", status: "pendiente", total: 79990 * 2 });
  });

  // Idempotencia: el webhook de MP puede re-entregar el mismo pago.
  it("confirmar dos veces deja UNA sola boleta", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(1)] });
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");

    const t = await raw("select count(*)::int as n from tax_documents where order_id = $1", [orderId]);
    expect(t.rows[0].n).toBe(1);
  });

  it("sobre una inscripción anulada devuelve noop y no emite boleta", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(1)] });
    await repo.cancelCourseOrder(orderId);

    expect(await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo")).toBe("noop");
    const t = await raw("select count(*)::int as n from tax_documents where order_id = $1", [orderId]);
    expect(t.rows[0].n).toBe(0);
  });

  it("rechaza un pedido que no es de curso", async () => {
    const { rows } = await raw(
      `insert into orders (status, currency, amount_clp, net_clp, tax_clp)
       values ('pending_payment','CLP',10000,8403,1597) returning id`,
    );
    await expect(
      repo.confirmCoursePayment(rows[0].id, "x", "efectivo"),
    ).rejects.toThrow(/curso_order_wrong_kind/);
  });
});

describe("anular y liberar cupos", () => {
  it("anular libera los asientos para otra persona", async () => {
    const gen = await generation(2);
    const orderId = await repo.createEnrollment({ generationId: gen, plan: "duo", students: [alumno(1), alumno(2)] });
    await repo.cancelCourseOrder(orderId);

    const e = await raw("select status from course_enrollments where order_id = $1", [orderId]);
    expect(e.rows.every((r) => r.status === "anulada")).toBe(true);
    const o = await raw("select status from orders where id = $1", [orderId]);
    expect(o.rows[0].status).toBe("cancelled");

    // Los dos cupos volvieron a estar disponibles.
    await expect(
      repo.createEnrollment({ generationId: gen, plan: "duo", students: [alumno(3), alumno(4)] }),
    ).resolves.toBeTruthy();
  });

  it("una inscripción PAGADA no se anula por acá (eso es un reembolso)", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(1)] });
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");
    await expect(repo.cancelCourseOrder(orderId)).rejects.toThrow(/curso_enrollment_paid/);
  });

  it("el barrido libera inscripciones abandonadas hace más de 72 h", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(1)] });
    await raw("update orders set created_at = now() - interval '96 hours' where id = $1", [orderId]);

    const { rows } = await raw("select expire_abandoned_course_holds() as n");
    expect(rows[0].n).toBe(1);
    const e = await raw("select status from course_enrollments where order_id = $1", [orderId]);
    expect(e.rows[0].status).toBe("anulada");
  });
});

// La razón de ser del diseño: el pedido de curso NO pasa por confirm_payment.
describe("por qué el curso no usa confirm_payment", () => {
  it("confirm_payment sobre un pedido de curso da paid_no_hold y NO emite boleta", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(1)] });

    const { rows } = await raw("select confirm_payment($1, 'pago-1') as status", [orderId]);
    expect(rows[0].status).toBe("paid_no_hold");

    const t = await raw("select count(*)::int as n from tax_documents where order_id = $1", [orderId]);
    expect(t.rows[0].n).toBe(0);
    // Y además suprime el email al cliente marcando notified_at.
    const o = await raw("select notified_at from orders where id = $1", [orderId]);
    expect(o.rows[0].notified_at).not.toBeNull();
  });

  it("la RPC del curso sí hace las dos cosas bien", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(1)] });

    expect(await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo")).toBe("confirmed");
    const t = await raw("select count(*)::int as n from tax_documents where order_id = $1", [orderId]);
    expect(t.rows[0].n).toBe(1);
    const o = await raw("select notified_at from orders where id = $1", [orderId]);
    expect(o.rows[0].notified_at).toBeNull(); // el email del curso todavía puede salir
  });
});

describe("crédito de la sesión de prueba", () => {
  const cred = (over: Record<string, unknown> = {}) => ({
    email: "cami@correo.cl",
    amountClp: 19990,
    sessionStartsAt: new Date().toISOString(),
    ...over,
  });

  it("se emite y se encuentra por email", async () => {
    await repo.issueTrialCredit(cred());
    const c = await repo.applicableCredit("CAMI@CORREO.CL"); // sin distinguir mayúsculas
    expect(c?.amountClp).toBe(19990);
  });

  it("un crédito vencido no aparece", async () => {
    const hace10dias = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    await repo.issueTrialCredit(cred({ sessionStartsAt: hace10dias }));
    expect(await repo.applicableCredit("cami@correo.cl")).toBeNull();
  });

  // Lo que dicen los términos: el descuento sale del EFECTIVO cobrado, y la
  // boleta cubre exactamente eso.
  it("descuenta del pedido y deja una línea de descuento", async () => {
    const gen = await generation();
    await repo.issueTrialCredit(cred());
    const credit = await repo.applicableCredit("cami@correo.cl");

    const orderId = await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [{ name: "Camila", email: "cami@correo.cl" }],
      creditId: credit!.id,
    });

    const o = await raw("select amount_clp, net_clp, tax_clp from orders where id = $1", [orderId]);
    expect(o.rows[0].amount_clp).toBe(139990 - 19990);
    expect(o.rows[0].net_clp + o.rows[0].tax_clp).toBe(120000);

    const l = await raw(
      "select line_type, subtotal_clp from order_lines where order_id = $1 order by line_type", [orderId]);
    expect(l.rows).toEqual([
      { line_type: "discount", subtotal_clp: -19990 },
      { line_type: "flat_service", subtotal_clp: 139990 },
    ]);

    // La boleta cubre el efectivo, no el precio de lista.
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");
    const t = await raw("select total from tax_documents where order_id = $1", [orderId]);
    expect(t.rows[0].total).toBe(120000);
  });

  it("un crédito solo se puede usar una vez", async () => {
    const gen = await generation();
    await repo.issueTrialCredit(cred());
    const credit = await repo.applicableCredit("cami@correo.cl");

    await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [{ name: "Camila", email: "cami@correo.cl" }],
      creditId: credit!.id,
    });
    // Ya consumido: no vuelve a aparecer ni se puede volver a aplicar.
    expect(await repo.applicableCredit("cami@correo.cl")).toBeNull();
    await expect(
      repo.createEnrollment({
        generationId: gen,
        plan: "individual",
        students: [{ name: "Camila", email: "cami@correo.cl" }],
        creditId: credit!.id,
      }),
    ).rejects.toThrow(/curso_credito_no_disponible/);
  });

  it("anular la inscripción devuelve el crédito", async () => {
    const gen = await generation();
    await repo.issueTrialCredit(cred());
    const credit = await repo.applicableCredit("cami@correo.cl");
    const orderId = await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [{ name: "Camila", email: "cami@correo.cl" }],
      creditId: credit!.id,
    });

    await repo.cancelCourseOrder(orderId);
    expect((await repo.applicableCredit("cami@correo.cl"))?.id).toBe(credit!.id);
  });
});

describe("coursesForEmail — lo que ve el alumno en /cuenta", () => {
  it("trae su inscripción con las sesiones de la generación", async () => {
    const gen = await generation();
    await raw(
      `insert into course_sessions (generation_id, n, title) values ($1, 1, 'Sonido'), ($1, 2, 'Beatmatching')`,
      [gen],
    );
    await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [{ name: "Camila", email: "Cami@Correo.CL" }],
    });

    const cursos = await repo.coursesForEmail("cami@correo.cl");
    expect(cursos).toHaveLength(1);
    expect(cursos[0].generationCode).toBe("GB" + genSeq);
    expect(cursos[0].status).toBe("reservada");
    expect(cursos[0].sessions.map((s) => s.n)).toEqual([1, 2]);
  });

  it("no filtra la inscripción de otra persona", async () => {
    const gen = await generation();
    await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [{ name: "Camila", email: "cami@correo.cl" }],
    });
    expect(await repo.coursesForEmail("otra@correo.cl")).toHaveLength(0);
  });

  // `ilike` trata `_` como comodín: sin el re-filtro exacto, "c_mi@correo.cl"
  // haría match con "cami@correo.cl" y le mostraría a alguien el curso ajeno.
  it("un comodín de ilike NO puede colar la inscripción de otro", async () => {
    const gen = await generation();
    await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [{ name: "Camila", email: "cami@correo.cl" }],
    });
    expect(await repo.coursesForEmail("c_mi@correo.cl")).toHaveLength(0);
  });

  it("una inscripción anulada deja de aparecer", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [{ name: "Camila", email: "cami@correo.cl" }],
    });
    await repo.cancelCourseOrder(orderId);
    expect(await repo.coursesForEmail("cami@correo.cl")).toHaveLength(0);
  });
});

/**
 * Reembolso. La liberación del cupo vive DENTRO de mark_refunded porque el
 * webhook de MP la llama directo cuando el reembolso se inicia desde el panel:
 * si viviera en el servicio, ese camino devolvería la plata y dejaría el asiento
 * ocupado para siempre.
 */
describe("mark_refunded — el cupo vuelve al inventario", () => {
  async function inscripcionPagada(seats = 6) {
    const gen = await generation(seats);
    const orderId = await repo.createEnrollment({
      generationId: gen,
      plan: "individual",
      students: [alumno(1)],
    });
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");
    return { gen, orderId };
  }

  it("un reembolso TOTAL anula la inscripción y libera el asiento", async () => {
    const { gen, orderId } = await inscripcionPagada(1);
    await raw("select mark_refunded($1, 'refund-1', null)", [orderId]);

    const e = await raw("select status from course_enrollments where order_id = $1", [orderId]);
    expect(e.rows[0].status).toBe("anulada");

    // El asiento quedó libre de verdad: entra otra persona en una generación de 1.
    await expect(
      repo.createEnrollment({ generationId: gen, plan: "individual", students: [alumno(2)] }),
    ).resolves.toBeTruthy();
  });

  // Un asiento no es divisible: un reembolso parcial de buena voluntad no debe
  // expulsar al alumno del curso.
  it("un reembolso PARCIAL deja al alumno dentro", async () => {
    const { orderId } = await inscripcionPagada();
    await raw("select mark_refunded($1, 'refund-2', 20000)", [orderId]);

    const e = await raw("select status from course_enrollments where order_id = $1", [orderId]);
    expect(e.rows[0].status).toBe("pagada");
    const o = await raw("select status, refunded_amount_clp from orders where id = $1", [orderId]);
    expect(o.rows[0].refunded_amount_clp).toBe(20000);
  });

  it("emite la nota de crédito por el saldo vivo", async () => {
    const { orderId } = await inscripcionPagada();
    await raw("select mark_refunded($1, 'refund-3', null)", [orderId]);

    const t = await raw(
      "select kind, total from tax_documents where order_id = $1 order by created_at", [orderId]);
    expect(t.rows.map((r) => r.kind)).toEqual(["boleta", "nota_credito"]);
    expect(t.rows[1].total).toBe(139990);
  });

  // El invariante del modelo aditivo: Σ(boletas vivas) = cobrado − reembolsado.
  it("tras un reembolso parcial el saldo vivo cuadra", async () => {
    const { orderId } = await inscripcionPagada();
    await raw("select mark_refunded($1, 'refund-4', 40000)", [orderId]);

    const { rows } = await raw(
      `select coalesce(sum(total - reversed_clp), 0)::int as vivo
         from tax_documents where order_id = $1 and kind = 'boleta' and reversed_clp < total`,
      [orderId],
    );
    expect(rows[0].vivo).toBe(139990 - 40000);
  });

  // Un pedido de sala no puede verse afectado: no tiene inscripciones.
  it("no toca pedidos de sala", async () => {
    const { rows: o } = await raw(
      `insert into orders (status, currency, amount_clp, net_clp, tax_clp, paid_at)
       values ('paid','CLP',19990,16798,3192, now()) returning id`,
    );
    await expect(raw("select mark_refunded($1, 'refund-5', null)", [o[0].id])).resolves.toBeTruthy();
    const e = await raw("select count(*)::int as n from course_enrollments where order_id = $1", [o[0].id]);
    expect(e.rows[0].n).toBe(0);
  });
});

/**
 * Traslado y reemplazante: las dos salidas SIN dinero de los términos. Lo que
 * las define es lo que NO pasa — ni nota de crédito, ni boleta nueva, ni cambio
 * en el pedido.
 */
describe("traslado de cupo", () => {
  it("mueve al alumno y libera el asiento viejo", async () => {
    const origen = await generation(2);
    const destino = await generation(2, "borrador");
    const orderId = await repo.createEnrollment({
      generationId: origen,
      plan: "individual",
      students: [alumno(1)],
    });
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");
    const { rows: e0 } = await raw("select id from course_enrollments where order_id = $1", [orderId]);

    const nueva = await repo.transferEnrollment(e0[0].id, destino);

    const vieja = await raw("select status, transferred_to from course_enrollments where id = $1", [e0[0].id]);
    expect(vieja.rows[0].status).toBe("trasladada");
    expect(vieja.rows[0].transferred_to).toBe(nueva);

    // Conserva pago y precio: traspasar no es recomprar.
    const n = await raw("select generation_id, status, price_clp, order_id from course_enrollments where id = $1", [nueva]);
    expect(n.rows[0]).toMatchObject({ generation_id: destino, status: "pagada", price_clp: 139990, order_id: orderId });

    // El asiento del origen quedó libre.
    await expect(
      repo.createEnrollment({ generationId: origen, plan: "individual", students: [alumno(2)] }),
    ).resolves.toBeTruthy();
  });

  it("no mueve plata: sin nota de crédito ni boleta nueva", async () => {
    const origen = await generation();
    const destino = await generation(6, "borrador");
    const orderId = await repo.createEnrollment({
      generationId: origen, plan: "individual", students: [alumno(1)],
    });
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");
    const { rows: e0 } = await raw("select id from course_enrollments where order_id = $1", [orderId]);

    await repo.transferEnrollment(e0[0].id, destino);

    const t = await raw("select kind from tax_documents where order_id = $1", [orderId]);
    expect(t.rows.map((r) => r.kind)).toEqual(["boleta"]); // la original, sola
    const o = await raw("select status, refunded_amount_clp from orders where id = $1", [orderId]);
    expect(o.rows[0]).toMatchObject({ status: "paid", refunded_amount_clp: 0 });
  });

  it("una generación sin cupos no recibe el traslado", async () => {
    const origen = await generation();
    // 'en_curso' porque hay que LLENARLA (createEnrollment exige abierta o en
    // curso) y el índice one_open solo restringe 'abierta'.
    const lleno = await generation(1, "en_curso");
    await repo.createEnrollment({ generationId: lleno, plan: "individual", students: [alumno(9)] });
    const orderId = await repo.createEnrollment({
      generationId: origen, plan: "individual", students: [alumno(1)],
    });
    const { rows: e0 } = await raw("select id from course_enrollments where order_id = $1", [orderId]);

    await expect(repo.transferEnrollment(e0[0].id, lleno)).rejects.toThrow(/curso_sin_cupos/);
    // Y el original sigue intacto.
    const v = await raw("select status from course_enrollments where id = $1", [e0[0].id]);
    expect(v.rows[0].status).toBe("reservada");
  });
});

describe("reemplazante", () => {
  it("cambia quién asiste sin tocar el pedido ni la boleta", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({
      generationId: gen, plan: "individual", students: [alumno(1)],
    });
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");
    const { rows: e0 } = await raw("select id from course_enrollments where order_id = $1", [orderId]);

    await repo.substituteStudent(e0[0].id, { name: "Fran Soto", email: "FRAN@correo.cl" });

    const e = await raw("select student_name, student_email, notes, status from course_enrollments where id = $1", [e0[0].id]);
    expect(e.rows[0].student_name).toBe("Fran Soto");
    expect(e.rows[0].student_email).toBe("fran@correo.cl"); // normalizado
    expect(e.rows[0].status).toBe("pagada");
    // Queda el rastro de a quién reemplaza.
    expect(e.rows[0].notes).toMatch(/Reemplaza a Alumno 1/);

    // La boleta va al PAGADOR: la plata no se movió, no hay hecho tributario nuevo.
    const o = await raw("select customer_email from orders where id = $1", [orderId]);
    expect(o.rows[0].customer_email).toBe("a1@correo.cl");
    const t = await raw("select count(*)::int as n from tax_documents where order_id = $1", [orderId]);
    expect(t.rows[0].n).toBe(1);
  });

  it("una inscripción anulada no acepta reemplazante", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({
      generationId: gen, plan: "individual", students: [alumno(1)],
    });
    await repo.cancelCourseOrder(orderId);
    const { rows: e0 } = await raw("select id from course_enrollments where order_id = $1", [orderId]);
    await expect(
      repo.substituteStudent(e0[0].id, { name: "X", email: "x@correo.cl" }),
    ).rejects.toThrow(/curso_enrollment_not_active/);
  });
});

/**
 * Horas de práctica. Lo importante es que redimir sea UNA transacción: en dos
 * pasos, un fallo entre medio deja una hora reservada sin descontar (regalada) o
 * un saldo descontado sin reserva (robada).
 */
describe("horas de práctica libre", () => {
  const day = futureDate(3);

  async function pagada() {
    const gen = await generation();
    const orderId = await repo.createEnrollment({
      generationId: gen, plan: "individual", students: [alumno(1)],
    });
    await repo.confirmCoursePayment(orderId, "offline:efectivo", "efectivo");
    const { rows } = await raw("select id from course_enrollments where order_id = $1", [orderId]);
    return rows[0].id as string;
  }

  it("una inscripción pagada nace con 4 horas", async () => {
    const id = await pagada();
    const e = await repo.enrollmentById(id);
    expect(e?.practiceHoursTotal).toBe(4);
    expect(e?.practiceHoursRedeemed).toBe(0);
  });

  it("redimir crea la reserva y descuenta el saldo", async () => {
    const id = await pagada();
    const res = await repo.redeemPracticeHours(id, {
      startsAt: `${day}T15:00:00-04:00`, endsAt: `${day}T16:00:00-04:00`, hours: 1,
    });

    const r = await raw("select kind, status, order_id, notes from reservations where id = $1", [res]);
    // kind='booking': es un alumno en la cabina. Sin orden → sin boleta.
    expect(r.rows[0]).toMatchObject({ kind: "booking", status: "confirmed", order_id: null });
    expect(r.rows[0].notes).toMatch(/Práctica libre/);
    expect((await repo.enrollmentById(id))?.practiceHoursRedeemed).toBe(1);
  });

  it("no se puede redimir más saldo del que hay", async () => {
    const id = await pagada();
    await repo.redeemPracticeHours(id, {
      startsAt: `${day}T10:00:00-04:00`, endsAt: `${day}T14:00:00-04:00`, hours: 4,
    });
    await expect(
      repo.redeemPracticeHours(id, {
        startsAt: `${day}T18:00:00-04:00`, endsAt: `${day}T19:00:00-04:00`, hours: 1,
      }),
    ).rejects.toThrow(/practica_sin_saldo/);
  });

  // El caso que justifica la transacción única.
  it("si el horario está tomado, NO se descuenta saldo", async () => {
    const id = await pagada();
    await raw(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at)
       values ((select id from resources where active limit 1), 'booking', 'confirmed', $1, $2)`,
      [`${day}T20:00:00-04:00`, `${day}T22:00:00-04:00`],
    );
    await expect(
      repo.redeemPracticeHours(id, {
        startsAt: `${day}T20:00:00-04:00`, endsAt: `${day}T21:00:00-04:00`, hours: 1,
      }),
    ).rejects.toThrow(/exclusion|overlap/i);
    expect((await repo.enrollmentById(id))?.practiceHoursRedeemed).toBe(0);
  });

  it("una inscripción impaga no tiene horas", async () => {
    const gen = await generation();
    const orderId = await repo.createEnrollment({
      generationId: gen, plan: "individual", students: [alumno(2)],
    });
    const { rows } = await raw("select id from course_enrollments where order_id = $1", [orderId]);
    await expect(
      repo.redeemPracticeHours(rows[0].id, {
        startsAt: `${day}T15:00:00-04:00`, endsAt: `${day}T16:00:00-04:00`, hours: 1,
      }),
    ).rejects.toThrow(/practica_no_elegible/);
  });

  it("cancelar devuelve la hora y libera el horario", async () => {
    const id = await pagada();
    const res = await repo.redeemPracticeHours(id, {
      startsAt: `${day}T15:00:00-04:00`, endsAt: `${day}T16:00:00-04:00`, hours: 1,
    });
    await repo.releasePracticeHours(res);

    expect((await repo.enrollmentById(id))?.practiceHoursRedeemed).toBe(0);
    const r = await raw("select status from reservations where id = $1", [res]);
    expect(r.rows[0].status).toBe("cancelled");
    // Y el horario se puede volver a tomar.
    await expect(
      repo.redeemPracticeHours(id, {
        startsAt: `${day}T15:00:00-04:00`, endsAt: `${day}T16:00:00-04:00`, hours: 1,
      }),
    ).resolves.toBeTruthy();
  });

  // Sin esto, cancelar dos veces regalaría horas.
  it("liberar dos veces no regala horas", async () => {
    const id = await pagada();
    const res = await repo.redeemPracticeHours(id, {
      startsAt: `${day}T15:00:00-04:00`, endsAt: `${day}T16:00:00-04:00`, hours: 1,
    });
    await repo.releasePracticeHours(res);
    await repo.releasePracticeHours(res);
    expect((await repo.enrollmentById(id))?.practiceHoursRedeemed).toBe(0);
  });
});
