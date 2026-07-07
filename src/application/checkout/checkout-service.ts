import type { CheckoutLine, CheckoutRepository, Customer } from "@/src/application/ports/checkout";
import type { BookingQuoteInput, PricingService } from "@/src/application/pricing/pricing-service";
import { applyRedemption } from "@/src/domain/points/points";
import { orderLinesFromQuote } from "@/src/domain/pricing/order-lines";
import { err, ok, type Result } from "@/src/domain/shared/result";
import { MIN_LEAD_MINUTES } from "@/src/domain/scheduling/booking-rules";

export interface CreateBookingInput extends BookingQuoteInput {
  customer: Customer;
  /** Cuenta autenticada (requerida para canjear; el saldo lo valida la DB con row lock). */
  customerId?: string;
  pointsToRedeem?: number;
  /** Consentimiento T&C — lo asigna el borde: 'customer' (route /reservar) | 'staff' (admin). */
  termsSource?: "customer" | "staff";
  termsVersion?: string;
}

export interface CreateBookingResult {
  orderId: string;
  amount: number; // efectivo a cobrar por MP
  pointsApplied: number;
  paidWithPoints: boolean; // efectivo 0: ya confirmada, sin paso de pago
}

/** Orquesta el checkout: re-cotiza en servidor y persiste hold + pedido + líneas. */
export class CheckoutService {
  constructor(
    private readonly pricing: PricingService,
    private readonly repo: CheckoutRepository,
  ) {}

  async createBooking(
    input: CreateBookingInput,
    opts?: { enforceLeadTime?: boolean },
  ): Promise<Result<CreateBookingResult, string>> {
    const res = await this.pricing.quoteBooking(input);
    if (!res.ok) return err(res.error);
    const { quote, currency, startsAt, endsAt } = res.value;

    // Canje: sin sesión de cliente no hay puntos que gastar (el route ya lo
    // exige; esto es defensa en profundidad).
    if ((input.pointsToRedeem ?? 0) > 0 && !input.customerId) return err("points_session");
    const redemption = applyRedemption(quote, input.pointsToRedeem ?? 0);

    // Anticipación mínima: rechaza un horario ya pasado o demasiado próximo. El admin puede
    // eximir la ventana (enforceLeadTime:false) para walk-ins, pero el pasado sigue vetado.
    const lead = opts?.enforceLeadTime === false ? 0 : MIN_LEAD_MINUTES;
    if (new Date(startsAt).getTime() <= Date.now() + lead * 60_000) return err("too_soon");

    // Líneas de sala + add-ons + ajuste (volumen/redondeo). Extraído a dominio
    // para reutilizarlo desde el reagendamiento (misma forma de líneas).
    const lines: CheckoutLine[] = orderLinesFromQuote(quote);

    // Canje de puntos: descuento adicional para que las líneas sigan sumando el
    // EFECTIVO cobrado (amount_clp queda como "lo que cobra MP / cubre la boleta").
    if (redemption.pointsApplied > 0) {
      lines.push({
        line_type: "discount",
        description: "Canje de puntos",
        quantity: 1,
        unit_price_clp: -redemption.pointsApplied,
        subtotal_clp: -redemption.pointsApplied,
      });
    }

    try {
      const orderId = await this.repo.createCheckout({
        resourceId: input.resourceId,
        startsAt,
        endsAt,
        amount: redemption.cashTotal,
        net: redemption.cashNet,
        tax: redemption.cashTax,
        currency,
        customer: input.customer,
        snapshot: quote,
        lines,
        customerId: input.customerId,
        pointsRedeemed: redemption.pointsApplied,
        termsSource: input.termsSource,
        termsVersion: input.termsVersion,
      });
      return ok({
        orderId,
        amount: redemption.cashTotal,
        pointsApplied: redemption.pointsApplied,
        paidWithPoints: redemption.cashTotal === 0 && redemption.pointsApplied > 0,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/insufficient_points/i.test(msg)) return err("insufficient_points");
      if (/points_without_customer/i.test(msg)) return err("points_session");
      if (/exclusion|23P01|overlap|conflict/i.test(msg)) return err("slot_taken");
      return err(`checkout_failed: ${msg}`);
    }
  }
}
