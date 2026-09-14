import { createHash } from "node:crypto";
import { bookingEnabled, db, firstBookingPromo, rateLimiter } from "@/src/composition";
import { clientIpFromHeaders } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

// Antiabuso por IP: la respuesta revela si un correo ya reservó aquí, así que la
// consulta se limita antes de tocar la DB. 60 cada 10 min sobra para un cliente
// que escribe su correo (el widget consulta por cambio de correo, no de horario).
const RATE_MAX = 60;
const RATE_WINDOW_S = 600;
const RATE_SALT = "fotf-promo-v1";

function rateKey(ip: string): string {
  return "promo:" + createHash("sha256").update(RATE_SALT + ip).digest("hex");
}

/**
 * GET /api/promos/first-booking?email= → { eligible }. Previsualización de la
 * promo de primera reserva para el widget de /reservar. La verdad sigue siendo
 * el checkout (misma regla, mismo servicio): esto solo decide si mostrar la línea.
 * Sin promo activa, correo inválido o correo ya usado → eligible:false.
 */
export async function GET(req: Request): Promise<Response> {
  if (!bookingEnabled()) return Response.json({ error: "no disponible" }, { status: 404 });

  const email = new URL(req.url).searchParams.get("email") ?? "";
  const headers = { "cache-control": "private, no-store" };
  const client = db();

  // Fail-open: un problema del limitador no debe esconderle la promo a un cliente legítimo.
  try {
    const ip = clientIpFromHeaders(req.headers) ?? "unknown";
    const allowed = await rateLimiter(client).hit(rateKey(ip), RATE_MAX, RATE_WINDOW_S);
    if (!allowed) return Response.json({ error: "rate_limited" }, { status: 429, headers });
  } catch (e) {
    console.error("[promo:ratelimit]", e);
  }

  try {
    const eligible = (await firstBookingPromo(client).discountFor(email)) !== null;
    return Response.json({ eligible }, { headers });
  } catch (e) {
    console.error("[promo:first-booking]", e);
    return Response.json({ error: "no disponible" }, { status: 503, headers });
  }
}
