import { describe, expect, it } from "vitest";
import {
  CalendarSyncError,
  type CalendarSync,
  type CalendarSyncRepository,
  type ClaimedSyncRow,
} from "@/src/application/ports/calendar";
import type { GoogleEventPayload, ReservationSnapshot } from "@/src/domain/calendar/google-event";
import { CalendarSyncService, backoffMinutes } from "./calendar-sync-service";

const NOW = new Date("2026-07-10T12:00:00Z");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function snap(id: string, over: Partial<ReservationSnapshot> = {}): ReservationSnapshot {
  return {
    id, kind: "booking", status: "confirmed",
    startsAt: "2026-07-12T22:00:00+00:00", endsAt: "2026-07-13T00:00:00+00:00",
    expiresAt: null, customerName: "Ana", notes: null, orderId: null, rescheduleId: null,
    course: null, addons: [], tz: "America/Santiago", ...over,
  };
}

const row = (id: string, over: Partial<ClaimedSyncRow> = {}): ClaimedSyncRow => ({
  reservationId: id, version: 1, attempts: 0, lastFingerprint: null, ...over,
});

class FakeRepo implements CalendarSyncRepository {
  claimed: number[] = [];
  synced: { id: string; version: number; googleEventId: string | null; fingerprint: string | null; gone: boolean }[] = [];
  failed: { id: string; version: number; error: string; next: Date }[] = [];
  released: string[] = [];
  forced = 0;
  constructor(
    public rows: ClaimedSyncRow[],
    public snaps: Record<string, ReservationSnapshot | null>,
  ) {}
  async claimDue(limit: number) { this.claimed.push(limit); return this.rows.slice(0, limit); }
  async snapshot(id: string) { return this.snaps[id] ?? null; }
  async markSynced(id: string, version: number, r: { googleEventId: string | null; fingerprint: string | null; gone: boolean }) {
    this.synced.push({ id, version, ...r });
  }
  async markFailed(id: string, version: number, error: string, next: Date) { this.failed.push({ id, version, error, next }); }
  async release(id: string) { this.released.push(id); }
  async enqueueAll() { return 7; }
  async forceDue() { this.forced++; return 3; }
  async stats() { return { pending: 0, failing: 0, lastSyncedAt: null }; }
  async failures() { return []; }
}

class FakeCalendar implements CalendarSync {
  upserts: { id: string; payload: GoogleEventPayload }[] = [];
  deletes: string[] = [];
  failOn = new Map<string, Error>();
  async upsertEvent(id: string, payload: GoogleEventPayload) {
    const e = this.failOn.get(id); if (e) throw e;
    this.upserts.push({ id, payload });
  }
  async deleteEvent(id: string) {
    const e = this.failOn.get(id); if (e) throw e;
    this.deletes.push(id);
  }
}

const eid = (id: string) => `fotf${id.replace(/-/g, "")}`;

function service(repo: FakeRepo, cal: FakeCalendar | null, clock: () => Date = () => NOW) {
  return new CalendarSyncService(repo, cal, { siteUrl: "https://www.fotfstudios.cl", now: clock });
}

describe("CalendarSyncService.sweep", () => {
  it("sin credenciales NO reclama nada: la cola espera y nada queda marcado como sincronizado", async () => {
    const repo = new FakeRepo([row(A)], { [A]: snap(A) });
    const r = await service(repo, null).sweep();
    expect(r.configured).toBe(false);
    expect(repo.claimed).toEqual([]);
    expect(repo.synced).toEqual([]);
  });

  it("publica una reserva confirmada y cierra la fila con la versión reclamada, el id y el fingerprint", async () => {
    const repo = new FakeRepo([row(A, { version: 4 })], { [A]: snap(A) });
    const cal = new FakeCalendar();
    const r = await service(repo, cal).sweep();
    expect(cal.upserts.map((u) => u.id)).toEqual([eid(A)]);
    expect(cal.upserts[0].payload.summary).toBe("Sala · Ana · 2h");
    expect(repo.synced).toEqual([{ id: A, version: 4, googleEventId: eid(A), fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/), gone: false }]);
    expect(r).toMatchObject({ configured: true, claimed: 1, upserted: 1, deleted: 0, skipped: 0, failed: 0 });
  });

  it("si el fingerprint no cambió, NO llama a Google pero cierra la fila igual", async () => {
    const repo = new FakeRepo([row(A)], { [A]: snap(A) });
    const cal = new FakeCalendar();
    await service(repo, cal).sweep();
    const fp = repo.synced[0].fingerprint;

    const repo2 = new FakeRepo([row(A, { lastFingerprint: fp })], { [A]: snap(A) });
    const cal2 = new FakeCalendar();
    const r = await service(repo2, cal2).sweep();
    expect(cal2.upserts).toEqual([]);
    expect(repo2.synced).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it("reserva que ya no existe: borra el evento y la fila (gone)", async () => {
    const repo = new FakeRepo([row(A)], { [A]: null });
    const cal = new FakeCalendar();
    const r = await service(repo, cal).sweep();
    expect(cal.deletes).toEqual([eid(A)]);
    expect(repo.synced).toEqual([{ id: A, version: 1, googleEventId: null, fingerprint: null, gone: true }]);
    expect(r.deleted).toBe(1);
  });

  it.each(["cancelled", "expired"] as const)("reserva %s: borra el evento y conserva la fila (gone = false)", async (status) => {
    const repo = new FakeRepo([row(A)], { [A]: snap(A, { status }) });
    const cal = new FakeCalendar();
    await service(repo, cal).sweep();
    expect(cal.deletes).toEqual([eid(A)]);
    expect(repo.synced[0]).toMatchObject({ googleEventId: null, fingerprint: null, gone: false });
  });

  it("un fallo no frena al resto: A falla, B y C se publican", async () => {
    const repo = new FakeRepo([row(A), row(B), row(C)], { [A]: snap(A), [B]: snap(B), [C]: snap(C) });
    const cal = new FakeCalendar();
    cal.failOn.set(eid(A), new CalendarSyncError("Google upsert 503: backendError", true, 503));
    const r = await service(repo, cal).sweep();
    expect(cal.upserts.map((u) => u.id)).toEqual([eid(B), eid(C)]);
    expect(repo.failed).toEqual([{ id: A, version: 1, error: "Google upsert 503: backendError", next: new Date(NOW.getTime() + 60_000) }]);
    expect(r).toMatchObject({ upserted: 2, failed: 1 });
  });

  it("el backoff crece con los intentos de la fila", async () => {
    const repo = new FakeRepo([row(A, { attempts: 3 })], { [A]: snap(A) });
    const cal = new FakeCalendar();
    cal.failOn.set(eid(A), new Error("boom"));
    await service(repo, cal).sweep();
    expect(repo.failed[0].next).toEqual(new Date(NOW.getTime() + 8 * 60_000));
  });

  it("un error que no es de Google (p. ej. la foto falla) también se registra y no tumba el tick", async () => {
    const repo = new FakeRepo([row(A)], { [A]: snap(A) });
    repo.snapshot = async () => { throw new Error("upstream"); };
    const r = await service(repo, new FakeCalendar()).sweep();
    expect(repo.failed[0].error).toBe("upstream");
    expect(r.failed).toBe(1);
  });

  it("al agotar el presupuesto suelta lo que no alcanzó, sin contarlo como intento", async () => {
    let t = NOW.getTime();
    const repo = new FakeRepo([row(A), row(B), row(C)], { [A]: snap(A), [B]: snap(B), [C]: snap(C) });
    const cal = new FakeCalendar();
    const orig = cal.upsertEvent.bind(cal);
    cal.upsertEvent = async (id, p) => { t += 6_000; return orig(id, p); };
    const r = await service(repo, cal, () => new Date(t)).sweep({ budgetMs: 10_000 });
    expect(cal.upserts).toHaveLength(2);
    expect(repo.released).toEqual([C]);
    expect(repo.failed).toEqual([]);
    expect(r).toMatchObject({ claimed: 3, upserted: 2, released: 1 });
  });

  it("pide el límite pedido", async () => {
    const repo = new FakeRepo([], {});
    await service(repo, new FakeCalendar()).sweep({ limit: 7 });
    expect(repo.claimed).toEqual([7]);
  });
});

describe("syncNow / resyncAll", () => {
  it("syncNow adelanta lo pendiente y corre un barrido", async () => {
    const repo = new FakeRepo([row(A)], { [A]: snap(A) });
    const cal = new FakeCalendar();
    await service(repo, cal).syncNow();
    expect(repo.forced).toBe(1);
    expect(cal.upserts).toHaveLength(1);
  });

  it("syncNow sin credenciales no toca la cola", async () => {
    const repo = new FakeRepo([row(A)], { [A]: snap(A) });
    const r = await service(repo, null).syncNow();
    expect(repo.forced).toBe(0);
    expect(r.configured).toBe(false);
  });

  it("resyncAll re-encola y devuelve cuántas", async () => {
    expect(await service(new FakeRepo([], {}), new FakeCalendar()).resyncAll()).toBe(7);
  });
});

describe("backoffMinutes", () => {
  it("1, 2, 4, 8… con techo de 60", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(backoffMinutes)).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60]);
  });
});
