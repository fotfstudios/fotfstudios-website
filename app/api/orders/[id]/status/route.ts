import { db } from "@/src/composition";

export const dynamic = "force-dynamic";

/** GET /api/orders/[id]/status → estado del pedido (para la página de retorno). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const { data } = await db()
      .from("orders")
      .select("status, amount_clp, currency")
      .eq("id", id)
      .single();
    if (!data) return Response.json({ error: "no encontrado" }, { status: 404 });
    return Response.json({ status: data.status, amount: data.amount_clp, currency: data.currency });
  } catch (e) {
    console.error("[order-status]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
