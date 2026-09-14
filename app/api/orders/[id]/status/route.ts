import { db, reconcileOrder } from "@/src/composition";
import { effectiveReservationStatus, type ReservationStatus } from "@/src/domain/scheduling/hold-expiry";

export const dynamic = "force-dynamic";

// Los order id son UUID (`gen_random_uuid()`). Validar la forma antes de tocar la DB acota la
// superficie de enumeración y evita disparar un reconcile de MP con un id basura: un id mal
// formado responde 404, igual que un pedido inexistente (no revela la diferencia).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderRow = { status: string; amount_clp: number; currency: string };

async function readOrder(
  client: ReturnType<typeof db>,
  id: string,
): Promise<OrderRow | null> {
  const { data } = await client
    .from("orders")
    .select("status, amount_clp, currency")
    .eq("id", id)
    .single();
  return (data as OrderRow | null) ?? null;
}

type ReservationRow = { status: ReservationStatus; expires_at: string | null };

/**
 * Tras vencer el hold seguimos consultando a MP un rato: un pago aprobado segundos después
 * del vencimiento debe volverse `paid_no_hold` YA (aviso al dueño), no en el cron de la noche.
 * Pasada la gracia, el barrido diario (reconcilePending, 72 h) se hace cargo.
 */
const RECONCILE_GRACE_MS = 15 * 60_000;

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
  _req: Request,
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
    if (row.status === "pending_payment" && (reservation !== "expired" || withinGrace)) {
      try {
        await reconcileOrder(id, client);
        row = (await readOrder(client, id)) ?? row;
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
