import { createHash } from "node:crypto";
import { applicationRepository, db, notificationService, rateLimiter } from "@/src/composition";
import { parseApplication } from "@/src/domain/applications/application";
import { clientIpFromHeaders } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

// Antiabuso por IP: 5 postulaciones cada 10 min. La IP se hashea con sal antes de
// tocar la DB (nunca guardamos IPs crudas). Complementa —no reemplaza— al WAF de Vercel.
const RATE_MAX = 5;
const RATE_WINDOW_S = 600;
const RATE_SALT = "fotf-unete-v1";

function rateKey(ip: string): string {
  return "applications:" + createHash("sha256").update(RATE_SALT + ip).digest("hex");
}

/**
 * POST /api/applications → alta pública de una postulación de DJ (/unete).
 * Valida y normaliza con parseApplication() (mismo módulo que corre el form), aplica
 * rate limit por IP sobre las postulaciones bien formadas, inserta y dispara best-effort
 * el aviso al dueño + confirmación al postulante. El honeypot se descarta en silencio con
 * 200 (idéntico al éxito) para no delatar el filtro a los bots. Sin feature flag.
 */
export async function POST(req: Request): Promise<Response> {
  // Anti-abuso barato: un body gigante ni llega a JSON.parse (los campos suman < 2 KB).
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 8_192) return Response.json({ error: "validacion" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "json_invalido" }, { status: 400 });
  }

  const parsed = parseApplication(body);
  if (parsed.kind === "spam") return Response.json({ ok: true });
  if (parsed.kind === "invalid") {
    return Response.json({ error: "validacion", issues: parsed.issues }, { status: 400 });
  }

  const client = db();

  // Rate limit solo sobre postulaciones bien formadas (protege inserts + emails, que son
  // el costo real). Fail-open: un problema de DB no debe bloquear a un postulante legítimo.
  try {
    const ip = clientIpFromHeaders(req.headers) ?? "unknown";
    const allowed = await rateLimiter(client).hit(rateKey(ip), RATE_MAX, RATE_WINDOW_S);
    if (!allowed) return Response.json({ error: "rate_limited" }, { status: 429 });
  } catch (e) {
    console.error("[applications:ratelimit]", e);
  }

  try {
    await applicationRepository(client).createApplication(parsed.value);
    await notificationService(client)
      .notifyApplication(parsed.value)
      .catch((e) => console.error("[applications:email]", e));
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[applications]", e);
    return Response.json({ error: "no_disponible" }, { status: 503 });
  }
}
