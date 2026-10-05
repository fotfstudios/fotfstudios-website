/**
 * La etiqueta "Pago" de una fila de /admin/reservas (puro, sin IO). Antes la lista
 * solo mostraba el estado de la RESERVA, así que una reserva manual pendiente de pago
 * se veía "En espera", igual que un checkout web abandonado a los 10 minutos.
 *
 * Responde una sola pregunta — ¿cómo está el cobro? — combinando lo que ya trae la
 * fila: tipo (bloqueo/curso no cobran), pedido, estado del pedido y método.
 */
import { manualHoldDeadline } from "@/src/domain/scheduling/manual-hold-deadline";
import { paymentMethodLabel } from "@/src/domain/money/payment-method";
import { isSellableSession } from "@/src/domain/scheduling/reservation-kind";

export type PaymentBadgeTone = "ok" | "pending" | "muted" | "alert";

export interface PaymentBadge {
  label: string;
  tone: PaymentBadgeTone;
  /** Solo pendiente manual: hasta cuándo hay que pagar (ISO). */
  dueAt?: string;
}

export interface PaymentBadgeInput {
  kind: string;
  status: string;
  startsAt: string;
  orderId: string | null;
  orderStatus: string | null;
  paymentMethod: string | null;
  /** Hold con vencimiento corto = checkout web en curso (el manual pendiente no vence solo). */
  expiresAt: string | null;
  /** Inicio del reloj de 72 h: creación de la orden o último link de pago. */
  paymentClockStart: string | null;
  rescheduleId: string | null;
  practiceEnrollmentId: string | null;
}

export function paymentBadge(b: PaymentBadgeInput, now: Date = new Date()): PaymentBadge | null {
  // Ni el bloqueo ni la sesión guiada del curso se cobran (la prueba sí).
  if (!isSellableSession(b.kind)) return null;
  if (!b.orderId) {
    if (b.practiceEnrollmentId) return { label: "Práctica del curso", tone: "muted" };
    if (b.rescheduleId) return { label: "Cupo de reagendamiento", tone: "muted" };
    return { label: "Cortesía", tone: "muted" };
  }
  switch (b.orderStatus) {
    case "paid":
    case "fulfilled": {
      const method = paymentMethodLabel(b.paymentMethod);
      return { label: method ? `Pagada · ${method}` : "Pagada", tone: "ok" };
    }
    case "refunded":
      return { label: "Reembolsada", tone: "muted" };
    case "pending_payment": {
      if (b.status === "cancelled" || b.status === "expired") return { label: "Sin pagar", tone: "muted" };
      // Checkout web: el hold de minutos vence solo, no hay plazo que prometer.
      if (b.expiresAt) return { label: "Pago en curso", tone: "pending" };
      const due = manualHoldDeadline(b.paymentClockStart ?? b.startsAt, b.startsAt, now);
      if (new Date(b.startsAt).getTime() <= now.getTime()) {
        return { label: "Pago vencido", tone: "alert" };
      }
      return { label: "Pago pendiente", tone: "pending", dueAt: due.toISOString() };
    }
    case "cancelled":
      return { label: "Sin pagar", tone: "muted" };
    default:
      return null;
  }
}
