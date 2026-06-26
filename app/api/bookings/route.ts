import { bookingEnabled, checkoutService, db, paymentService } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings → crea pedido + hold (atómico) y genera el link de pago de
 * Mercado Pago. Devuelve { orderId, initPoint }. Detrás del feature flag.
 */
export async function POST(req: Request): Promise<Response> {
  if (!bookingEnabled()) return Response.json({ error: "no disponible" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "json inválido" }, { status: 400 });
  }

  const b = (body ?? {}) as {
    resourceId?: string;
    date?: string;
    startMinute?: number;
    durationHours?: number;
    addonKeys?: string[];
    customer?: { name?: string; email?: string; phone?: string };
  };

  if (
    !b.resourceId ||
    !b.date ||
    typeof b.startMinute !== "number" ||
    typeof b.durationHours !== "number" ||
    !b.customer?.email
  ) {
    return Response.json({ error: "datos incompletos" }, { status: 400 });
  }

  try {
    const client = db();
    const booking = await checkoutService(client).createBooking({
      resourceId: b.resourceId,
      date: b.date,
      startMinute: b.startMinute,
      durationHours: b.durationHours,
      addonKeys: b.addonKeys,
      customer: b.customer,
    });
    if (!booking.ok) {
      return Response.json({ error: booking.error }, { status: booking.error === "slot_taken" ? 409 : 400 });
    }

    const pref = await paymentService(client).createPreferenceForOrder(booking.value.orderId);
    if (!pref.ok) return Response.json({ error: pref.error }, { status: 502 });

    return Response.json({ orderId: booking.value.orderId, initPoint: pref.value.initPoint });
  } catch (e) {
    console.error("[bookings]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
