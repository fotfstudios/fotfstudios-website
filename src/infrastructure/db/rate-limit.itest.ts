/** Integración: rate limiter de ventana fija (permite hasta max, luego bloquea). */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SupabaseRateLimiter } from "./rate-limit-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const limiter = new SupabaseRateLimiter(db);
const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql);
}

beforeEach(async () => {
  await raw("truncate rate_limit_counters");
});

afterAll(async () => {
  if (connected) await pg.end();
});

describe("SupabaseRateLimiter", () => {
  it("permite hasta max y luego bloquea", async () => {
    for (let i = 0; i < 3; i++) {
      expect(await limiter.hit("k:abc", 3, 600)).toBe(true);
    }
    expect(await limiter.hit("k:abc", 3, 600)).toBe(false);
    expect(await limiter.hit("k:abc", 3, 600)).toBe(false);
  });

  it("cuenta cada clave por separado", async () => {
    expect(await limiter.hit("k:1", 1, 600)).toBe(true);
    expect(await limiter.hit("k:1", 1, 600)).toBe(false);
    // otra clave arranca de cero
    expect(await limiter.hit("k:2", 1, 600)).toBe(true);
  });

  it("ventanas distintas no comparten cuenta (window de 1s)", async () => {
    expect(await limiter.hit("k:win", 1, 1)).toBe(true);
    expect(await limiter.hit("k:win", 1, 1)).toBe(false);
    // esperar a cruzar el borde del bucket de 1s
    await new Promise((r) => setTimeout(r, 1100));
    expect(await limiter.hit("k:win", 1, 1)).toBe(true);
  });
});
