import { createHash } from "node:crypto";
import { db, newsletterService, rateLimiter } from "@/src/composition";
import { parseNewsletterSubscribe } from "@/src/domain/newsletter/subscribe";
import { clientIpFromHeaders } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

// Antiabuso con clave hasheada (la DB nunca ve IP ni email en claro), sal propia = contador
// propio, separado del de guías y curso:
//  - por IP: 5 altas cada 10 min.
//  - por email: 3 al día — el tope que importa: acota cuántas bienvenidas puede disparar
//    alguien hacia una casilla ajena (la bienvenida solo sale en alta o re-alta, pero una
//    baja + re-alta en bucle la volvería a mandar).
const IP_MAX = 5;
const IP_WINDOW_S = 600;
const EMAIL_MAX = 3;
const EMAIL_WINDOW_S = 86_400;
const SALT = "fotf-news-v1";

const hashed = (prefix: string, value: string): string =>
  prefix + createHash("sha256").update(SALT + value).digest("hex");

/**
 * POST /api/newsletter → suscribirse a los avisos de guías y posts nuevos.
 *
 * Valida con parseNewsletterSubscribe() (el mismo módulo que corre el formulario), limita
 * solo pedidos bien formados, guarda (idempotente por email) y manda la bienvenida
 * best-effort. El honeypot devuelve 200 idéntico al éxito.
 */
export async function POST(req: Request): Promise<Response> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 8_192) return Response.json({ error: "validacion" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "json_invalido" }, { status: 400 });
  }

  const parsed = parseNewsletterSubscribe(body);
  if (parsed.kind === "spam") return Response.json({ ok: true });
  if (parsed.kind === "invalid") {
    return Response.json({ error: "validacion", issues: parsed.issues }, { status: 400 });
  }

  const client = db();

  // Fail-open: un problema de DB en el limitador no debe bloquear a alguien legítimo.
  try {
    const ip = clientIpFromHeaders(req.headers) ?? "unknown";
    const limiter = rateLimiter(client);
    const ipOk = await limiter.hit(hashed("news-ip:", ip), IP_MAX, IP_WINDOW_S);
    if (!ipOk) return Response.json({ error: "rate_limited" }, { status: 429 });
    const emailOk = await limiter.hit(hashed("news-email:", parsed.value.email), EMAIL_MAX, EMAIL_WINDOW_S);
    if (!emailOk) return Response.json({ error: "rate_limited" }, { status: 429 });
  } catch (e) {
    console.error("[newsletter:ratelimit]", e);
  }

  try {
    await newsletterService(client).subscribe(parsed.value);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[newsletter]", e);
    return Response.json({ error: "no_disponible" }, { status: 503 });
  }
}
