/**
 * Integración del export CSV del admin (/admin/guia/leads.csv): permiso, cabeceras de
 * descarga y contenido real desde Supabase local. La sesión se mockea (vi.hoisted).
 */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/admin/(panel)/guia/leads.csv/route";
import { SupabaseGuideLeadRepository } from "./guide-lead-repository";
import { createServiceClient } from "./supabase-client";

/** Input ya normalizado, como lo entrega parseGuideLead. */
const leadInput = (email: string, source = "hero", guide = "guia-dj") => ({
  email,
  source,
  guide,
  utm: { source: null, medium: null, campaign: null, content: null, term: null },
  referrerHost: null,
});


const auth = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/src/infrastructure/auth/require-admin", () => ({
  requirePermission: async () => {
    if (!auth.allowed) throw new Error("no autorizado");
  },
}));

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const db = createServiceClient(URL, KEY);
const repo = new SupabaseGuideLeadRepository(db);
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
  auth.allowed = true;
  await raw("truncate guide_leads cascade");
});
afterAll(async () => {
  if (connected) await pg.end();
});

describe("GET /admin/guia/leads.csv", () => {
  it("con ?g= filtra el CSV y el nombre del archivo lo dice", async () => {
    await repo.request(leadInput("dj@correo.cl", "hero", "guia-dj"));
    const res = await GET(new Request("http://localhost/admin/guia/leads.csv?g=guia-dj"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("guia-leads-guia-dj-");
    const body = await res.text();
    expect(body).toContain("dj@correo.cl");
  });

  it("un ?g= que no existe cae a 'todas' en vez de devolver un CSV vacío sin explicación", async () => {
    await repo.request(leadInput("dj@correo.cl"));
    const res = await GET(new Request("http://localhost/admin/guia/leads.csv?g=no-existe"));
    expect(res.headers.get("content-disposition")).toContain("guia-leads-todas-");
    expect(await res.text()).toContain("dj@correo.cl");
  });

  it("sin permiso → 403 y nada de datos", async () => {
    auth.allowed = false;
    await repo.request(leadInput("dj@correo.cl", "hero"));
    const res = await GET(new Request("http://localhost/admin/guia/leads.csv"));
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("dj@correo.cl");
  });

  it("con permiso → CSV descargable, UTF-8 con BOM, sin cache, con los leads en orden cronológico", async () => {
    await repo.request(leadInput("ana@correo.cl", "hero"));
    await repo.request(leadInput("beto@correo.cl", "cierre"));
    const res = await GET(new Request("http://localhost/admin/guia/leads.csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    // El nombre dice QUÉ se descargó: "todas" o el slug de la guía filtrada.
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="guia-leads-(todas|[a-z0-9-]+)-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    // Response.text() quita el BOM al decodificar (spec Fetch): se miran los bytes.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder().decode(bytes);
    // La guía va primera: ordenar en Excel agrupa por guía sin configurar nada.
    expect(body.startsWith("guia,email,origen,pedidos,")).toBe(true);
    const lines = body.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^guia-dj,ana@correo\.cl,hero,1,/);
    expect(lines[2]).toMatch(/^guia-dj,beto@correo\.cl,cierre,1,/);
  });
});
