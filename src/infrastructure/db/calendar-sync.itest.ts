/**
 * Cola del espejo de Google Calendar contra la DB real: el trigger (qué encola y qué no), el
 * reclamo con lease, el cierre por versión y la foto sin datos de contacto. Google va falso:
 * lo que se prueba acá es la cola. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CalendarSyncService } from "@/src/application/calendar/calendar-sync-service";
import type { CalendarSync } from "@/src/application/ports/calendar";
import { googleEventId, type GoogleEventPayload } from "@/src/domain/calendar/google-event";
import { SupabaseCalendarSyncRepository } from "./calendar-sync-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseCalendarSyncRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
// TRUNCATE no dispara triggers por fila: calendar_sync se limpia aparte.
const cleanup = "truncate calendar_sync, reservations, orders, order_lines, booking_events cascade";

async function reservation(o: { kind?: string; status?: string; inDays?: number; notes?: string; expiresAt?: string | null; name?: string } = {}) {
  const starts = new Date(Date.now() + (o.inDays ?? 10) * 86400_000);
  const ends = new Date(starts.getTime() + 2 * 3600_000);
  const r = await pg.query<{ id: string }>(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, notes, expires_at, customer_name, customer_email, customer_phone)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'ana@e.cl', '+56912345678') returning id`,
    [resourceId, o.kind ?? "booking", o.status ?? "confirmed", starts.toISOString(), ends.toISOString(), o.notes ?? null, o.expiresAt ?? null, o.name ?? "Ana"],
  );
  return r.rows[0].id;
}

const state = async (id: string) =>
  (await pg.query("select op, pending, version::int, attempts, locked_at, last_error, google_event_id from calendar_sync where reservation_id = $1", [id])).rows[0];

class RecordingCalendar implements CalendarSync {
  upserts: { id: string; payload: GoogleEventPayload }[] = [];
  deletes: string[] = [];
  async upsertEvent(id: string, payload: GoogleEventPayload) { this.upserts.push({ id, payload }); }
  async deleteEvent(id: string) { this.deletes.push(id); }
}

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
beforeEach(async () => {
  await pg.query(cleanup);
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});

describe("trigger", () => {
  it("una reserva nueva queda pendiente, versión 1", async () => {
    const id = await reservation();
    expect(await state(id)).toMatchObject({ op: "upsert", pending: true, version: 1 });
  });

  it("mover la hora re-encola la misma fila y sube la versión", async () => {
    const id = await reservation();
    await pg.query("update reservations set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = $1", [id]);
    expect(await state(id)).toMatchObject({ pending: true, version: 2 });
  });

  it("el barrido de PIN y recordatorios NO encola", async () => {
    const id = await reservation();
    await pg.query("update calendar_sync set pending = false");
    await pg.query("update reservations set reminder_sent_at = now(), access_code = '482913', access_loaded_at = now() where id = $1", [id]);
    expect(await state(id)).toMatchObject({ pending: false, version: 1 });
  });

  it("borrar un bloqueo deja la fila con op=delete (la reserva ya no existe, la fila sí)", async () => {
    const id = await reservation({ kind: "block" });
    await pg.query("delete from reservations where id = $1", [id]);
    expect(await state(id)).toMatchObject({ op: "delete", pending: true, version: 2 });
  });

  it("la expiración de holds por pg_cron (SQL puro) re-encola", async () => {
    const id = await reservation({ status: "held", expiresAt: new Date(Date.now() - 60_000).toISOString() });
    await pg.query("update calendar_sync set pending = false");
    await pg.query("select expire_stale_holds()");
    expect(await state(id)).toMatchObject({ pending: true, version: 2 });
  });
});

describe("reclamo", () => {
  it("dos workers concurrentes nunca toman la misma fila", async () => {
    for (let i = 0; i < 4; i++) await reservation({ inDays: 10 + i });
    const other = new Client({ connectionString: DB_URL });
    await other.connect();
    try {
      await pg.query("begin");
      await other.query("begin");
      const a = (await pg.query("select reservation_id from calendar_sync_claim(2)")).rows.map((r) => r.reservation_id);
      const b = (await other.query("select reservation_id from calendar_sync_claim(2)")).rows.map((r) => r.reservation_id);
      await pg.query("commit");
      await other.query("commit");
      expect(a).toHaveLength(2);
      expect(b).toHaveLength(2);
      expect(a.filter((x) => b.includes(x))).toEqual([]);
    } finally {
      await other.end();
    }
  });

  it("una fila reclamada no se vuelve a reclamar hasta que vence el lease", async () => {
    await reservation();
    expect(await repo.claimDue(10)).toHaveLength(1);
    expect(await repo.claimDue(10)).toHaveLength(0);
    await pg.query("update calendar_sync set locked_at = now() - interval '6 minutes'");
    expect(await repo.claimDue(10)).toHaveLength(1);
  });
});

describe("foto", () => {
  it("trae el curso, los extras y la zona horaria, y NUNCA el contacto del cliente", async () => {
    const id = await reservation({ kind: "curso" });
    const gen = await pg.query<{ id: string }>(
      `insert into course_generations (resource_id, code, name, price_duo_clp, price_individual_clp, price_prueba_clp)
         values ($1, 'GT', 'Generación Test', 1, 1, 1) returning id`,
      [resourceId],
    );
    await pg.query("insert into course_sessions (generation_id, n, title, reservation_id) values ($1, 2, 'Beatmatching', $2)", [gen.rows[0].id, id]);
    try {
      const raw = (await pg.query("select * from calendar_sync_snapshot($1)", [id])).rows[0];
      expect(Object.keys(raw)).not.toContain("customer_email");
      expect(Object.keys(raw)).not.toContain("customer_phone");
      expect(JSON.stringify(raw)).not.toContain("ana@e.cl");

      const s = await repo.snapshot(id);
      expect(s).toMatchObject({ kind: "curso", course: { n: 2, title: "Beatmatching", generationName: "Generación Test" }, tz: "America/Santiago", addons: [] });
    } finally {
      await pg.query("delete from course_sessions where reservation_id = $1", [id]);
      await pg.query("delete from course_generations where code = 'GT'");
    }
  });

  it("null para una reserva que ya no existe", async () => {
    expect(await repo.snapshot("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("servicio de punta a punta contra la cola real", () => {
  const svc = (cal: CalendarSync) => new CalendarSyncService(repo, cal, { siteUrl: "http://localhost:3000" });

  it("publica, salta lo que no cambió, y borra al cancelar", async () => {
    const id = await reservation({ name: "Martín" });
    const cal = new RecordingCalendar();

    expect(await svc(cal).sweep()).toMatchObject({ upserted: 1, failed: 0 });
    expect(cal.upserts[0]).toMatchObject({ id: googleEventId(id), payload: { summary: "Sala · Martín · 2h" } });
    expect(await state(id)).toMatchObject({ pending: false, locked_at: null, google_event_id: googleEventId(id) });

    // Un cambio que no altera el evento (customer_name igual) re-encola pero no llama a Google.
    await pg.query("update reservations set customer_name = 'Martín' where id = $1", [id]);
    expect(await svc(cal).sweep()).toMatchObject({ skipped: 1, upserted: 0 });

    await pg.query("update reservations set status = 'cancelled' where id = $1", [id]);
    expect(await svc(cal).sweep()).toMatchObject({ deleted: 1 });
    expect(cal.deletes).toEqual([googleEventId(id)]);
    expect(await state(id)).toMatchObject({ pending: false, google_event_id: null });
  });

  it("un bloqueo borrado: borra el evento y la fila de la cola", async () => {
    const id = await reservation({ kind: "block" });
    const cal = new RecordingCalendar();
    await svc(cal).sweep();
    await pg.query("delete from reservations where id = $1", [id]);
    await svc(cal).sweep();
    expect(cal.deletes).toEqual([googleEventId(id)]);
    expect(await state(id)).toBeUndefined();
  });

  it("un fallo queda a la vista con backoff y no bloquea la cola", async () => {
    const id = await reservation();
    const failing: CalendarSync = { upsertEvent: async () => { throw new Error("Google upsert 403: sin acceso"); }, deleteEvent: async () => {} };
    expect(await svc(failing).sweep()).toMatchObject({ failed: 1 });
    expect(await state(id)).toMatchObject({ pending: true, attempts: 1, locked_at: null, last_error: "Google upsert 403: sin acceso" });
    expect(await repo.claimDue(10)).toHaveLength(0); // en backoff
    expect(await repo.stats()).toMatchObject({ pending: 1, failing: 1 });
    expect((await repo.failures(10))[0]).toMatchObject({ reservationId: id, attempts: 1 });

    expect(await repo.forceDue()).toBe(1); // "Sincronizar ahora"
    expect(await svc(new RecordingCalendar()).sweep()).toMatchObject({ upserted: 1 });
    expect(await repo.stats()).toMatchObject({ pending: 0, failing: 0 });
  });

  it("resincronizar todo re-encola lo vigente con el fingerprint limpio (fuerza el PATCH)", async () => {
    await reservation();
    await reservation({ status: "cancelled", inDays: 11 });
    const cal = new RecordingCalendar();
    await svc(cal).sweep();
    expect(await repo.enqueueAll()).toBe(1);
    expect(await svc(cal).sweep()).toMatchObject({ upserted: 1, skipped: 0 });
  });
});
