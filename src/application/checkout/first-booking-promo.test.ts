import { afterEach, describe, expect, it, vi } from "vitest";
import type { FirstBookingPromoReader } from "@/src/application/ports/promos";
import { FirstBookingPromoService } from "./first-booking-promo";

const reader = (used: boolean): FirstBookingPromoReader => ({ used: vi.fn().mockResolvedValue(used) });

afterEach(() => vi.restoreAllMocks());

describe("FirstBookingPromoService.discountFor", () => {
  it("correo nuevo → la intención de descuento (20% sala · primera reserva)", async () => {
    const r = reader(false);
    const d = await new FirstBookingPromoService(r).discountFor("Nueva@Example.com");
    expect(d).toEqual({ target: { kind: "room" }, mode: "pct", value: 20, reason: "primera reserva" });
    // consulta con el email ya normalizado (la DB compara en minúsculas igual, pero el
    // reader recibe la forma canónica que queda en el pedido)
    expect(r.used).toHaveBeenCalledWith("nueva@example.com");
  });

  it("correo con reserva pagada → sin promo", async () => {
    expect(await new FirstBookingPromoService(reader(true)).discountFor("a@example.com")).toBeNull();
  });

  it.each(["", "  ", "no-es-un-correo", "a@b", null, undefined])(
    "email inválido (%j) → sin promo y sin tocar la DB (un pedido sin ficha sería 'primera' para siempre)",
    async (email) => {
      const r = reader(false);
      expect(await new FirstBookingPromoService(r).discountFor(email)).toBeNull();
      expect(r.used).not.toHaveBeenCalled();
    },
  );

  it("lector caído → degrada a 'sin promo' (nunca regala sin verificar) y lo registra", async () => {
    const boom: FirstBookingPromoReader = { used: vi.fn().mockRejectedValue(new Error("db down")) };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await new FirstBookingPromoService(boom).discountFor("a@example.com")).toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it("promo apagada → sin promo y sin consultar", async () => {
    const r = reader(false);
    const svc = new FirstBookingPromoService(r, { enabled: false, pct: 20, reason: "primera reserva" });
    expect(await svc.discountFor("a@example.com")).toBeNull();
    expect(r.used).not.toHaveBeenCalled();
  });
});
