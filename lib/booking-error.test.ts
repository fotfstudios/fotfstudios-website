import { describe, expect, it } from "vitest";
import { BOOKING_HORIZON_DAYS, MIN_LEAD_MINUTES } from "@/src/domain/scheduling/booking-rules";
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

  it("los rechazos del checkout público tienen copy propia (no 'no se pudo crear')", () => {
    for (const code of ["outside_hours", "too_far", "rate_limited", "transfer_limit"]) {
      expect(bookingErrorMessage(code)).not.toBe("No se pudo crear la reserva.");
    }
    expect(bookingErrorMessage("too_far")).toContain(`${BOOKING_HORIZON_DAYS} días`);
  });

  it("network → error de conexión", () => {
    expect(bookingErrorMessage("network")).toBe("Error de conexión. Intenta de nuevo.");
  });

  it("insufficient_points → saldo insuficiente", () => {
    expect(bookingErrorMessage("insufficient_points")).toBe(
      "No tienes Beatcoins suficientes para ese canje. Actualiza la página e intenta de nuevo.",
    );
  });

  it("terms_required → aceptar términos", () => {
    expect(bookingErrorMessage("terms_required")).toBe(
      "Debes aceptar los términos y condiciones para reservar.",
    );
  });

  it("points_session → sesión expirada", () => {
    expect(bookingErrorMessage("points_session")).toBe("Tu sesión expiró. Vuelve a entrar para usar tus Beatcoins.");
  });

  it("amount_changed → el total cambió: revisa el resumen (no 'no se pudo crear')", () => {
    const msg = bookingErrorMessage("amount_changed");
    expect(msg).toContain("total cambió");
    expect(msg).not.toBe("No se pudo crear la reserva.");
  });

  it("points_email_conflict → no manda a 'vuelve a entrar' (eso no lo arregla)", () => {
    const msg = bookingErrorMessage("points_email_conflict");
    expect(msg).not.toContain("Vuelve a entrar");
    expect(msg).toContain("WhatsApp");
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

describe("bookingErrorMessage: datos obligatorios", () => {
  it("nombre y celular tienen mensaje propio", () => {
    expect(bookingErrorMessage("name_required")).toMatch(/nombre/);
    expect(bookingErrorMessage("phone_invalid")).toMatch(/celular chileno/);
  });
});
