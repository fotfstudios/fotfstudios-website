/**
 * Integración: contrato SQL de `guide_leads` (migración 20260916120000_guia_dj).
 *
 * Cubre lo que la migración promete y ningún adapter puede garantizar solo: el RPC
 * `guide_lead_request` es idempotente por email (mismo token, cuenta re-pedidos, no pisa
 * `source`), los CHECK espejan el dominio, el bucket `guias` es privado y la tabla no es
 * visible para anon.
 */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SupabaseGuideLeadRepository } from "./guide-lead-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

type RequestRow = { id: string; download_token: string; request_count: number };

async function request(email: string, source = "hero"): Promise<RequestRow> {
  const { data, error } = await db.rpc("guide_lead_request", { p_email: email, p_source: source }).single();
  if (error) throw error;
  return data as RequestRow;
}

beforeEach(async () => {
  await raw("truncate guide_leads cascade");
});

afterAll(async () => {
  if (connected) await pg.end();
});

describe("guide_lead_request (RPC)", () => {
  it("el primer pedido inserta con token hex de 48 y request_count 1", async () => {
    const row = await request("dj@correo.cl", "hero");
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.download_token).toMatch(/^[0-9a-f]{48}$/);
    expect(row.request_count).toBe(1);
  });

  it("re-pedir con el mismo email devuelve el MISMO token y suma request_count", async () => {
    const first = await request("dj@correo.cl", "hero");
    const second = await request("dj@correo.cl", "cierre");
    expect(second.id).toBe(first.id);
    expect(second.download_token).toBe(first.download_token);
    expect(second.request_count).toBe(2);
  });

  it("`source` es el primer toque: un re-pedido desde otro formulario no lo pisa", async () => {
    await request("dj@correo.cl", "hero");
    await request("dj@correo.cl", "cierre");
    const { rows } = await raw("select source from guide_leads where email = $1", ["dj@correo.cl"]);
    expect(rows[0].source).toBe("hero");
  });

  it("un re-pedido actualiza last_requested_at pero no created_at", async () => {
    await request("dj@correo.cl");
    await raw("update guide_leads set created_at = now() - interval '1 day', last_requested_at = now() - interval '1 day'");
    await request("dj@correo.cl");
    const { rows } = await raw(
      "select (created_at < now() - interval '23 hours') as old_created, (last_requested_at > now() - interval '1 minute') as fresh_request from guide_leads",
    );
    expect(rows[0]).toEqual({ old_created: true, fresh_request: true });
  });

  it("emails distintos son leads distintos con tokens distintos", async () => {
    const a = await request("a@correo.cl");
    const b = await request("b@correo.cl");
    expect(a.id).not.toBe(b.id);
    expect(a.download_token).not.toBe(b.download_token);
  });
});

describe("CHECK constraints de la DB (espejo del dominio)", () => {
  it("rechaza un email sin forma válida", async () => {
    await expect(request("no-es-un-email", "hero")).rejects.toMatchObject({ code: "23514" });
  });

  it("rechaza un email de más de 120 caracteres", async () => {
    const long = "a".repeat(110) + "@correo.cl"; // 120 exactos pasan; 121 no
    await expect(request(long + "x", "hero")).rejects.toMatchObject({ code: "23514" });
  });

  it("rechaza un source fuera del catálogo", async () => {
    await expect(request("dj@correo.cl", "popup")).rejects.toMatchObject({ code: "23514" });
  });

  it("rechaza un token que no sea hex de 48 (unicidad + largo)", async () => {
    await expect(
      raw("insert into guide_leads (email, source, download_token) values ($1, 'hero', 'corto')", ["x@correo.cl"]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("bucket `guias`", () => {
  it("existe, es privado y solo acepta PDF", async () => {
    const { rows } = await raw("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'guias'");
    expect(rows).toHaveLength(1);
    expect(rows[0].public).toBe(false);
    expect(rows[0].allowed_mime_types).toEqual(["application/pdf"]);
    expect(Number(rows[0].file_size_limit)).toBeGreaterThan(0);
  });
});

describe("acceso", () => {
  it("anon no puede leer guide_leads (RLS sin policies + sin grant)", async () => {
    await raw("begin");
    try {
      await raw("set local role anon");
      await expect(raw("select count(*) from guide_leads")).rejects.toMatchObject({ code: "42501" });
    } finally {
      await raw("rollback");
    }
  });
});

describe("SupabaseGuideLeadRepository", () => {
  const repo = new SupabaseGuideLeadRepository(db);

  it("request: primera vez → isNew:true con id y token", async () => {
    const r = await repo.request({ email: "dj@correo.cl", source: "hero" });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.token).toMatch(/^[0-9a-f]{48}$/);
    expect(r.isNew).toBe(true);
  });

  it("request: re-pedido → isNew:false y el mismo token", async () => {
    const a = await repo.request({ email: "dj@correo.cl", source: "hero" });
    const b = await repo.request({ email: "dj@correo.cl", source: "fragmento" });
    expect(b).toEqual({ id: a.id, token: a.token, isNew: false });
  });

  it("touchDownload: token conocido → true y marca last_downloaded_at; desconocido → false", async () => {
    const { token } = await repo.request({ email: "dj@correo.cl", source: "hero" });
    expect(await repo.touchDownload(token)).toBe(true);
    const { rows } = await raw("select last_downloaded_at is not null as touched from guide_leads");
    expect(rows[0].touched).toBe(true);
    expect(await repo.touchDownload("f".repeat(48))).toBe(false);
  });

  it("touchDownload no es de un solo uso: dos clics, dos true", async () => {
    const { token } = await repo.request({ email: "dj@correo.cl", source: "hero" });
    expect(await repo.touchDownload(token)).toBe(true);
    expect(await repo.touchDownload(token)).toBe(true);
  });
});
