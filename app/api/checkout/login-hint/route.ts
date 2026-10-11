import { createHash } from "node:crypto";
import { accountEnabled } from "@/lib/flags";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { bookingEnabled, customerDirectory, db, rateLimiter } from "@/src/composition";
import { normalizeEmail } from "@/src/domain/contact/contact";
import { suggestsCheckoutLogin } from "@/src/domain/customers/checkout-login";

export const dynamic = "force-dynamic";

// Antiabuso por IP, igual que la promo de primera reserva: la respuesta dice algo de un
// correo ajeno, así que se limita antes de tocar la DB.
const RATE_MAX = 60;
const RATE_WINDOW_S = 600;
const RATE_SALT = "fotf-login-hint-v1";

function rateKey(ip: string): string {
  return "login-hint:" + createHash("sha256").update(RATE_SALT + ip).digest("hex");
}

/**
 * GET /api/checkout/login-hint?email= → { suggestLogin }. Para el invitado de /reservar:
 * si el correo tiene Beatcoins, el widget le ofrece entrar con código para usarlos (como
 * el "reconocimiento" de un checkout de e-commerce). Solo responde ese booleano.
 */
export async function GET(req: Request): Promise<Response> {
  if (!bookingEnabled()) return Response.json({ error: "no disponible" }, { status: 404 });
  const headers = { "cache-control": "private, no-store" };
  if (!accountEnabled()) return Response.json({ suggestLogin: false }, { headers });

  const email = normalizeEmail(new URL(req.url).searchParams.get("email") ?? "");
  if (!email) return Response.json({ suggestLogin: false }, { headers });
  const client = db();

  try {
    const ip = clientIpFromHeaders(req.headers) ?? "unknown";
    const allowed = await rateLimiter(client).hit(rateKey(ip), RATE_MAX, RATE_WINDOW_S);
    if (!allowed) return Response.json({ error: "rate_limited" }, { status: 429, headers });
  } catch (e) {
    // Fail-open: un problema del limitador no puede romper el checkout.
    console.error("[login-hint:ratelimit]", e);
  }

  try {
    const profile = await customerDirectory(client).findByEmail(email);
    return Response.json({ suggestLogin: suggestsCheckoutLogin(profile) }, { headers });
  } catch (e) {
    console.error("[login-hint]", e);
    return Response.json({ error: "no disponible" }, { status: 503, headers });
  }
}
