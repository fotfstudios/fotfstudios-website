/**
 * Mapeo puro código→mensaje del flujo de reserva (compartido por el botón
 * clásico y el Wallet Brick) + error tipado para que el código sobreviva la
 * cadena de promesas del brick. En `lib/` para que vitest lo cubra.
 */
import { MIN_LEAD_MINUTES } from "@/src/domain/scheduling/booking-rules";

export type BookingErrorCode = string | null | undefined;

export function bookingErrorMessage(code: BookingErrorCode): string {
  switch (code) {
    case "slot_taken":
      return "Ese horario se acaba de tomar. Elige otro.";
    case "too_soon":
      return `Reserva con al menos ${MIN_LEAD_MINUTES} min de anticipación. Elige otro horario.`;
    case "network":
      return "Error de conexión. Intenta de nuevo.";
    case "insufficient_points":
      return "No tienes puntos suficientes para ese canje. Actualiza la página e intenta de nuevo.";
    case "points_session":
      return "Tu sesión expiró. Vuelve a entrar para usar tus puntos.";
    default:
      return "No se pudo crear la reserva.";
  }
}

/** Error del request de reserva; `code` viaja hasta el catch (mensaje mapeable). */
export class BookingRequestError extends Error {
  constructor(public readonly code: BookingErrorCode) {
    super(code ?? "unknown");
    this.name = "BookingRequestError";
  }
}
