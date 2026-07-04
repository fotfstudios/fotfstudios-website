import { describe, expect, it } from "vitest";
import { MIN_LEAD_MINUTES } from "@/src/domain/scheduling/booking-rules";
import { BookingRequestError, bookingErrorMessage } from "./booking-error";

describe("bookingErrorMessage", () => {
  it("slot_taken → mensaje de horario tomado", () => {
    expect(bookingErrorMessage("slot_taken")).toBe("Ese horario se acaba de tomar. Elige otro.");
  });

  it("too_soon → interpola MIN_LEAD_MINUTES", () => {
    const msg = bookingErrorMessage("too_soon");
    expect(msg).toContain(`${MIN_LEAD_MINUTES} min`);
    expect(msg).toContain("anticipación");
  });

  it("network → error de conexión", () => {
    expect(bookingErrorMessage("network")).toBe("Error de conexión. Intenta de nuevo.");
  });

  it("insufficient_points → saldo insuficiente", () => {
    expect(bookingErrorMessage("insufficient_points")).toBe(
      "No tienes puntos suficientes para ese canje. Actualiza la página e intenta de nuevo.",
    );
  });

  it("points_session → sesión expirada", () => {
    expect(bookingErrorMessage("points_session")).toBe("Tu sesión expiró. Vuelve a entrar para usar tus puntos.");
  });

  it("desconocido, null o undefined → genérico", () => {
    expect(bookingErrorMessage("weird_code")).toBe("No se pudo crear la reserva.");
    expect(bookingErrorMessage(null)).toBe("No se pudo crear la reserva.");
    expect(bookingErrorMessage(undefined)).toBe("No se pudo crear la reserva.");
  });
});

describe("BookingRequestError", () => {
  it("conserva el código y es instancia de Error", () => {
    const e = new BookingRequestError("slot_taken");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("slot_taken");
  });

  it("código null → message 'unknown'", () => {
    expect(new BookingRequestError(null).message).toBe("unknown");
  });
});
