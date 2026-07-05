import { db, reconcileOrder } from "@/src/composition";

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

    if (row.status === "pending_payment") {
      try {
        await reconcileOrder(id, client);
        row = (await readOrder(client, id)) ?? row;
      } catch (e) {
        console.error("[order-status:reconcile]", e);
      }
    }

    return Response.json({ status: row.status, amount: row.amount_clp, currency: row.currency });
  } catch (e) {
    console.error("[order-status]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
