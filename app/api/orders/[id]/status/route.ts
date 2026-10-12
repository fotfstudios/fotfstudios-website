import { createHash } from "node:crypto";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { db, notificationService, rateLimiter, reconcileOrder } from "@/src/composition";
import { effectiveReservationStatus, type ReservationStatus } from "@/src/domain/scheduling/hold-expiry";

export const dynamic = "force-dynamic";

// Los order id son UUID (`gen_random_uuid()`). Validar la forma antes de tocar la DB acota la
// superficie de enumeración y evita disparar un reconcile de MP con un id basura: un id mal
// formado responde 404, igual que un pedido inexistente (no revela la diferencia).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderRow = { status: string; amount_clp: number; currency: string; transfer_requested_at: string | null };

async function readOrder(
  client: ReturnType<typeof db>,
  id: string,
): Promise<OrderRow | null> {
  const { data } = await client
    .from("orders")
    .select("status, amount_clp, currency, transfer_requested_at")
    .eq("id", id)
    .single();
  return (data as OrderRow | null) ?? null;
}

type ReservationRow = { status: ReservationStatus; expires_at: string | null };

/**
 * Tras vencer el hold seguimos consultando a MP un rato: un pago aprobado segundos después
 * del vencimiento debe volverse `paid_no_hold` YA — y el dueño se entera acá mismo (ver
 * `notifyPaymentNeedsReview` más abajo), no en el cron de la noche. Pasada la gracia, el
 * barrido diario (reconcilePending, 72 h) se hace cargo tanto de reconciliar como de avisar.
 */
const RECONCILE_GRACE_MS = 15 * 60_000;

/**
 * Antiabuso (auditoría 2026-10-12): cada sondeo de un pedido pendiente consulta a MP. La isla
 * hace ~72 sondeos en sus primeros 10 min (lib/estado-polling.ts); sobre el tope la ruta
 * sigue respondiendo desde la DB y solo se salta la consulta a MP — el sondeo nunca se rompe.
 */
const RECONCILE_RATE_MAX = 120;
const RECONCILE_RATE_WINDOW_S = 600;
const RATE_SALT = "fotf-order-status-v1";

/** ¿Puede esta IP disparar otra reconciliación contra MP? Fail-open. */
async function reconcileWithinRate(client: ReturnType<typeof db>, req: Request): Promise<boolean> {
  try {
    const ip = clientIpFromHeaders(req.headers) ?? "unknown";
    const key = "order-status:" + createHash("sha256").update(RATE_SALT + ip).digest("hex");
    return await rateLimiter(client).hit(key, RECONCILE_RATE_MAX, RECONCILE_RATE_WINDOW_S);
  } catch (e) {
    console.error("[order-status:ratelimit]", e);
    return true;
  }
}

async function readReservation(client: ReturnType<typeof db>, orderId: string): Promise<ReservationRow | null> {
  const { data } = await client
    .from("reservations")
    .select("status, expires_at")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  return (data as ReservationRow | null) ?? null;
}

/**
 * GET /api/orders/[id]/status → estado del pedido (para la página de retorno).
 *
 * Si el pedido sigue `pending_payment`, intenta **reconciliar bajo demanda** contra
 * Mercado Pago antes de responder: así la página confirma sola aunque el webhook no
 * haya llegado (clave en sandbox, donde MP no notifica pagos de prueba, y como red de
 * seguridad en prod). Idempotente: si ya está pagado, no hace nada.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "no encontrado" }, { status: 404 });
  try {
    const client = db();
    let row = await readOrder(client, id);
    if (!row) return Response.json({ error: "no encontrado" }, { status: 404 });

    const res = await readReservation(client, id);
    const reservation = res ? effectiveReservationStatus(res.status, res.expires_at) : null;
    const withinGrace = !res?.expires_at || Date.now() < Date.parse(res.expires_at) + RECONCILE_GRACE_MS;
    // Un pedido por transferencia no tiene pago en MP que reconciliar: lo confirma el dueño.
    const viaTransfer = Boolean(row.transfer_requested_at);
    if (
      row.status === "pending_payment" &&
      !viaTransfer &&
      (reservation !== "expired" || withinGrace) &&
      (await reconcileWithinRate(client, req))
    ) {
      try {
        const reconcileResult = await reconcileOrder(id, client);
        row = (await readOrder(client, id)) ?? row;
        // Si el sondeo reconcilia antes que el webhook, el webhook llega como duplicado y su
        // aviso nunca sale — los emails van aquí. `notifyOrder` es idempotente (notified_at),
        // así que si el webhook ganó, esto no duplica; y sin webhook (sandbox, o uno perdido
        // en prod) el cliente no espera al cron de la noche mientras la página le dice
        // "te enviamos un email".
        if (reconcileResult?.result === "paid") {
          await notificationService(client)
            .notifyOrder(id)
            .catch((e) => console.error("[order-status:email]", e));
        } else if (reconcileResult?.result === "paid_unreserved") {
          // Pagó pero el hold ya no existía: aviso al dueño, nunca confirmación al cliente.
          await notificationService(client)
            .notifyPaymentNeedsReview(id, reconcileResult.paymentId ?? "(sin id)")
            .catch((e) => console.error("[order-status:review]", e));
        }
      } catch (e) {
        console.error("[order-status:reconcile]", e);
      }
    }
    // Estado efectivo de la reserva + vencimiento: la isla deja de sondear cuando el hold
    // murió (H2/H4) en vez de seguir ofreciendo "Completar el pago" sobre una preference
    // que MP ya rechaza.
    return Response.json({
      status: row.status,
      amount: row.amount_clp,
      currency: row.currency,
      reservation,
      holdExpiresAt: res?.expires_at ?? null,
    });
  } catch (e) {
    console.error("[order-status]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
