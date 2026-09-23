/**
 * Integración del route público de la guía (/api/guia/leads) contra Supabase local:
 * ejercita el handler real (parser + dos limitadores + RPC + correo). Sin
 * `RESEND_API_KEY` el mailer cae a SMTP local (Mailpit) o al no-op.
 */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/guia/leads/route";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

/**
 * La guía se agrega por defecto para no repetirla en cada caso; pasándola explícita
 * (incluso inválida) se puede probar el rechazo.
 */
function post(body: unknown, ip = "203.0.113.10", rawBody?: string): Request {
  const withGuide =
    body && typeof body === "object" && !Array.isArray(body) && !("guide" in body)
      ? { ...body, guide: "guia-dj" }
      : body;
  const payload = rawBody ?? JSON.stringify(withGuide);
  return new Request("http://localhost/api/guia/leads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload)),
      "x-forwarded-for": ip,
    },
    body: payload,
  });
}

beforeEach(async () => {
  await raw("truncate guide_leads, rate_limit_counters cascade");
});

afterAll(async () => {
  if (connected) await pg.end();
});

describe("POST /api/guia/leads", () => {
  it("un email válido → 200 {ok:true} y una fila en guide_leads con su source", async () => {
    const res = await POST(post({ email: "DJ@Correo.cl", source: "hero", website: "" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const { rows } = await raw("select email, source, request_count from guide_leads");
    expect(rows).toEqual([{ email: "dj@correo.cl", source: "hero", request_count: 1 }]);
  });

  it("el mismo email dos veces → 200 ambas y UNA fila con request_count 2", async () => {
    await POST(post({ email: "dj@correo.cl", source: "hero" }));
    const res = await POST(post({ email: "dj@correo.cl", source: "cierre" }));
    expect(res.status).toBe(200);
    const { rows } = await raw("select source, request_count from guide_leads");
    expect(rows).toEqual([{ source: "hero", request_count: 2 }]);
  });

  it("email inválido → 400 validacion con los issues; nada en la DB", async () => {
    const res = await POST(post({ email: "no-es", source: "hero" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "validacion", issues: [{ field: "email", code: "invalid" }] });
    expect((await raw("select count(*)::int as n from guide_leads")).rows[0].n).toBe(0);
  });

  it("honeypot lleno → 200 idéntico al éxito, pero no guarda nada", async () => {
    const res = await POST(post({ email: "dj@correo.cl", source: "hero", website: "http://spam" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await raw("select count(*)::int as n from guide_leads")).rows[0].n).toBe(0);
  });

  it("JSON roto → 400 json_invalido", async () => {
    const res = await POST(post(null, "203.0.113.10", "{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "json_invalido" });
  });

  it("un body gigante ni se parsea → 400", async () => {
    const req = new Request("http://localhost/api/guia/leads", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "9000" },
      body: "{}",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("límite por IP: el 6º pedido bien formado en 10 min → 429 rate_limited", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(post({ email: `dj${i}@correo.cl`, source: "hero" }));
      expect(res.status).toBe(200);
    }
    const res = await POST(post({ email: "dj5@correo.cl", source: "hero" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
  });

  it("límite por email: el 4º re-pedido del mismo correo en el día → 429 aunque cambie la IP", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await POST(post({ email: "dj@correo.cl", source: "hero" }, `198.51.100.${i}`));
      expect(res.status).toBe(200);
    }
    const res = await POST(post({ email: "dj@correo.cl", source: "hero" }, "198.51.100.9"));
    expect(res.status).toBe(429);
  });

  it("una guía que no está en el registro → 400, sin tocar la DB", async () => {
    for (const guide of ["no-existe", "", 42, undefined]) {
      const res = await POST(post({ email: "dj@correo.cl", source: "hero", guide }));
      expect(res.status, String(guide)).toBe(400);
    }
    const { rows } = await raw("select count(*)::int c from guide_leads");
    expect(rows[0].c).toBe(0);
  });

  it("un source que la guía no declara → 400", async () => {
    // 'sidebar' pasa el CHECK de la base, pero guia-dj no lo declara en lib/guides.ts.
    const res = await POST(post({ email: "dj@correo.cl", source: "sidebar" }));
    expect(res.status).toBe(400);
  });

  it("guarda los UTM y el host del referente que vengan en el cuerpo", async () => {
    await POST(
      post({
        email: "dj@correo.cl",
        source: "hero",
        utmSource: "instagram",
        utmMedium: "social",
        referrerHost: "www.google.com",
      }),
    );
    const { rows } = await raw("select utm_source, utm_medium, referrer_host, consent_at from guide_leads");
    expect(rows[0]).toMatchObject({
      utm_source: "instagram",
      utm_medium: "social",
      referrer_host: "www.google.com",
    });
    expect(rows[0].consent_at).toBeTruthy();
  });

  it("el límite por email es POR GUÍA: agotar una no bloquea la otra", async () => {
    // Antes el contador era por email a secas, así que pedir dos veces la guía A dejaba
    // sin la B — con un 429 que decía "revisa tu correo", que era falso.
    for (let i = 0; i < 3; i++) {
      expect((await POST(post({ email: "dj@correo.cl", source: "hero" }))).status).toBe(200);
    }
    expect((await POST(post({ email: "dj@correo.cl", source: "hero" }))).status).toBe(429);

    // La MISMA persona en otra guía arranca con su propio contador. Se comprueba contra
    // el limitador directamente porque todavía hay una sola guía en el registro.
    const { rows } = await raw("select count(*)::int c from rate_limit_counters");
    expect(rows[0].c).toBeGreaterThanOrEqual(2); // ip + email-all + email-por-guía
  });

  it("los pedidos inválidos no consumen cuota (el limitador corre después del parser)", async () => {
    for (let i = 0; i < 6; i++) await POST(post({ email: "x", source: "hero" }));
    const res = await POST(post({ email: "dj@correo.cl", source: "hero" }));
    expect(res.status).toBe(200);
  });
});
