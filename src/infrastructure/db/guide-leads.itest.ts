/**
 * Integración: contrato SQL de `guide_leads` (migraciones 20260915130000_guia_dj y
 * 20260923190000_guias_multi).
 *
 * Cubre lo que las migraciones prometen y ningún adapter puede garantizar solo: el RPC
 * `guide_lead_capture` es idempotente por (guía, email) —mismo token, cuenta re-pedidos,
 * no pisa `source` ni `consent_at`, y los UTM son de primer toque CON datos—, los CHECK
 * espejan el dominio, el bucket `guias` es privado y la tabla no es visible para anon.
 */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
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

/** El RPC nuevo: la guía es parte de la clave. */
async function capture(
  email: string,
  source = "hero",
  guide = "guia-dj",
  utm: { source?: string; medium?: string } = {},
): Promise<RequestRow> {
  const { data, error } = await db
    .rpc("guide_lead_capture", {
      p_email: email,
      p_source: source,
      p_guide: guide,
      ...(utm.source ? { p_utm_source: utm.source } : {}),
      ...(utm.medium ? { p_utm_medium: utm.medium } : {}),
    })
    .single();
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

  it("acepta un source nuevo: la DB ya no tiene el catálogo, valida la FORMA", async () => {
    // ('hero','fragmento','cierre') era el layout de UNA landing. Cada guía declara los
    // suyos en TypeScript; la DB solo cuida que el valor no ensucie el CSV del admin.
    await expect(request("dj@correo.cl", "sidebar")).resolves.toMatchObject({ request_count: 1 });
  });

  it("rechaza un source con forma inválida", async () => {
    for (const malo of ["Hero!", "a", "con espacio", "1numero"]) {
      await expect(request(`x-${malo.length}@correo.cl`, malo), malo).rejects.toMatchObject({ code: "23514" });
    }
    await expect(request("largo@correo.cl", "a".repeat(25))).rejects.toMatchObject({ code: "23514" });
  });

  it("rechaza un guide_slug con forma inválida", async () => {
    for (const malo of ["Guia_DJ", "ab", "--x", "a".repeat(41)]) {
      await expect(
        raw("insert into guide_leads (email, source, guide_slug) values ($1, 'hero', $2)", ["g@correo.cl", malo]),
        malo,
      ).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("acota el largo de los UTM: vienen de la query string", async () => {
    await expect(
      raw("insert into guide_leads (email, source, utm_source) values ($1, 'hero', repeat('z', 121))", ["u@correo.cl"]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rechaza un token que no sea hex de 48 (unicidad + largo)", async () => {
    await expect(
      raw("insert into guide_leads (email, source, download_token) values ($1, 'hero', 'corto')", ["x@correo.cl"]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("multi-guía", () => {
  it("la misma persona en dos guías son DOS leads, con token propio cada uno", async () => {
    // El titular del cambio: el link del correo es durable y apunta a UN PDF, así que el
    // token no se puede compartir entre guías.
    const a = await capture("dj@correo.cl", "hero", "guia-dj");
    const b = await capture("dj@correo.cl", "hero", "guia-mezcla");
    expect(a.id).not.toBe(b.id);
    expect(a.download_token).not.toBe(b.download_token);
    expect([a.request_count, b.request_count]).toEqual([1, 1]);
  });

  it("re-pedir la MISMA guía suma sin duplicar y conserva el token", async () => {
    const first = await capture("dj@correo.cl", "hero", "guia-dj");
    const again = await capture("dj@correo.cl", "cierre", "guia-dj");
    expect(again.request_count).toBe(2);
    expect(again.download_token).toBe(first.download_token);
    const { rows } = await raw("select source from guide_leads where email = $1", ["dj@correo.cl"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].source, "el source es de primer toque").toBe("hero");
  });

  it("la unicidad se mudó a (guide_slug, email): el email solo ya no alcanza", async () => {
    await capture("dj@correo.cl", "hero", "guia-dj");
    await expect(
      raw("insert into guide_leads (email, source, guide_slug) values ($1, 'hero', 'guia-dj')", ["dj@correo.cl"]),
    ).rejects.toMatchObject({ code: "23505" });
    // …pero la misma persona en otra guía entra sin chistar.
    await expect(
      raw("insert into guide_leads (email, source, guide_slug) values ($1, 'hero', 'guia-mezcla')", ["dj@correo.cl"]),
    ).resolves.toBeTruthy();
  });

  it("un insert sin guide_slug toma el default 'guia-dj'", async () => {
    await raw("insert into guide_leads (email, source) values ($1, 'hero')", ["dflt@correo.cl"]);
    const { rows } = await raw("select guide_slug from guide_leads where email = $1", ["dflt@correo.cl"]);
    expect(rows[0].guide_slug).toBe("guia-dj");
  });

  it("los UTM son de PRIMER TOQUE CON DATOS: entran una vez y no se pisan", async () => {
    // Si el primer pedido llegó directo y el segundo por campaña, la atribución útil es
    // la campaña — de ahí el coalesce en vez de un overwrite.
    await capture("utm@correo.cl", "hero", "guia-dj");
    await capture("utm@correo.cl", "hero", "guia-dj", { source: "instagram", medium: "social" });
    await capture("utm@correo.cl", "hero", "guia-dj", { source: "google", medium: "cpc" });
    const { rows } = await raw("select utm_source, utm_medium, request_count from guide_leads where email = $1", [
      "utm@correo.cl",
    ]);
    expect(rows[0]).toMatchObject({ utm_source: "instagram", utm_medium: "social", request_count: 3 });
  });

  it("consent_at se fija al alta y un re-pedido no lo mueve", async () => {
    await capture("c@correo.cl", "hero", "guia-dj");
    const before = await raw("select consent_at from guide_leads where email = $1", ["c@correo.cl"]);
    await capture("c@correo.cl", "hero", "guia-dj");
    const after = await raw("select consent_at, last_requested_at from guide_leads where email = $1", ["c@correo.cl"]);
    expect(after.rows[0].consent_at).toEqual(before.rows[0].consent_at);
    expect(new Date(after.rows[0].last_requested_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before.rows[0].consent_at).getTime(),
    );
  });

  /**
   * EL CONTRATO DE LA VENTANA DE DESPLIEGUE.
   *
   * Producción despliega `main` al instante pero la migración espera aprobación manual.
   * Durante esa ventana el código vivo sigue llamando `guide_lead_request(email, source)`,
   * así que la función tiene que sobrevivir como wrapper. Sin esto, el instante en que se
   * aprueba la migración cada pedido devuelve 503 y NO se guarda ni un lead.
   *
   * Esta prueba se BORRA en la migración de contracción, junto con la función.
   */
  it("el RPC viejo sigue vivo y escribe guide_slug = 'guia-dj'", async () => {
    const row = await request("viejo@correo.cl", "fragmento");
    expect(row.download_token).toMatch(/^[0-9a-f]{48}$/);
    const { rows } = await raw("select guide_slug, source from guide_leads where email = $1", ["viejo@correo.cl"]);
    expect(rows[0]).toMatchObject({ guide_slug: "guia-dj", source: "fragmento" });
  });

  it("los índices quedaron como los espera el admin", async () => {
    const { rows } = await raw("select indexname from pg_indexes where tablename = 'guide_leads'");
    const names = rows.map((r: { indexname: string }) => r.indexname);
    expect(names).toContain("guide_leads_guide_email_key");
    expect(names).toContain("guide_leads_guide_created_idx");
    expect(names, "la pestaña 'Todas' sigue usando este").toContain("guide_leads_created_idx");
    expect(names, "la unicidad por email sola ya no existe").not.toContain("guide_leads_email_key");
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
  // La propiedad es "anon no lee filas". El mecanismo depende de la imagen: en las
  // imágenes nuevas de Supabase anon tiene el grant por defecto sobre public y es RLS
  // (sin policies) quien deja 0 filas; en las viejas no hay grant y el SELECT falla con
  // 42501. Las dos formas de "no" valen; lo que nunca puede pasar es ver el lead.
  it("anon no lee guide_leads (RLS sin policies, con o sin grant por defecto)", async () => {
    await request("secreto@correo.cl");
    await raw("begin");
    try {
      await raw("set local role anon");
      const r = await raw("select count(*)::int as n from guide_leads").catch((e: unknown) => e);
      if (r instanceof Error) expect(r).toMatchObject({ code: "42501" });
      else expect((r as { rows: { n: number }[] }).rows[0].n).toBe(0);
    } finally {
      await raw("rollback");
    }
  });
});

describe("SupabaseGuideLeadRepository", () => {
  const repo = new SupabaseGuideLeadRepository(db);

  it("request: primera vez → isNew:true con id y token", async () => {
    const r = await repo.request(leadInput("dj@correo.cl", "hero"));
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.token).toMatch(/^[0-9a-f]{48}$/);
    expect(r.isNew).toBe(true);
  });

  it("request: re-pedido → isNew:false y el mismo token", async () => {
    const a = await repo.request(leadInput("dj@correo.cl", "hero"));
    const b = await repo.request(leadInput("dj@correo.cl", "fragmento"));
    expect(b).toEqual({ id: a.id, token: a.token, isNew: false });
  });

  it("touchDownload: token conocido → su GUÍA y marca last_downloaded_at; desconocido → null", async () => {
    // Devuelve la guía y no un booleano para poder firmar el PDF correcto sin una
    // segunda consulta por cada clic del correo.
    const { token } = await repo.request(leadInput("dj@correo.cl", "hero"));
    expect(await repo.touchDownload(token)).toEqual({ guideSlug: "guia-dj" });
    const { rows } = await raw("select last_downloaded_at is not null as touched from guide_leads");
    expect(rows[0].touched).toBe(true);
    expect(await repo.touchDownload("f".repeat(48))).toBeNull();
  });

  it("touchDownload no es de un solo uso: dos clics, la misma guía", async () => {
    const { token } = await repo.request(leadInput("dj@correo.cl", "hero"));
    expect(await repo.touchDownload(token)).toEqual({ guideSlug: "guia-dj" });
    expect(await repo.touchDownload(token)).toEqual({ guideSlug: "guia-dj" });
  });
});

describe("SupabaseGuideLeadRepository — admin (list / exportAll)", () => {
  const repo = new SupabaseGuideLeadRepository(db);
  const seed = async () => {
    await repo.request(leadInput("ana@correo.cl", "hero"));
    await repo.request(leadInput("beto_dj@correo.cl", "fragmento"));
    await repo.request(leadInput("cami@otro.cl", "cierre"));
    await repo.request(leadInput("cami@otro.cl", "hero")); // re-pedido
  };
  const SLUGS = ["guia-dj", "guia-mezcla"];
  const q = (over: Partial<{ q: string; guide: string | null; page: number; perPage: number }> = {}) => ({
    q: "",
    guide: null,
    page: 1,
    perPage: 25,
    ...over,
  });

  it("list: sin búsqueda devuelve todo, más reciente primero, con totales", async () => {
    await seed();
    const r = await repo.list(q(), SLUGS);
    expect(r.rows.map((x) => x.email)).toEqual(["cami@otro.cl", "beto_dj@correo.cl", "ana@correo.cl"]);
    expect(r.total).toBe(3);
    expect(r.grandTotal).toBe(3);
    const cami = r.rows[0];
    expect(cami).toMatchObject({ source: "cierre", requestCount: 2, lastDownloadedAt: null });
    expect(cami.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("list: busca por fragmento de email (case-insensitive) y total refleja el filtro", async () => {
    await seed();
    const r = await repo.list(q({ q: "CORREO" }), SLUGS);
    expect(r.rows.map((x) => x.email).sort()).toEqual(["ana@correo.cl", "beto_dj@correo.cl"]);
    expect(r.total).toBe(2);
    expect(r.grandTotal).toBe(3);
  });

  it("list: los comodines de ILIKE no sobre-matchean (`_` y `%` literales; `*` no es comodín)", async () => {
    await seed();
    expect((await repo.list(q({ q: "beto_dj" }), SLUGS)).rows).toHaveLength(1);
    expect((await repo.list(q({ q: "beto%dj" }), SLUGS)).rows).toHaveLength(0);
    expect((await repo.list(q({ q: "beto*dj" }), SLUGS)).rows).toHaveLength(0);
    // Solo `*` → aguja vacía tras sanear → sin filtro (misma convención que Clientes).
    expect((await repo.list(q({ q: "*" }), SLUGS)).rows).toHaveLength(3);
  });

  it("list: pagina sin perder filas", async () => {
    await seed();
    const p1 = await repo.list(q({ perPage: 2 }), SLUGS);
    const p2 = await repo.list(q({ perPage: 2, page: 2 }), SLUGS);
    expect(p1.rows).toHaveLength(2);
    expect(p2.rows).toHaveLength(1);
    expect(new Set([...p1.rows, ...p2.rows].map((x) => x.id)).size).toBe(3);
    expect((await repo.list(q({ perPage: 2, page: 9 }), SLUGS)).rows).toEqual([]);
  });

  it("list: filtra por guía y los conteos por guía cuadran", async () => {
    await seed();
    await repo.request(leadInput("mezcla@correo.cl", "hero", "guia-mezcla"));

    const todas = await repo.list(q(), SLUGS);
    expect(todas.grandTotal).toBe(4);
    expect(todas.countsByGuide).toEqual({ "guia-dj": 3, "guia-mezcla": 1 });

    const solo = await repo.list(q({ guide: "guia-mezcla" }), SLUGS);
    expect(solo.rows.map((x) => x.email)).toEqual(["mezcla@correo.cl"]);
    expect(solo.total).toBe(1);
    // grandTotal NO se filtra: es el "de X" del contador de la página.
    expect(solo.grandTotal).toBe(4);
  });

  it("list: el filtro por guía y la búsqueda se combinan", async () => {
    await seed();
    await repo.request(leadInput("ana@correo.cl", "hero", "guia-mezcla"));
    const r = await repo.list(q({ q: "ana", guide: "guia-mezcla" }), SLUGS);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].guideSlug).toBe("guia-mezcla");
  });

  it("exportAll: filtra por guía cuando se pide", async () => {
    await seed();
    await repo.request(leadInput("mezcla@correo.cl", "hero", "guia-mezcla"));
    const solo = await repo.exportAll({ guide: "guia-mezcla", limit: 100 });
    expect(solo.map((r) => r.email)).toEqual(["mezcla@correo.cl"]);
    expect(await repo.exportAll({ guide: null, limit: 100 })).toHaveLength(4);
  });

  it("exportAll: trae los UTM y el consentimiento que necesita el CSV", async () => {
    await repo.request({
      ...leadInput("utm@correo.cl"),
      utm: { source: "instagram", medium: "social", campaign: null, content: null, term: null },
      referrerHost: "www.google.com",
    });
    const [r] = await repo.exportAll({ guide: null, limit: 10 });
    expect(r).toMatchObject({ utmSource: "instagram", utmMedium: "social", referrerHost: "www.google.com" });
    expect(r.consentAt).toBeTruthy();
  });

  it("exportAll: todos, en orden cronológico, hasta el tope", async () => {
    await seed();
    const all = await repo.exportAll({ guide: null, limit: 100 });
    expect(all.map((x) => x.email)).toEqual(["ana@correo.cl", "beto_dj@correo.cl", "cami@otro.cl"]);
    expect(await repo.exportAll({ guide: null, limit: 2 })).toHaveLength(2);
  });
});
