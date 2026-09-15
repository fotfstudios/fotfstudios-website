import { createHash } from "node:crypto";
import { db, guideService, rateLimiter } from "@/src/composition";
import { parseGuideLead } from "@/src/domain/guide/lead";
import { clientIpFromHeaders } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

// Antiabuso en dos capas, ambas con clave hasheada (la DB nunca ve IP ni email en claro):
//  - por IP: 5 pedidos cada 10 min (mismo umbral que /curso-dj; sal propia = contador propio).
//  - por email: 3 pedidos al día. Un re-pedido legítimo ("no me llegó") pasa; bombardear
//    la casilla de un tercero rotando IPs, no.
const IP_MAX = 5;
const IP_WINDOW_S = 600;
const EMAIL_MAX = 3;
const EMAIL_WINDOW_S = 86_400;
const SALT = "fotf-guia-v1";

const hashed = (prefix: string, value: string): string =>
  prefix + createHash("sha256").update(SALT + value).digest("hex");

/**
 * POST /api/guia/leads → pedir la Guía de iniciación al DJing (PDF) por email.
 *
 * Valida con parseGuideLead() (el MISMO módulo que corre el formulario), aplica los
 * limitadores solo a pedidos bien formados, guarda/re-pide (idempotente por email) y
 * manda el correo con el link durable. El honeypot devuelve 200 idéntico al éxito.
 *
 * A diferencia de /curso-dj, un fallo del correo es 503: acá el correo ES la entrega.
 * El lead ya quedó guardado y reintentar manda el mismo link.
 */
export async function POST(req: Request): Promise<Response> {
  // Anti-abuso barato: un body gigante ni llega a JSON.parse (el cuerpo real es < 300 B).
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 8_192) return Response.json({ error: "validacion" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "json_invalido" }, { status: 400 });
  }

  const parsed = parseGuideLead(body);
  if (parsed.kind === "spam") return Response.json({ ok: true });
  if (parsed.kind === "invalid") {
    return Response.json({ error: "validacion", issues: parsed.issues }, { status: 400 });
  }

  const client = db();

  // Fail-open: un problema de DB en el limitador no debe bloquear a alguien legítimo.
  try {
    const ip = clientIpFromHeaders(req.headers) ?? "unknown";
    const limiter = rateLimiter(client);
    const ipOk = await limiter.hit(hashed("guia-leads:", ip), IP_MAX, IP_WINDOW_S);
    if (!ipOk) return Response.json({ error: "rate_limited" }, { status: 429 });
    const emailOk = await limiter.hit(hashed("guia-email:", parsed.value.email), EMAIL_MAX, EMAIL_WINDOW_S);
    if (!emailOk) return Response.json({ error: "rate_limited" }, { status: 429 });
  } catch (e) {
    console.error("[guia-leads:ratelimit]", e);
  }

  try {
    await guideService(client).request(parsed.value);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[guia-leads]", e);
    return Response.json({ error: "no_disponible" }, { status: 503 });
  }
}
