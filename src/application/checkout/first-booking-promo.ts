import type { FirstBookingPromoReader } from "@/src/application/ports/promos";
import { normalizeEmail } from "@/src/domain/contact/contact";
import {
  FIRST_BOOKING_PROMO,
  firstBookingDiscountInput,
  type FirstBookingPromoConfig,
} from "@/src/domain/pricing/first-booking-promo";
import type { ManualDiscountInput } from "@/src/domain/pricing/manual-discount";

/**
 * Decide si un correo recibe la promo de primera reserva. Lo consultan el
 * checkout público (para aplicar la línea) y el endpoint de previsualización
 * (para mostrarla): una sola regla, dos lectores.
 *
 * Solo un email VÁLIDO puede calificar. El checkout público deja pasar un email
 * mal escrito (el pedido nace sin ficha, como siempre); si acá no se exigiera la
 * forma canónica, ese correo nunca tendría un pedido "pagado" a su nombre y
 * sería "primera reserva" cada vez.
 *
 * Si la DB falla, degrada a "sin promo" en vez de lanzar: nunca se regala sin
 * verificar. El guard de monto del checkout (`expectedAmount`) convierte esa
 * sorpresa en un 409 para el cliente, no en un cobro silencioso a precio lleno.
 */
export class FirstBookingPromoService {
  constructor(
    private readonly reader: FirstBookingPromoReader,
    private readonly promo: FirstBookingPromoConfig = FIRST_BOOKING_PROMO,
  ) {}

  /** null = sin promo (apagada, email inválido, ya usada, o lector caído). */
  async discountFor(email: string | null | undefined): Promise<ManualDiscountInput | null> {
    if (!this.promo.enabled) return null;
    const canonical = normalizeEmail(email);
    if (!canonical) return null;
    try {
      if (await this.reader.used(canonical)) return null;
    } catch (e) {
      console.error("[promo:first-booking]", e);
      return null;
    }
    return firstBookingDiscountInput(this.promo);
  }
}
