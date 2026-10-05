/**
 * La corrección puntual de Martín (migración 20261009120000, bloque 5). Corre el bloque
 * TAL CUAL está en la migración contra filas de prueba con sus ids de producción, y
 * verifica que deja: la prueba como 'prueba'/'trial', los 999 puntos revocados (con su
 * rastro), el crédito enlazado y un solo nombre en la ficha y sus fotos. Corre dos veces:
 * la segunda no hace nada (idempotente). Requiere Supabase local.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });

const CUSTOMER = "9d7c4481-9e4b-448f-9911-2bd05c587c22";
const ORDER = "22098ed1-1790-4ebd-8ac6-6c72ab27dd58";
const RES = "1926ce6c-aa55-4995-ba79-bbf413bc557f";
const CREDIT = "bbc1e240-6cad-4598-8351-84c8b4fa15e1";

/** El bloque `do $$ … end $$;` de la sección 5, leído de la migración (no una copia). */
const FIX = (() => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261009120000_curso_fichas_y_puntos.sql"), "utf8");
  const start = sql.indexOf("do $$", sql.indexOf("── 5. Corrección puntual"));
  const end = sql.indexOf("end $$;", start) + "end $$;".length;
  if (start < 0 || end < start) throw new Error("bloque de corrección no encontrado");
  return sql.slice(start, end);
})();

const cleanup = "truncate course_credits, points_ledger, reservations, orders, order_lines, tax_documents, booking_events, customers cascade";

beforeAll(async () => {
  await pg.connect();
});
beforeEach(async () => {
  await pg.query(cleanup);
  const resource = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await pg.query(
    `insert into customers (id, name, email, phone, points_balance)
     values ($1, 'Martín Elicer', 'martinelicerraab@gmail.com', '+56979464694', 999)`,
    [CUSTOMER],
  );
  await pg.query(
    `insert into orders (id, kind, status, currency, amount_clp, net_clp, tax_clp, customer_id,
                         customer_name, customer_email, payment_method, paid_at)
     values ($1, 'booking', 'paid', 'CLP', 19990, 16798, 3192, $2,
             'Martin Elicer Raab', 'martinelicerraab@gmail.com', 'transferencia', now())`,
    [ORDER, CUSTOMER],
  );
  await pg.query(
    `insert into reservations (id, resource_id, kind, status, starts_at, ends_at, customer_id, order_id, customer_name)
     values ($1, $2, 'booking', 'confirmed', '2026-09-30 15:00+00', '2026-09-30 16:00+00', $3, $4, 'Martin Elicer Raab')`,
    [RES, resource, CUSTOMER, ORDER],
  );
  await pg.query("insert into points_ledger (customer_id, order_id, kind, amount, ref) values ($1, $2, 'earn', 999, '')", [
    CUSTOMER,
    ORDER,
  ]);
  await pg.query(
    "insert into course_credits (id, email, amount_clp, expires_at) values ($1, 'martinelicerraab@gmail.com', 19990, now() + interval '1 day')",
    [CREDIT],
  );
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});

describe("corrección puntual de Martín", () => {
  it("prueba como prueba, sin puntos, crédito enlazado y un solo nombre — y es idempotente", async () => {
    await pg.query(FIX);
    await pg.query(FIX);

    const o = await pg.query("select kind, customer_name from orders where id = $1", [ORDER]);
    expect(o.rows[0]).toEqual({ kind: "trial", customer_name: "Martín Elicer Raab" });
    const r = await pg.query("select kind, customer_name from reservations where id = $1", [RES]);
    expect(r.rows[0]).toEqual({ kind: "prueba", customer_name: "Martín Elicer Raab" });

    const c = await pg.query("select name, points_balance from customers where id = $1", [CUSTOMER]);
    expect(c.rows[0]).toEqual({ name: "Martín Elicer Raab", points_balance: 0 });
    const ledger = await pg.query("select kind, amount, ref from points_ledger where order_id = $1 order by kind", [ORDER]);
    expect(ledger.rows).toEqual([
      { kind: "earn", amount: 999, ref: "" },
      { kind: "earn_revoke", amount: -999, ref: "curso:prueba-sin-puntos" },
    ]);

    const cr = await pg.query("select source_reservation_id from course_credits where id = $1", [CREDIT]);
    expect(cr.rows[0].source_reservation_id).toBe(RES);
  });

  it("sin la ficha (local/staging) no hace nada", async () => {
    await pg.query(cleanup);
    await expect(pg.query(FIX)).resolves.toBeTruthy();
  });
});
