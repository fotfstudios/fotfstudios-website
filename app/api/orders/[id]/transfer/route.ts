import { createHash } from "node:crypto";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { db, notificationService, rateLimiter, transferRepository } from "@/src/composition";

export const dynamic = "force-dynamic";

// Mismo criterio que /status: un id mal formado responde 404 sin tocar la DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Antiabuso por IP (auditoría 2026-10-12): cada "Ya transferí" estira el cupo hasta 48 h y
// le manda un correo al dueño. La RPC es idempotente por pedido; esto acota la ráfaga.
const RATE_MAX = 10;
const RATE_WINDOW_S = 600;
const RATE_SALT = "fotf-transfer-declare-v1";

/**
 * POST /api/orders/[id]/transfer → el cliente avisa "Ya transferí" desde /reserva/estado.
 *
 * declare_transfer sostiene el cupo hasta min(ahora + 48 h, inicio) y el dueño recibe un
 * correo para verificar la transferencia y marcarla pagada. El id del pedido es la llave
 * (la misma que ya da acceso a /reserva/estado); la RPC es idempotente, así que un doble
 * clic o un reintento no duplica el aviso. NO va detrás de bookingEnabled(): como
 * /reserva/estado, sirve aunque el checkout se apague después de crear el pedido.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "no encontrado" }, { status: 404 });
  const client = db();
  try {
    const ip = clientIpFromHeaders(req.headers) ?? "unknown";
    const key = "transfer-declare:" + createHash("sha256").update(RATE_SALT + ip).digest("hex");
    if (!(await rateLimiter(client).hit(key, RATE_MAX, RATE_WINDOW_S))) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
  } catch (e) {
    // Fail-open: un problema del limitador no puede dejar a un cliente sin avisar su pago.
    console.error("[order-transfer:ratelimit]", e);
  }
  try {
    const result = await transferRepository(client).declare(id);
    if (result === "not_found" || result === "not_transfer") {
      return Response.json({ error: "no encontrado" }, { status: 404 });
    }
    if (result === "ok") {
      const { data: res } = await client.from("reservations").select("expires_at").eq("order_id", id).maybeSingle();
      if (res?.expires_at) {
        await notificationService(client)
          .notifyTransferDeclared(id, res.expires_at)
          .catch((e) => console.error("[order-transfer:owner-email]", e));
      }
      return Response.json({ result, holdUntil: res?.expires_at ?? null });
    }
    // already / not_pending / expired: la isla muestra el estado que corresponda.
    return Response.json({ result });
  } catch (e) {
    console.error("[order-transfer]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
