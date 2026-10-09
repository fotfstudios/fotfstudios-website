/**
 * Trigger reservations_reset_notices_on_move (migración 20261013120000), contra la DB real:
 * cuando una reserva cambia de hora por CUALQUIER camino (reagendar una reserva pagada, una
 * cortesía…), vuelve a recibir su recordatorio y su PIN para el horario nuevo. Requiere
 * Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { futureDate } from "@/tests/dates";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const DAY = futureDate(2, 3);
const at = (hh: string) => `${DAY}T${hh}:00:00-03:00`;
const LINES = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1 h", quantity: 1, unit_price_clp: 15000, subtotal_clp: 15000 },
]);

const clean = () =>
  pg.query("truncate reservations, orders, order_lines, payment_intents, tax_documents, points_ledger, booking_events, customers cascade");
beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await pg.end();
});

/** Reserva de sala pagada (1 h a las 16:00) con su recordatorio y su PIN ya enviados. */
async function paidBooking(): Promise<string> {
  const { rows } = await pg.query<{ o: string }>(
    `select create_checkout(p_resource => $1::uuid, p_starts => $2::timestamptz, p_ends => $3::timestamptz,
       p_amount => 15000, p_net => 12605, p_tax => 2395, p_currency => 'CLP',
       p_customer => '{"name":"Ana","email":"ana@e.cl"}'::jsonb, p_snapshot => '{}'::jsonb,
       p_lines => $4::jsonb, p_ttl => null, p_terms_source => 'staff') o`,
    [resourceId, at("16"), at("17"), LINES],
  );
  await pg.query("select confirm_payment($1, null::text, 'transferencia')", [rows[0].o]);
  const id = (await pg.query<{ id: string }>("select id from reservations where order_id = $1", [rows[0].o])).rows[0].id;
  await sent(id);
  return id;
}

/** Cortesía confirmada (sin pedido) con avisos enviados. */
async function courtesy(): Promise<string> {
  const { rows } = await pg.query<{ id: string }>(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, customer_name, customer_email)
     values ($1, 'booking', 'confirmed', $2, $3, 'Beto', 'beto@e.cl') returning id`,
    [resourceId, at("12"), at("13")],
  );
  await sent(rows[0].id);
  return rows[0].id;
}

const sent = (id: string) =>
  pg.query(
    "update reservations set access_code = '4471', access_loaded_at = now(), access_sent_at = now(), reminder_sent_at = now() where id = $1",
    [id],
  );

const notices = async (id: string) =>
  (
    await pg.query<{ code: string | null; loaded: boolean; sent: boolean; reminder: boolean; removed: boolean }>(
      `select access_code code, access_loaded_at is not null loaded, access_sent_at is not null sent,
              reminder_sent_at is not null reminder, access_removed_at is not null removed
         from reservations where id = $1`,
      [id],
    )
  ).rows[0];

describe("cambiar de hora reinicia el recordatorio y el envío del PIN", () => {
  it("reagendar una reserva pagada (reschedule_move): el PIN cargado se conserva y se reenvía", async () => {
    const id = await paidBooking();
    await pg.query("select reschedule_move($1, $2::timestamptz, $3::timestamptz, '{}'::jsonb, $4::jsonb)", [
      id,
      at("19"),
      at("20"),
      LINES,
    ]);
    expect(await notices(id)).toEqual({ code: "4471", loaded: true, sent: false, reminder: false, removed: false });
  });

  it("reagendar una cortesía (reschedule_courtesy)", async () => {
    const id = await courtesy();
    await pg.query("select reschedule_courtesy($1, $2::timestamptz, $3::timestamptz)", [id, at("19"), at("20")]);
    expect(await notices(id)).toEqual({ code: "4471", loaded: true, sent: false, reminder: false, removed: false });
  });

  it("un PIN ya quitado de la cerradura vuelve a 'por cargar' (mismo código)", async () => {
    const id = await courtesy();
    await pg.query("update reservations set access_removed_at = now() where id = $1", [id]);
    await pg.query("update reservations set starts_at = $2, ends_at = $3 where id = $1", [id, at("19"), at("20")]);
    expect(await notices(id)).toEqual({ code: "4471", loaded: false, sent: false, reminder: false, removed: false });
  });

  it("un cambio que no mueve la hora no toca los avisos", async () => {
    const id = await courtesy();
    await pg.query("update reservations set notes = 'x', ends_at = $2 where id = $1", [id, at("14")]);
    await pg.query("update reservations set starts_at = starts_at where id = $1", [id]);
    expect(await notices(id)).toEqual({ code: "4471", loaded: true, sent: true, reminder: true, removed: false });
  });
});
