import type { CheckoutLine, CheckoutRepository, Customer } from "@/src/application/ports/checkout";
import type { BookingQuoteInput, PricingService } from "@/src/application/pricing/pricing-service";
import { err, ok, type Result } from "@/src/domain/shared/result";

export interface CreateBookingInput extends BookingQuoteInput {
  customer: Customer;
}

/** Orquesta el checkout: re-cotiza en servidor y persiste hold + pedido + líneas. */
export class CheckoutService {
  constructor(
    private readonly pricing: PricingService,
    private readonly repo: CheckoutRepository,
  ) {}

  async createBooking(
    input: CreateBookingInput,
  ): Promise<Result<{ orderId: string; amount: number }, string>> {
    const res = await this.pricing.quoteBooking(input);
    if (!res.ok) return err(res.error);
    const { quote, currency, startsAt, endsAt } = res.value;

    // No se puede reservar un horario que ya empezó (cliente con datos viejos).
    if (new Date(startsAt).getTime() <= Date.now()) return err("slot_in_past");

    const lines: CheckoutLine[] = [
      ...quote.tierLines.map((l) => ({
        line_type: "room_time" as const,
        description: `Sala · ${l.hours}h (${l.key})`,
        quantity: l.hours,
        unit_price_clp: l.rate,
        subtotal_clp: l.subtotal,
      })),
      ...quote.addonLines.map((a) => ({
        line_type: "flat_service" as const,
        addon_key: a.key,
        description: a.name,
        quantity: 1,
        unit_price_clp: a.amount,
        subtotal_clp: a.amount,
      })),
    ];

    // Línea de ajuste/descuento: hace que las líneas SUMEN exactamente el total
    // cobrado (absorbe descuento por volumen + redondeo a $10).
    const gross = quote.tierLines.reduce((s, l) => s + l.subtotal, 0) + quote.addonsTotal;
    const adjust = quote.total - gross;
    if (adjust !== 0) {
      const label = quote.volumePct > 0 ? `Descuento por volumen (${Math.round(quote.volumePct * 100)}%)` : "Ajuste";
      lines.push({ line_type: "discount", description: label, quantity: 1, unit_price_clp: adjust, subtotal_clp: adjust });
    }

    try {
      const orderId = await this.repo.createCheckout({
        resourceId: input.resourceId,
        startsAt,
        endsAt,
        amount: quote.total,
        net: quote.net,
        tax: quote.tax,
        currency,
        customer: input.customer,
        snapshot: quote,
        lines,
      });
      return ok({ orderId, amount: quote.total });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/exclusion|23P01|overlap|conflict/i.test(msg)) return err("slot_taken");
      return err(`checkout_failed: ${msg}`);
    }
  }
}
