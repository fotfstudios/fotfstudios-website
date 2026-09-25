/**
 * Integración: contrato SQL de `newsletter_subscribers` (migración 20260925170000_newsletter)
 * a través del adapter real.
 *
 * Cubre lo que la migración promete: alta idempotente por email con `welcome` solo en alta
 * nueva o re-alta, UTM de primer toque, baja idempotente por token (conserva la primera
 * fecha), re-alta que renueva el consentimiento, filtros/conteos del admin, export solo de
 * activos, CHECKs espejo del dominio, y la tabla invisible para anon.
 */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { NewsletterSubscribeInput } from "@/src/domain/newsletter/subscribe";
import { parseNovedadesSearchParams } from "@/src/domain/admin/novedades-list";
import { SupabaseNewsletterRepository } from "./newsletter-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const repo = new SupabaseNewsletterRepository(createServiceClient(URL, KEY));
const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

const input = (email: string, utmSource: string | null = null): NewsletterSubscribeInput => ({
  email,
  source: "curso_dj",
  utm: { source: utmSource, medium: null, campaign: null, content: null, term: null },
  referrerHost: null,
});

beforeEach(async () => {
  await raw("truncate newsletter_subscribers");
});

afterAll(async () => {
  if (connected) await pg.end();
});

describe("subscribe", () => {
  it("alta nueva: token hex de 48 y welcome", async () => {
    const s = await repo.subscribe(input("ana@correo.cl", "ig"));
    expect(s.unsubscribeToken).toMatch(/^[0-9a-f]{48}$/);
    expect(s.welcome).toBe(true);
  });

  it("repetir el alta: mismo token, sin welcome, cuenta y conserva el primer UTM", async () => {
    const a = await repo.subscribe(input("ana@correo.cl", "ig"));
    const b = await repo.subscribe(input("ana@correo.cl", "fb"));
    expect(b).toMatchObject({ id: a.id, unsubscribeToken: a.unsubscribeToken, welcome: false });
    const { rows } = await raw("select request_count, utm_source from newsletter_subscribers");
    expect(rows[0]).toEqual({ request_count: 2, utm_source: "ig" });
  });

  it("re-alta después de una baja: welcome, activo y consentimiento renovado", async () => {
    const a = await repo.subscribe(input("ana@correo.cl"));
    await raw("update newsletter_subscribers set consent_at = now() - interval '30 days'");
    await repo.unsubscribe(a.unsubscribeToken);
    const b = await repo.subscribe(input("ana@correo.cl"));
    expect(b.welcome).toBe(true);
    const { rows } = await raw(
      "select unsubscribed_at, consent_at > now() - interval '1 minute' as fresh from newsletter_subscribers",
    );
    expect(rows[0]).toEqual({ unsubscribed_at: null, fresh: true });
  });
});

describe("unsubscribe", () => {
  it("devuelve el email y es idempotente (conserva la primera fecha)", async () => {
    const a = await repo.subscribe(input("ana@correo.cl"));
    await expect(repo.unsubscribe(a.unsubscribeToken)).resolves.toBe("ana@correo.cl");
    const first = (await raw("select unsubscribed_at from newsletter_subscribers")).rows[0].unsubscribed_at;
    await expect(repo.unsubscribe(a.unsubscribeToken)).resolves.toBe("ana@correo.cl");
    const second = (await raw("select unsubscribed_at from newsletter_subscribers")).rows[0].unsubscribed_at;
    expect(second).toEqual(first);
  });

  it("token desconocido → null", async () => {
    await expect(repo.unsubscribe("0".repeat(48))).resolves.toBeNull();
  });
});

describe("admin", () => {
  it("filtra por estado, cuenta y exporta solo activos", async () => {
    await repo.subscribe(input("a@correo.cl"));
    const b = await repo.subscribe(input("b@correo.cl"));
    await repo.subscribe(input("c@correo.cl"));
    await repo.unsubscribe(b.unsubscribeToken);

    const activos = await repo.list(parseNovedadesSearchParams({}));
    expect(activos.counts).toEqual({ activos: 2, bajas: 1, todos: 3 });
    expect(activos.rows.map((r) => r.email).sort()).toEqual(["a@correo.cl", "c@correo.cl"]);

    const bajas = await repo.list(parseNovedadesSearchParams({ e: "bajas" }));
    expect(bajas.rows.map((r) => r.email)).toEqual(["b@correo.cl"]);

    const buscado = await repo.list(parseNovedadesSearchParams({ e: "todos", q: "c@" }));
    expect(buscado.total).toBe(1);

    const exp = await repo.exportActive(100);
    expect(exp.map((r) => r.email)).toEqual(["a@correo.cl", "c@correo.cl"]);
  });

  it("página fuera de rango → [] (no 416)", async () => {
    await repo.subscribe(input("a@correo.cl"));
    const r = await repo.list(parseNovedadesSearchParams({ p: "50" }));
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(1);
  });
});

describe("CHECKs", () => {
  it("rechaza email sin forma y source fuera de patrón", async () => {
    await expect(raw("insert into newsletter_subscribers (email, source) values ('nope', 'curso_dj')")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(raw("insert into newsletter_subscribers (email, source) values ('a@b.cl', 'Curso-DJ')")).rejects.toMatchObject({
      code: "23514",
    });
  });
});

// Mismo criterio que guide-leads.itest.ts: según la imagen, anon ve 0 filas (RLS sin
// policies) o no tiene grant (42501). Lo que nunca puede pasar es leer un suscriptor.
it("anon no lee newsletter_subscribers", async () => {
  await repo.subscribe(input("secreto@correo.cl"));
  await raw("begin");
  try {
    await raw("set local role anon");
    const r = await raw("select count(*)::int as n from newsletter_subscribers").catch((e: unknown) => e);
    if (r instanceof Error) expect(r).toMatchObject({ code: "42501" });
    else expect((r as { rows: { n: number }[] }).rows[0].n).toBe(0);
  } finally {
    await raw("rollback");
  }
});
