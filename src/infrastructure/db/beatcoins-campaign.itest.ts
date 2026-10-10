/**
 * Campaña de Beatcoins contra la DB real: audiencia y cola del anuncio, reclamos, el resumen
 * mensual (mes, baja, anuncio reciente) y la baja por token. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BeatcoinsCampaignService, digestMonthStart } from "@/src/application/points/beatcoins-campaign-service";
import { SupabaseBeatcoinsCampaignRepository } from "./beatcoins-campaign-repository";
import { createServiceClient } from "./supabase-client";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
const db = createServiceClient(process.env.SUPABASE_URL ?? "http://127.0.0.1:54421", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
const repo = new SupabaseBeatcoinsCampaignRepository(db);

const clean = () => pg.query("truncate points_ledger, customers cascade");
beforeAll(() => pg.connect());
beforeEach(clean);
afterAll(async () => {
  await clean();
  await pg.end();
});

async function customer(email: string | null, balance: number, phone: string | null = null): Promise<{ id: string; token: string }> {
  const { rows } = await pg.query<{ id: string; token: string }>(
    `insert into customers (email, name, phone, points_balance, points_protected) values ($1, 'Ana', $3, $2, greatest($2, 0))
     returning id, email_unsubscribe_token token`,
    [email, balance, phone],
  );
  return rows[0];
}
const col = async (id: string, c: string) => (await pg.query(`select ${c} v from customers where id = $1`, [id])).rows[0].v;

describe("anuncio", () => {
  it("audiencia = con correo y saldo; encolar no repite; el barrido lo manda una vez", async () => {
    const a = await customer("a@e.cl", 1000);
    await customer("b@e.cl", 0);
    await customer(null, 500, "+56911112222");
    expect(await repo.launchAudience()).toBe(1);
    expect(await repo.queueLaunch()).toBe(1);
    expect(await repo.queueLaunch()).toBe(0);
    expect(await repo.launchAudience()).toBe(0);
    expect(await repo.launchStatus()).toEqual({ queued: 1, sent: 0 });

    const sent: string[] = [];
    const svc = new BeatcoinsCampaignService(repo, {
      notifyBeatcoinsLaunch: async (c) => void sent.push(c.email),
      notifyBeatcoinsDigest: async () => {},
    });
    const before = new Date("2026-10-20T15:00:00Z");
    expect((await svc.sweep(before)).launch).toBe(1);
    expect((await svc.sweep(before)).launch).toBe(0);
    expect(sent).toEqual(["a@e.cl"]);
    expect(await repo.launchStatus()).toEqual({ queued: 0, sent: 1 });
    expect(await col(a.id, "points_launch_sent_at is not null")).toBe(true);
  });

  it("un envío fallido vuelve a quedar pendiente", async () => {
    const a = await customer("a@e.cl", 1000);
    await repo.queueLaunch();
    expect(await repo.claimLaunch(a.id)).toBe(true);
    expect(await repo.claimLaunch(a.id)).toBe(false);
    await repo.releaseLaunch(a.id);
    expect((await repo.launchPending(10)).map((c) => c.customerId)).toEqual([a.id]);
  });
});

describe("resumen mensual", () => {
  const MONTH = "2026-12-01T03:00:00.000Z";
  const SINCE = "2026-11-13T15:00:00.000Z";

  it("solo con saldo, correo, sin baja, sin resumen este mes y sin anuncio reciente", async () => {
    const ok = await customer("ok@e.cl", 1000);
    const baja = await customer("baja@e.cl", 1000);
    const yaEsteMes = await customer("mes@e.cl", 1000);
    const mesPasado = await customer("pasado@e.cl", 1000);
    const anuncio = await customer("anuncio@e.cl", 1000);
    await customer("cero@e.cl", 0);
    await pg.query("update customers set email_digest_opt_out_at = now() where id = $1", [baja.id]);
    await pg.query("update customers set points_digest_sent_at = '2026-12-01T13:00:00Z' where id = $1", [yaEsteMes.id]);
    await pg.query("update customers set points_digest_sent_at = '2026-11-01T13:00:00Z' where id = $1", [mesPasado.id]);
    await pg.query("update customers set points_launch_sent_at = '2026-11-20T13:00:00Z' where id = $1", [anuncio.id]);
    const ids = (await repo.digestPending(MONTH, SINCE, 50)).map((c) => c.customerId).sort();
    expect(ids).toEqual([ok.id, mesPasado.id].sort());
  });

  it("el reclamo es uno por mes; soltarlo devuelve el valor anterior", async () => {
    const c = await customer("a@e.cl", 1000);
    // El reclamo estampa now(): el mes tiene que ser el real para que el segundo no pase.
    const month = digestMonthStart(new Date());
    await pg.query("update customers set points_digest_sent_at = '2020-01-01T13:00:00Z' where id = $1", [c.id]);
    expect(await repo.claimDigest(c.id, month)).toBe(true);
    expect(await repo.claimDigest(c.id, month)).toBe(false);
    await repo.releaseDigest(c.id, "2020-01-01T13:00:00Z");
    expect(new Date(await col(c.id, "points_digest_sent_at")).toISOString()).toBe("2020-01-01T13:00:00.000Z");
  });

  it("no se reclama si la persona se dio de baja entre medio", async () => {
    const c = await customer("a@e.cl", 1000);
    await pg.query("update customers set email_digest_opt_out_at = now() where id = $1", [c.id]);
    expect(await repo.claimDigest(c.id, MONTH)).toBe(false);
  });
});

describe("baja", () => {
  it("por token: idempotente, conserva la primera fecha; token desconocido → false", async () => {
    const c = await customer("a@e.cl", 1000);
    expect(await repo.unsubscribeDigest(c.token)).toBe(true);
    const first = await col(c.id, "email_digest_opt_out_at");
    expect(first).not.toBeNull();
    expect(await repo.unsubscribeDigest(c.token)).toBe(true);
    expect(await col(c.id, "email_digest_opt_out_at")).toEqual(first);
    expect(await repo.unsubscribeDigest("f".repeat(48))).toBe(false);
  });

  it("la casilla de la cuenta la quita y la vuelve a poner", async () => {
    const c = await customer("a@e.cl", 1000);
    await repo.setDigest(c.id, false);
    expect(await col(c.id, "email_digest_opt_out_at is not null")).toBe(true);
    await repo.setDigest(c.id, true);
    expect(await col(c.id, "email_digest_opt_out_at")).toBeNull();
  });
});
