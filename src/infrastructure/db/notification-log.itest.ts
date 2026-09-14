/** Integración: bitácora de correos (record + fallos recientes) contra la DB local. */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SupabaseNotificationLogRepository } from "./notification-log-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const repo = new SupabaseNotificationLogRepository(createServiceClient(URL, KEY));
const pg = new Client({ connectionString: DB_URL });

beforeAll(async () => {
  await pg.connect();
});
afterAll(async () => {
  await pg.query("truncate notification_log");
  await pg.end();
});
beforeEach(async () => {
  await pg.query("truncate notification_log");
});

describe("SupabaseNotificationLogRepository", () => {
  it("registra ok y fallo; recentFailures devuelve solo los fallos, más reciente primero", async () => {
    await repo.record({ template: "customerConfirmation", recipient: "a@e.cl", subject: "ok", ok: true, error: null });
    await repo.record({ template: "customerConfirmation", recipient: "b@e.cl", subject: "x", ok: false, error: "API key is invalid" });
    await repo.record({ template: "ownerNotification", recipient: "o@e.cl", subject: "y", ok: false, error: "429" });

    const fails = await repo.recentFailures(24);
    expect(fails.map((f) => f.recipient)).toEqual(["o@e.cl", "b@e.cl"]);
    expect(fails[1].error).toBe("API key is invalid");
    expect(fails[1].template).toBe("customerConfirmation");
  });

  it("un fallo sin mensaje igual queda con error no nulo (CHECK de la tabla)", async () => {
    await repo.record({ template: "t", recipient: "c@e.cl", subject: "s", ok: false, error: null });
    const [f] = await repo.recentFailures(1);
    expect(f.error).toBe("error");
  });

  it("fuera de la ventana no aparece", async () => {
    await repo.record({ template: "t", recipient: "d@e.cl", subject: "s", ok: false, error: "boom" });
    await pg.query("update notification_log set created_at = now() - interval '2 days'");
    expect(await repo.recentFailures(24)).toEqual([]);
  });
});
