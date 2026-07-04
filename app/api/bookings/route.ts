import {
  bookingEnabled,
  checkoutService,
  customerService,
  db,
  notificationService,
  paymentService,
} from "@/src/composition";
import { currentCustomer } from "@/src/infrastructure/auth/require-customer";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings → crea pedido + hold (atómico) y genera el pago de Mercado
 * Pago. Devuelve { orderId, preferenceId, initPoint }: `preferenceId` para el
 * Wallet Brick (onSubmit) e `initPoint` para el redirect clásico (fallback).
 * Con `pointsToRedeem` (sesión requerida) el canje entra a la misma transacción;
 * si los puntos cubren todo, la reserva ya sale confirmada → { paidWithPoints }.
 * Detrás del feature flag.
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
    pointsToRedeem?: number;
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

    // Canje de puntos: la identidad es SOLO la sesión (cookie verificada) — el
    // email del body se sobreescribe y el saldo lo valida el row lock en la DB.
    const points = typeof b.pointsToRedeem === "number" ? Math.floor(b.pointsToRedeem) : 0;
    let customer = b.customer;
    let customerId: string | undefined;
    if (points > 0) {
      const session = await currentCustomer();
      if (!session) return Response.json({ error: "points_session" }, { status: 401 });
      await customerService(client).ensureCustomer(session.userId, session.email);
      customer = { ...b.customer, email: session.email };
      customerId = session.userId;
    }

    const booking = await checkoutService(client).createBooking({
      resourceId: b.resourceId,
      date: b.date,
      startMinute: b.startMinute,
      durationHours: b.durationHours,
      addonKeys: b.addonKeys,
      customer,
      customerId,
      pointsToRedeem: points,
    });
    if (!booking.ok) {
      const status =
        booking.error === "slot_taken" ? 409 : booking.error === "points_session" ? 401 : 400;
      return Response.json({ error: booking.error }, { status });
    }

    // 100% puntos: no hay nada que cobrar — la reserva ya quedó confirmada en la
    // misma transacción. Email best-effort (el cron de notificaciones es respaldo).
    if (booking.value.paidWithPoints) {
      await notificationService(client)
        .notifyOrder(booking.value.orderId)
        .catch((e) => console.error("[bookings:points-email]", e));
      return Response.json({
        orderId: booking.value.orderId,
        paidWithPoints: true,
        pointsApplied: booking.value.pointsApplied,
      });
    }

    const pref = await paymentService(client).createPreferenceForOrder(booking.value.orderId);
    if (!pref.ok) return Response.json({ error: pref.error }, { status: 502 });

    return Response.json({
      orderId: booking.value.orderId,
      preferenceId: pref.value.preferenceId,
      initPoint: pref.value.initPoint,
      pointsApplied: booking.value.pointsApplied,
    });
  } catch (e) {
    console.error("[bookings]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
