import {
  bookingEnabled,
  checkoutService,
  customerService,
  db,
  notificationService,
  paymentService,
} from "@/src/composition";
import { currentCustomer } from "@/src/infrastructure/auth/require-customer";
import { hostFromHeaders } from "@/lib/urls";
import { TERMS_VERSION } from "@/lib/site";
import { normalizeEmail, normalizePhone } from "@/src/domain/contact/contact";
import { CUSTOMER_CAPS } from "@/src/domain/customers/customer-input";

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
    termsAccepted?: boolean;
  };

  // `name` y `phone` son opcionales, pero si vienen tienen que ser strings: el
  // cuerpo abajo les llama métodos de string (trim/slice) y un número o un
  // objeto reventaría dentro del try → 503 donde corresponde un 400.
  const optionalString = (v: unknown): boolean => v === undefined || v === null || typeof v === "string";

  if (
    !b.resourceId ||
    !b.date ||
    typeof b.startMinute !== "number" ||
    typeof b.durationHours !== "number" ||
    typeof b.customer?.email !== "string" ||
    !b.customer.email ||
    !optionalString(b.customer.name) ||
    !optionalString(b.customer.phone)
  ) {
    return Response.json({ error: "datos incompletos" }, { status: 400 });
  }

  // Consentimiento T&C obligatorio para el flujo del cliente (backstop del gate de UI).
  if (b.termsAccepted !== true) {
    return Response.json({ error: "terms_required" }, { status: 400 });
  }

  try {
    const client = db();

    // Normalización de dominio: el email válido se guarda canónico (minúsculas)
    // y el teléfono en "+dígitos"; un email inválido NO bloquea la reserva (se
    // guarda tal como se tipeó y la reserva queda sin vincular, como hoy).
    const points = typeof b.pointsToRedeem === "number" ? Math.floor(b.pointsToRedeem) : 0;
    let customer: { name?: string; email?: string; phone?: string } = {
      name: b.customer.name?.trim().slice(0, CUSTOMER_CAPS.name) || undefined,
      email: normalizeEmail(b.customer.email) ?? b.customer.email.trim().slice(0, CUSTOMER_CAPS.email),
      phone: b.customer.phone
        ? (normalizePhone(b.customer.phone) ?? b.customer.phone.trim().slice(0, CUSTOMER_CAPS.phone))
        : undefined,
    };
    let customerId: string | undefined;

    // Canje de puntos: la identidad es SOLO la sesión (cookie verificada) — el
    // email del body se sobreescribe y el saldo lo valida el row lock en la DB.
    if (points > 0) {
      const session = await currentCustomer();
      if (!session) return Response.json({ error: "points_session" }, { status: 401 });
      const ensured = await customerService(client).ensureCustomer(session.userId, session.email);
      // Distinto de "sesión expirada": acá la sesión es válida, pero el email
      // ya es de otra ficha del directorio — volver a entrar no lo arregla.
      // Copy propia para no mandar a "vuelve a entrar" a alguien a quien
      // entrar de nuevo no le sirve de nada.
      if (ensured.kind !== "ok") return Response.json({ error: "points_email_conflict" }, { status: 409 });
      // El canje va contra la FICHA, nunca contra el usuario de auth: una ficha
      // adoptada del directorio tiene id ≠ session.userId y el row lock del
      // canje (p_customer_id) se toma sobre ella.
      customer = { ...customer, email: ensured.profile.email ?? session.email };
      customerId = ensured.profile.id;
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
      termsSource: "customer",
      termsVersion: TERMS_VERSION,
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

    const pref = await paymentService(client, hostFromHeaders(req.headers)).createPreferenceForOrder(
      booking.value.orderId,
    );
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
