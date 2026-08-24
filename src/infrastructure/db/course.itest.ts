/**
 * Integración: el esquema del Curso de DJ. Cada test acá clava una garantía que
 * vive en POSTGRES, no en la app — sobreventa, bloqueo de sala y las guardias de
 * dinero. Son justamente las que un refactor futuro puede romper en silencio.
 */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SEAT_HOLDING_STATUSES, seatsTaken } from "@/src/domain/course/course";
import { futureDate } from "@/tests/dates";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

/** El único recurso activo (la sala). */
async function resourceId(): Promise<string> {
  const { rows } = await raw("select id from resources where active order by created_at limit 1");
  return rows[0].id;
}

/**
 * Generación de prueba. El `code` es único por sí mismo, así que va parametrizado:
 * si dos generaciones compartieran código, el test de "una sola abierta" chocaría
 * contra la constraint equivocada y pasaría por la razón errónea.
 */
let genSeq = 0;
async function generation(seats = 6, status = "abierta", code?: string): Promise<string> {
  const { rows } = await raw(
    `insert into course_generations
       (resource_id, code, name, status, seats, price_duo_clp, price_individual_clp, price_prueba_clp)
     values ($1, $2, 'Generación de prueba', $3, $4, 79990, 139990, 19990)
     returning id`,
    [await resourceId(), code ?? `GT${++genSeq}`, status, seats],
  );
  return rows[0].id;
}

async function enroll(generationId: string, seatNo: number, over: { status?: string; email?: string } = {}) {
  return raw(
    `insert into course_enrollments
       (generation_id, seat_no, plan, student_name, student_email, price_clp, status)
     values ($1, $2, 'individual', 'Alumno', $3, 139990, $4) returning id`,
    [generationId, seatNo, over.email ?? `a${seatNo}@correo.cl`, over.status ?? "reservada"],
  );
}

/** Un bloque de sesión, tal como lo escribirá el RPC de agendar. */
async function courseBlock(startsAt: string, endsAt: string) {
  return raw(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, notes)
     values ($1, 'curso', 'confirmed', $2, $3, 'Curso GT · Sesión 1') returning id`,
    [await resourceId(), startsAt, endsAt],
  );
}

beforeEach(async () => {
  // Orden obligatorio: course_sessions referencia reservations con ON DELETE
  // RESTRICT, así que las sesiones se van primero o el delete de abajo falla.
  // `delete from reservations` es la convención de reservations.itest.ts (deja la
  // DB sin seed transaccional → `npm run db:reset` al terminar).
  await raw("truncate course_enrollments, course_sessions, course_leads, course_generations cascade");
  await raw("delete from reservations");
});

afterAll(async () => {
  await raw("truncate course_enrollments, course_sessions, course_leads, course_generations cascade");
  await raw("delete from reservations");
  if (connected) await pg.end();
});

describe("cupos: la sobreventa es imposible por esquema, no por conteo en la app", () => {
  it("dos inscripciones vivas no pueden compartir asiento", async () => {
    const gen = await generation();
    await enroll(gen, 1);
    await expect(enroll(gen, 1, { email: "otro@correo.cl" })).rejects.toThrow(/course_enrollments_seat_unique/);
  });

  it("anular libera el asiento y otra persona lo puede tomar", async () => {
    const gen = await generation();
    await enroll(gen, 1, { email: "ana@correo.cl" });
    await raw("update course_enrollments set status = 'anulada', cancelled_at = now() where generation_id = $1", [gen]);
    await expect(enroll(gen, 1, { email: "cata@correo.cl" })).resolves.toBeTruthy();
  });

  it("no se puede tomar un asiento fuera del cupo de la generación", async () => {
    const gen = await generation(2);
    await expect(enroll(gen, 3)).rejects.toThrow(/course_seat_out_of_range/);
  });

  // La app y la DB tienen que estar de acuerdo en QUÉ estado ocupa cupo. Si el
  // índice parcial y SEAT_HOLDING_STATUSES divergen, la consola del admin mostraría
  // cupos libres que la DB va a rechazar (o al revés).
  it("SEAT_HOLDING_STATUSES espeja exactamente el índice parcial de la DB", async () => {
    const gen = await generation(5);
    await enroll(gen, 1, { status: "reservada" });
    await enroll(gen, 2, { status: "pagada" });
    await enroll(gen, 3, { status: "anulada" });
    await enroll(gen, 4, { status: "expirada" });
    await enroll(gen, 5, { status: "trasladada" });

    const { rows } = await raw("select status from course_enrollments where generation_id = $1", [gen]);
    // Lo que cuenta el dominio…
    expect(seatsTaken(rows)).toBe(SEAT_HOLDING_STATUSES.length);

    // …es exactamente lo que la DB deja re-tomar: los tres estados muertos liberaron
    // su asiento, los dos vivos no.
    await expect(enroll(gen, 3, { email: "x3@correo.cl" })).resolves.toBeTruthy();
    await expect(enroll(gen, 1, { email: "x1@correo.cl" })).rejects.toThrow(/seat_unique/);
  });

  it("solo puede haber una generación abierta a la vez", async () => {
    await generation();
    await expect(generation()).rejects.toThrow(/course_generations_one_open/);
  });

  it("una generación cerrada convive con la abierta", async () => {
    await generation(6, "abierta");
    await generation(6, "cerrada");
    const { rows } = await raw("select count(*)::int as n from course_generations");
    expect(rows[0].n).toBe(2);
  });
});

describe("sala: una sesión de curso ocupa la cabina como cualquier reserva", () => {
  it("un booking que se solapa con una sesión de curso es rechazado por el EXCLUDE", async () => {
    const day = futureDate(2);
    await courseBlock(`${day}T20:00:00-04:00`, `${day}T22:00:00-04:00`);

    await expect(
      raw(
        `insert into reservations (resource_id, kind, status, starts_at, ends_at)
         values ($1, 'booking', 'held', $2, $3)`,
        [await resourceId(), `${day}T21:00:00-04:00`, `${day}T23:00:00-04:00`],
      ),
    ).rejects.toThrow(/reservations_no_overlap/);
  });

  it("una reserva adyacente (fin == inicio) NO choca: el rango es [inicio, fin)", async () => {
    const day = futureDate(2);
    await courseBlock(`${day}T20:00:00-04:00`, `${day}T22:00:00-04:00`);

    await expect(
      raw(
        `insert into reservations (resource_id, kind, status, starts_at, ends_at)
         values ($1, 'booking', 'held', $2, $3)`,
        [await resourceId(), `${day}T22:00:00-04:00`, `${day}T23:00:00-04:00`],
      ),
    ).resolves.toBeTruthy();
  });

  it("cancelar la sesión libera la hora", async () => {
    const day = futureDate(2);
    const { rows } = await courseBlock(`${day}T20:00:00-04:00`, `${day}T22:00:00-04:00`);
    await raw("update reservations set status = 'cancelled', cancelled_at = now() where id = $1", [rows[0].id]);

    await expect(
      raw(
        `insert into reservations (resource_id, kind, status, starts_at, ends_at)
         values ($1, 'booking', 'held', $2, $3)`,
        [await resourceId(), `${day}T20:00:00-04:00`, `${day}T22:00:00-04:00`],
      ),
    ).resolves.toBeTruthy();
  });
});

describe("guardias de dinero", () => {
  // Sin este CHECK, mark_refunded() —que cancela TODA reserva con ese order_id—
  // borraría los cuatro bloques de la generación al reembolsar a UN alumno.
  it("un bloque de curso no puede colgar de un pedido", async () => {
    const day = futureDate(3);
    const { rows } = await raw(
      `insert into orders (status, currency, amount_clp, net_clp, tax_clp)
       values ('pending_payment', 'CLP', 1000, 840, 160) returning id`,
    );
    await expect(
      raw(
        `insert into reservations (resource_id, kind, status, starts_at, ends_at, order_id)
         values ($1, 'curso', 'confirmed', $2, $3, $4)`,
        [await resourceId(), `${day}T10:00:00-04:00`, `${day}T12:00:00-04:00`, rows[0].id],
      ),
    ).rejects.toThrow(/reservations_curso_no_order/);
  });

  it("un pedido de curso no acepta canje de puntos", async () => {
    await expect(
      raw(
        `insert into orders (kind, status, currency, amount_clp, net_clp, tax_clp, points_redeemed_clp)
         values ('course', 'pending_payment', 'CLP', 79990, 67218, 12772, 5000)`,
      ),
    ).rejects.toThrow(/orders_course_no_points/);
  });

  it("un pedido normal sigue aceptando puntos", async () => {
    await expect(
      raw(
        `insert into orders (status, currency, amount_clp, net_clp, tax_clp, points_redeemed_clp)
         values ('pending_payment', 'CLP', 19990, 16798, 3192, 5000)`,
      ),
    ).resolves.toBeTruthy();
  });

  it("los pedidos existentes quedaron con kind='booking' por defecto", async () => {
    const { rows } = await raw(
      "select count(*)::int as n from orders where kind not in ('booking','trial','course','reschedule_delta')",
    );
    expect(rows[0].n).toBe(0);
  });
});
