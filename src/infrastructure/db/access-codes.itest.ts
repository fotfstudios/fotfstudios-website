/**
 * El ciclo del PIN de la cerradura contra la DB real, con el reloj movido a mano:
 * generar → cargar → mandar 10 min antes (una sola vez) → sesión → quitar.
 * Y los negativos que importan: nunca mandar sin "cargado", nunca a una reserva
 * sin confirmar, nunca dos códigos vivos iguales. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessCodeService } from "@/src/application/access/access-code-service";
import { SupabaseAdminRepository } from "./admin-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseAdminRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

const cleanup = "truncate reservations, orders, order_lines, booking_events cascade";

/** Reserva de sala insertada directo, con el inicio relativo a AHORA (en minutos). */
async function booking(o: {
  startsInMin: number;
  durationMin?: number;
  status?: "held" | "confirmed" | "cancelled";
  kind?: "booking" | "curso";
  email?: string | null;
  code?: string | null;
  loaded?: boolean;
  sent?: boolean;
  removed?: boolean;
}): Promise<string> {
  const starts = new Date(Date.now() + o.startsInMin * 60_000);
  const ends = new Date(starts.getTime() + (o.durationMin ?? 60) * 60_000);
  const now = new Date().toISOString();
  const r = await pg.query<{ id: string }>(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, customer_name, customer_email,
                               access_code, access_loaded_at, access_sent_at, access_removed_at)
       values ($1, $2, $3, $4, $5, 'Ana', $6, $7, $8, $9, $10) returning id`,
    [
      resourceId,
      o.kind ?? "booking",
      o.status ?? "confirmed",
      starts.toISOString(),
      ends.toISOString(),
      o.email === undefined ? "ana@e.cl" : o.email,
      o.code ?? null,
      o.loaded ? now : null,
      o.sent ? now : null,
      o.removed ? now : null,
    ],
  );
  return r.rows[0].id;
}

const row = async (id: string) =>
  (
    await pg.query<{ access_code: string | null; access_loaded_at: string | null; access_sent_at: string | null; access_removed_at: string | null }>(
      "select access_code, access_loaded_at, access_sent_at, access_removed_at from reservations where id=$1",
      [id],
    )
  ).rows[0];

const notifier = () => ({ notifyAccessCode: vi.fn().mockResolvedValue(true) });

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

describe("generación", () => {
  it("el barrido asigna un PIN de 6 dígitos a la reserva confirmada que no tiene", async () => {
    const id = await booking({ startsInMin: 60 * 24 });
    const r = await new AccessCodeService(repo, notifier()).sweep();
    expect(r.generated).toBe(1);
    expect((await row(id)).access_code).toMatch(/^\d{6}$/);
  });

  it("no asigna a una reserva SIN confirmar (held)", async () => {
    const id = await booking({ startsInMin: 60, status: "held" });
    await new AccessCodeService(repo, notifier()).sweep();
    expect((await row(id)).access_code).toBeNull();
  });

  it("no asigna a una sesión de curso: no tiene PIN", async () => {
    const id = await booking({ startsInMin: 60, kind: "curso" });
    await new AccessCodeService(repo, notifier()).sweep();
    expect((await row(id)).access_code).toBeNull();
  });

  it("no pisa un PIN que ya existe", async () => {
    const id = await booking({ startsInMin: 60, code: "12345678" });
    await new AccessCodeService(repo, notifier()).sweep();
    expect((await row(id)).access_code).toBe("12345678");
  });

  it("los PIN vivos nunca se repiten, aunque se generen muchos", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 40; i++) ids.push(await booking({ startsInMin: 60 + i * 60 }));
    await new AccessCodeService(repo, notifier()).sweep();
    const codes = (await pg.query<{ c: string }>("select access_code c from reservations where access_removed_at is null")).rows.map((r) => r.c);
    expect(codes).toHaveLength(40);
    expect(new Set(codes).size).toBe(40);
    for (const c of codes) {
      expect(c).toMatch(/^\d{6}$/);
      expect(c).not.toMatch(/^(\d)\1{5}$/); // ni 000000 ni 111111…
      expect(["123456", "654321", "012345"]).not.toContain(c);
    }
  });

  it("un PIN quitado de la cerradura libera su número", async () => {
    // Construido a mano: el mismo código puede volver a existir si el anterior ya no está vivo.
    await booking({ startsInMin: -120, code: "482917", removed: true });
    const dup = await pg.query("insert into reservations (resource_id, kind, status, starts_at, ends_at, access_code) values ($1,'booking','confirmed', now() + interval '2 hours', now() + interval '3 hours', '482917')", [resourceId]);
    expect(dup.rowCount).toBe(1);
  });
});

describe("envío 10 minutos antes", () => {
  it("manda UNA vez la reserva cargada que empieza en la ventana, y marca access_sent_at", async () => {
    const id = await booking({ startsInMin: 8, code: "482917", loaded: true });
    const n = notifier();
    const svc = new AccessCodeService(repo, n);

    const r1 = await svc.sweep();
    expect(r1.sent).toBe(1);
    expect(n.notifyAccessCode).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@e.cl", code: "482917" }));
    expect((await row(id)).access_sent_at).not.toBeNull();

    // Segunda corrida: NO reenvía.
    const r2 = await svc.sweep();
    expect(r2.sent).toBe(0);
    expect(n.notifyAccessCode).toHaveBeenCalledTimes(1);
  });

  /** La condición que evita mandar un código que todavía no abre. */
  it("NUNCA manda si el dueño no marcó el PIN como cargado, aunque esté en la ventana", async () => {
    const id = await booking({ startsInMin: 8, code: "482917", loaded: false });
    const n = notifier();
    const r = await new AccessCodeService(repo, n).sweep();
    expect(r.sent).toBe(0);
    expect(n.notifyAccessCode).not.toHaveBeenCalled();
    expect((await row(id)).access_sent_at).toBeNull();
  });

  it("no manda fuera de la ventana: una sesión en 2 horas espera", async () => {
    await booking({ startsInMin: 120, code: "482917", loaded: true });
    const n = notifier();
    expect((await new AccessCodeService(repo, n).sweep()).sent).toBe(0);
  });

  it("no manda una reserva sin confirmar ni una que ya empezó", async () => {
    await booking({ startsInMin: 8, code: "482917", loaded: true, status: "held" });
    await booking({ startsInMin: -5, durationMin: 10, code: "111222", loaded: true }); // −5 → +5, no solapa con +8
    const n = notifier();
    expect((await new AccessCodeService(repo, n).sweep()).sent).toBe(0);
  });

  it("sin email no manda y lo cuenta aparte", async () => {
    await booking({ startsInMin: 8, code: "482917", loaded: true, email: null });
    const r = await new AccessCodeService(repo, notifier()).sweep();
    expect(r).toMatchObject({ sent: 0, skippedNoEmail: 1 });
  });

  it("si el correo falla, suelta el reclamo y la próxima corrida reintenta", async () => {
    const id = await booking({ startsInMin: 8, code: "482917", loaded: true });
    const n = { notifyAccessCode: vi.fn().mockRejectedValueOnce(new Error("resend down")).mockResolvedValueOnce(true) };
    const svc = new AccessCodeService(repo, n);

    expect((await svc.sweep()).sent).toBe(0);
    expect((await row(id)).access_sent_at).toBeNull(); // reclamo soltado

    expect((await svc.sweep()).sent).toBe(1);
    expect((await row(id)).access_sent_at).not.toBeNull();
  });
});

describe("el ciclo del dueño", () => {
  it("marcar cargado, y el PIN pasa a contar como 'por quitar' cuando la sesión termina", async () => {
    const id = await booking({ startsInMin: -90, durationMin: 60, code: "482917" }); // terminó hace 30 min
    expect(await repo.accessToRemoveCount()).toBe(1);
    await repo.markAccessRemoved(id);
    expect(await repo.accessToRemoveCount()).toBe(0);
    expect((await row(id)).access_removed_at).not.toBeNull();
  });

  it("'por cargar' cuenta los generados sin cargar de sesiones futuras", async () => {
    await booking({ startsInMin: 60, code: "482917" });
    await booking({ startsInMin: 180, code: "111222", loaded: true });
    await booking({ startsInMin: -120, code: "333444" }); // terminó: ya no es "por cargar"
    expect(await repo.accessToLoadCount()).toBe(1);
  });

  it("las listas de /admin/cerradura usan los MISMOS predicados que los conteos, y ordenan por inicio", async () => {
    // por cargar: dos futuras sin cargar (la de 60 min antes que la de 180), una cargada,
    // una terminada, una held y una de curso: solo las dos primeras.
    // (slots de 60 min separados ≥ 60 min: reservations_no_overlap es una exclusion constraint)
    const soon = await booking({ startsInMin: 60, code: "482917" });
    const later = await booking({ startsInMin: 300, code: "555666" });
    await booking({ startsInMin: 180, code: "111222", loaded: true });
    await booking({ startsInMin: -120, code: "333444" });
    await booking({ startsInMin: 420, code: "777888", status: "held" });
    await booking({ startsInMin: 540, code: "999000", kind: "curso" });
    // por quitar: dos terminadas con código sin quitar (la más vieja primero), una ya quitada
    const oldest = await booking({ startsInMin: -600, code: "121212" });
    const recent = await booking({ startsInMin: -240, code: "343434", loaded: true, sent: true });
    await booking({ startsInMin: -360, code: "565656", removed: true });

    const toLoad = await repo.accessToLoad();
    expect(toLoad.map((r) => r.id)).toEqual([soon, later]);
    expect(toLoad).toHaveLength(await repo.accessToLoadCount());
    expect(toLoad[0]).toMatchObject({ accessCode: "482917", customerName: "Ana", customerEmail: "ana@e.cl" });

    const toRemove = await repo.accessToRemove();
    // la de -120 también terminó con código y sin quitar: entra acá, entre las dos
    expect(toRemove.map((r) => r.id)).toEqual([oldest, recent, expect.any(String)]);
    expect(toRemove).toHaveLength(await repo.accessToRemoveCount());
    expect(toRemove.every((r) => /^\d+$/.test(r.accessCode))).toBe(true);
  });

  it("marcar cargado deja access_loaded_at", async () => {
    const id = await booking({ startsInMin: 60, code: "482917" });
    await repo.markAccessLoaded(id);
    expect((await row(id)).access_loaded_at).not.toBeNull();
  });

  it("marcar cargado sin PIN no hace nada", async () => {
    const id = await booking({ startsInMin: 60 });
    await repo.markAccessLoaded(id);
    expect((await row(id)).access_loaded_at).toBeNull();
  });

  it("regenerar da un PIN nuevo y REINICIA el ciclo: hay que volver a cargarlo", async () => {
    const id = await booking({ startsInMin: 60, code: "482917", loaded: true, sent: true });
    const nuevo = await repo.regenerateAccessCode(id);
    expect(nuevo).toMatch(/^\d{6}$/);
    expect(nuevo).not.toBe("482917");
    expect(await row(id)).toMatchObject({ access_code: nuevo, access_loaded_at: null, access_sent_at: null, access_removed_at: null });
  });

  it("un PIN tipeado a mano también reinicia el ciclo", async () => {
    const id = await booking({ startsInMin: 60, code: "482917", loaded: true, sent: true });
    await repo.markAccess(id, "9988");
    expect(await row(id)).toMatchObject({ access_code: "9988", access_loaded_at: null, access_sent_at: null });
  });
});

describe("la forma del PIN (CHECK)", () => {
  it("acepta de 4 a 10 dígitos: los 8 dígitos que ya hay en prod pasan", async () => {
    const codes = ["4829", "482917", "48291736", "4829173650"];
    for (const [i, code] of codes.entries()) {
      await expect(booking({ startsInMin: 60 + i * 120, code })).resolves.toBeTruthy();
    }
  });

  it("rechaza lo que no es un PIN", async () => {
    for (const code of ["123", "12345678901", "48a917", "48 29 17"]) {
      await expect(booking({ startsInMin: 60, code })).rejects.toThrow(/reservations_access_code_shape/);
    }
  });
});

describe("la migración", () => {
  it("un código que ya se había enviado quedó marcado como cargado (backfill)", async () => {
    // El backfill corrió sobre prod; acá se prueba la regla sobre una fila equivalente.
    const id = await booking({ startsInMin: 60, code: "12345678", sent: true, loaded: false });
    await pg.query(
      "update reservations set access_loaded_at = access_sent_at where access_code is not null and access_sent_at is not null and access_loaded_at is null",
    );
    expect((await row(id)).access_loaded_at).not.toBeNull();
  });

  it("el job de pg_cron quedó registrado cada 5 minutos", async () => {
    const j = await pg.query<{ schedule: string; command: string }>("select schedule, command from cron.job where jobname='access-codes'");
    expect(j.rows).toHaveLength(1);
    expect(j.rows[0].schedule).toBe("*/5 * * * *");
    expect(j.rows[0].command).toContain("run_access_code_cron");
  });

  it("sin secretos en Vault el runner es un no-op y no revienta", async () => {
    await expect(pg.query("select run_access_code_cron()")).resolves.toBeTruthy();
  });
});
