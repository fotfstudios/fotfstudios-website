/**
 * Integración: la correctitud que SOLO existe en la base — anti doble-reserva
 * (exclusion constraint), holds y sweep inline. Requiere Supabase local
 * (`npm run db:start`). Corre con `npm run test:integration`.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const client = new Client({ connectionString: DB_URL });
let resourceId: string;

// Bloque base de tiempo (UTC explícito para no depender de la tz del runner).
const A = ["2026-07-01T18:00:00-04:00", "2026-07-01T19:00:00-04:00"];
const OVERLAP = ["2026-07-01T18:30:00-04:00", "2026-07-01T19:30:00-04:00"];
const ADJACENT = ["2026-07-01T19:00:00-04:00", "2026-07-01T20:00:00-04:00"];

const hold = (s: string, e: string) =>
  client.query<{ id: string }>("select create_hold($1,$2,$3) as id", [resourceId, s, e]);

beforeAll(async () => {
  await client.connect();
  const r = await client.query<{ id: string }>("select id from resources limit 1");
  resourceId = r.rows[0].id;
});

afterAll(async () => {
  await client.query("delete from reservations");
  await client.end();
});

beforeEach(async () => {
  await client.query("delete from reservations");
});

describe("reservations (DB)", () => {
  it("rechaza un hold que se traslapa (exclusion constraint)", async () => {
    const a = await hold(A[0], A[1]);
    expect(a.rows[0].id).toBeTruthy();
    await expect(hold(OVERLAP[0], OVERLAP[1])).rejects.toThrow();
  });

  it("permite reservas adyacentes (fin == inicio)", async () => {
    await hold(A[0], A[1]);
    const b = await hold(ADJACENT[0], ADJACENT[1]);
    expect(b.rows[0].id).toBeTruthy();
  });

  it("el sweep inline libera un hold vencido y deja crear sobre él", async () => {
    await client.query(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at)
       values ($1,'booking','held',$2,$3, now() - interval '1 minute')`,
      [resourceId, A[0], A[1]],
    );
    // create_hold corre expire_stale_holds() inline → el vencido se libera
    const b = await hold(OVERLAP[0], OVERLAP[1]);
    expect(b.rows[0].id).toBeTruthy();
    const expired = await client.query<{ n: string }>(
      "select count(*)::text as n from reservations where status='expired'",
    );
    expect(Number(expired.rows[0].n)).toBeGreaterThanOrEqual(1);
  });

  it("una reserva confirmada bloquea un hold que se traslapa", async () => {
    await client.query(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at)
       values ($1,'booking','confirmed',$2,$3)`,
      [resourceId, A[0], A[1]],
    );
    await expect(hold(OVERLAP[0], OVERLAP[1])).rejects.toThrow();
  });
});
