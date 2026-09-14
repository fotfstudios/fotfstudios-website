/**
 * Recordatorio de sesión contra la DB real, con el reloj movido a mano: la ventana
 * (2–24 h), la edad mínima de la reserva (12 h), el reclamo único y el release.
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReminderService } from "@/src/application/reminders/reminder-service";
import { SupabaseReminderRepository } from "./reminder-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseReminderRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup = "truncate reservations, orders, order_lines, booking_events cascade";

/** Reserva insertada directo; inicio y antigüedad relativos a AHORA (en horas). */
async function booking(o: {
  startsInH: number;
  ageH?: number;
  status?: "held" | "confirmed" | "cancelled";
  kind?: "booking" | "curso";
  email?: string | null;
  reminded?: boolean;
}): Promise<string> {
  const starts = new Date(Date.now() + o.startsInH * 3600_000);
  const ends = new Date(starts.getTime() + 2 * 3600_000);
  const created = new Date(Date.now() - (o.ageH ?? 48) * 3600_000);
  const r = await pg.query<{ id: string }>(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, customer_name, customer_email, created_at, reminder_sent_at)
       values ($1, $2, $3, $4, $5, 'Ana', $6, $7, $8) returning id`,
    [
      resourceId,
      o.kind ?? "booking",
      o.status ?? "confirmed",
      starts.toISOString(),
      ends.toISOString(),
      o.email === undefined ? "ana@e.cl" : o.email,
      created.toISOString(),
      o.reminded ? new Date().toISOString() : null,
    ],
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

describe("remindersDue — la ventana", () => {
  it("devuelve la confirmada de cliente que empieza en 20 h, reservada hace 2 días", async () => {
    const id = await booking({ startsInH: 20 });
    const due = await repo.remindersDue();
    expect(due.map((r) => r.id)).toEqual([id]);
    expect(due[0]).toMatchObject({ customerName: "Ana", customerEmail: "ana@e.cl" });
  });

  it("excluye: en 30 h (todavía no), en 1 h (ya es ahora), reservada hace 3 h, held, curso, ya recordada", async () => {
    // Horas distintas: la sala tiene exclusion constraint de solapamiento.
    await booking({ startsInH: 30 });
    await booking({ startsInH: 1 });
    await booking({ startsInH: 10, ageH: 3 });
    await booking({ startsInH: 13, status: "held" });
    await booking({ startsInH: 16, kind: "curso" });
    await booking({ startsInH: 20, reminded: true });
    expect(await repo.remindersDue()).toEqual([]);
  });
});

describe("el reclamo", () => {
  it("dos corridas simultáneas: una gana; release lo suelta", async () => {
    const id = await booking({ startsInH: 20 });
    const [a, b] = await Promise.all([repo.markReminderSent(id), repo.markReminderSent(id)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await repo.remindersDue()).toEqual([]);
    await repo.releaseReminderSent(id);
    expect((await repo.remindersDue()).map((r) => r.id)).toEqual([id]);
  });
});

describe("ReminderService.sweep contra la DB", () => {
  it("manda una vez y la segunda corrida no encuentra nada", async () => {
    await booking({ startsInH: 20 });
    const notifications = { notifyReminder: vi.fn(async () => true) };
    const svc = new ReminderService(repo, notifications);
    expect(await svc.sweep()).toEqual({ sent: 1, skippedNoEmail: 0 });
    expect(await svc.sweep()).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(notifications.notifyReminder).toHaveBeenCalledTimes(1);
  });

  it("si el correo falla, la próxima corrida reintenta", async () => {
    await booking({ startsInH: 20 });
    const notifications = { notifyReminder: vi.fn<() => Promise<boolean>>(async () => { throw new Error("resend down"); }) };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = new ReminderService(repo, notifications);
    expect(await svc.sweep()).toEqual({ sent: 0, skippedNoEmail: 0 });
    notifications.notifyReminder.mockResolvedValue(true);
    expect(await svc.sweep()).toEqual({ sent: 1, skippedNoEmail: 0 });
    err.mockRestore();
  });
});
