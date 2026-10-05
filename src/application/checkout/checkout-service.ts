import type { CheckoutLine, CheckoutRepository, Customer } from "@/src/application/ports/checkout";
import type { BookingQuoteInput, PricingService } from "@/src/application/pricing/pricing-service";
import { applyRedemption } from "@/src/domain/points/points";
import { applyManualDiscount, type ManualDiscount, type ManualDiscountInput } from "@/src/domain/pricing/manual-discount";
import { orderLinesFromQuote, POINTS_LINE } from "@/src/domain/pricing/order-lines";
import { err, ok, type Result } from "@/src/domain/shared/result";
import { MIN_LEAD_MINUTES } from "@/src/domain/scheduling/booking-rules";
import { netFromGrossInclusive, taxFromGrossInclusive } from "@/src/domain/money/money";
import { rangeFor } from "@/src/domain/scheduling/time";

/** La prueba del Curso de DJ dura siempre 1 hora. */
export const TRIAL_HOURS = 1;
import type { FirstBookingPromoService } from "./first-booking-promo";

export interface CreateBookingInput extends BookingQuoteInput {
  customer: Customer;
  /** Cuenta autenticada (requerida para canjear; el saldo lo valida la DB con row lock). */
  customerId?: string;
  pointsToRedeem?: number;
  /**
   * Descuento digitado por el staff (reserva manual). Viaja como intención
   * (target/modo/valor), NUNCA como pesos: la base se resuelve contra el quote
   * del servidor. El checkout público jamás lo envía: su única rebaja es la
   * promo de primera reserva, que resuelve ESTE servicio (opts.firstBookingPromo)
   * y no el cliente.
   */
  manualDiscount?: ManualDiscountInput;
  /** Consentimiento T&C — lo asigna el borde: 'customer' (route /reservar) | 'staff' (admin). */
  termsSource?: "customer" | "staff";
  termsVersion?: string;
  /**
   * Total que el cliente VIO antes de pagar (efectivo tras descuentos y puntos).
   * Si el servidor calcula otro —la promo dejó de aplicar entre la vista previa y
   * el pago, cambió el price book— el pedido no se crea (`amount_changed`) y el
   * widget vuelve a cotizar. Solo lo manda el checkout público.
   */
  expectedAmount?: number;
}

/** Prueba del Curso de DJ: 1 h guiada a precio fijo (sin motor, extras, descuento ni puntos). */
export interface CreateTrialBookingInput {
  resourceId: string;
  date: string; // YYYY-MM-DD (local de la sala)
  startMinute: number;
  /** Precio fijo con IVA incluido (PRECIOS.prueba): lo pasa el borde, el dominio no lee lib/. */
  price: number;
  customer: Customer;
  /** Ficha obligatoria: el crédito de la prueba se emite al email de la ficha. */
  customerId: string;
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
    private readonly promo?: FirstBookingPromoService,
  ) {}

  /**
   * `firstBookingPromo`: el borde público opta a la promo de primera reserva; la
   * consola del admin no la pasa (ahí el staff decide con su DiscountPicker). Se
   * evalúa sobre `input.customer.email` — el mismo correo que queda en el pedido.
   */
  async createBooking(
    input: CreateBookingInput,
    opts?: { enforceLeadTime?: boolean; firmHold?: boolean; firstBookingPromo?: boolean },
  ): Promise<Result<CreateBookingResult, string>> {
    const res = await this.pricing.quoteBooking(input);
    if (!res.ok) return err(res.error);
    const { quote, currency, startsAt, endsAt } = res.value;

    // Descuento manual del admin: baja el total ANTES del canje, así los puntos
    // se gastan contra lo que realmente se cobra (y no se "pierden" sobre un
    // total que el descuento ya iba a bajar).
    let discount: ManualDiscount | null = null;
    if (input.manualDiscount) {
      const d = applyManualDiscount(quote, input.manualDiscount);
      if (!d.ok) return err(`discount:${d.error}`);
      discount = d.value;
    } else if (opts?.firstBookingPromo && this.promo) {
      // Promo automática: nunca junto al descuento manual. Un error de la
      // matemática acá (imposible con 20% de sala) no es del staff → sin promo.
      const promo = await this.promo.discountFor(input.customer.email);
      const d = promo ? applyManualDiscount(quote, promo) : null;
      if (d?.ok) discount = d.value;
    }
    const afterDiscount = discount
      ? { total: discount.cashTotal, net: discount.cashNet }
      : { total: quote.total, net: quote.net };

    // Canje: sin sesión de cliente no hay puntos que gastar (el route ya lo
    // exige; esto es defensa en profundidad).
    if ((input.pointsToRedeem ?? 0) > 0 && !input.customerId) return err("points_session");
    const redemption = applyRedemption(afterDiscount, input.pointsToRedeem ?? 0);

    // Anticipación mínima: rechaza un horario ya pasado o demasiado próximo. El admin puede
    // eximir la ventana (enforceLeadTime:false) para walk-ins, pero el pasado sigue vetado.
    const lead = opts?.enforceLeadTime === false ? 0 : MIN_LEAD_MINUTES;
    if (new Date(startsAt).getTime() <= Date.now() + lead * 60_000) return err("too_soon");

    // Lo que ves es lo que pagas: cualquier diferencia con el total mostrado aborta
    // ANTES de crear el hold (también hacia abajo — el cliente merece ver el nuevo total).
    if (input.expectedAmount !== undefined && input.expectedAmount !== redemption.cashTotal) {
      return err("amount_changed");
    }

    // Líneas de sala + add-ons + ajuste (volumen/redondeo). Extraído a dominio
    // para reutilizarlo desde el reagendamiento (misma forma de líneas).
    const lines: CheckoutLine[] = orderLinesFromQuote(quote);
    if (discount) {
      lines.push({
        line_type: "discount",
        description: discount.description,
        quantity: 1,
        unit_price_clp: -discount.amount,
        subtotal_clp: -discount.amount,
      });
    }

    // Canje de puntos: descuento adicional para que las líneas sigan sumando el
    // EFECTIVO cobrado (amount_clp queda como "lo que cobra MP / cubre la boleta").
    if (redemption.pointsApplied > 0) {
      lines.push({
        line_type: "discount",
        description: POINTS_LINE,
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
        // firmHold: reserva manual pendiente de pago (B1) → hold sin expiración.
        // Sin la opción (checkout del cliente), holdTtlMinutes queda undefined → 10 min.
        holdTtlMinutes: opts?.firmHold ? null : undefined,
      });
      return ok({
        orderId,
        amount: redemption.cashTotal,
        pointsApplied: redemption.pointsApplied,
        paidWithPoints: redemption.cashTotal === 0 && redemption.pointsApplied > 0,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // La ficha elegida ya no existe (carrera entre el picker y el guardado).
      if (/customer_not_found/i.test(msg)) return err("customer_not_found");
      // La ficha elegida no tiene email y el pedido cobra: sin email los puntos no resuelven
      // al cliente (ni ganan ni se revocan). Se arregla agregándole el email a la ficha.
      if (/customer_checkout_needs_email/i.test(msg)) return err("customer_checkout_needs_email");
      if (/insufficient_points/i.test(msg)) return err("insufficient_points");
      if (/points_without_customer/i.test(msg)) return err("points_session");
      if (/exclusion|23P01|overlap|conflict/i.test(msg)) return err("slot_taken");
      // Dos deadlocks seguidos (el adaptador ya reintentó uno): la única espera cíclica
      // posible en create_checkout es la de reservations_no_overlap contra otro checkout del
      // mismo slot, así que para el cliente es "horario tomado", no un error crudo de Postgres.
      if (/deadlock|40P01/i.test(msg)) return err("slot_taken");
      return err(`checkout_failed: ${msg}`);
    }
  }

  /**
   * Prueba del Curso de DJ (consola del admin). Precio fijo con IVA (venta de sala, igual
   * que las pruebas ya emitidas): sin motor de tarifas, extras, descuento ni puntos. Nace
   * como reserva `prueba` + pedido `trial`; al pagarse, confirm_payment emite el crédito.
   */
  async createTrialBooking(
    input: CreateTrialBookingInput,
    opts?: { firmHold?: boolean },
  ): Promise<Result<CreateBookingResult, string>> {
    const terms = await this.pricing.fixedPriceTerms(input.resourceId);
    if (!terms) return err("recurso sin tarifa activa");
    // Siempre 1 hora: es la definición de la prueba (decisión del dueño).
    const { startsAt, endsAt } = rangeFor(input.date, input.startMinute, TRIAL_HOURS, terms.timezone);
    // El admin puede agendar sobre la hora (walk-in), pero nunca en el pasado.
    if (new Date(startsAt).getTime() <= Date.now()) return err("too_soon");
    const lines: CheckoutLine[] = [
      {
        line_type: "room_time",
        description: "Sesión de prueba · Curso de DJ · 1 h",
        quantity: 1,
        unit_price_clp: input.price,
        subtotal_clp: input.price,
      },
    ];
    try {
      const orderId = await this.repo.createCheckout({
        resourceId: input.resourceId,
        startsAt,
        endsAt,
        amount: input.price,
        net: netFromGrossInclusive(input.price, terms.taxPct),
        tax: taxFromGrossInclusive(input.price, terms.taxPct),
        currency: terms.currency,
        customer: input.customer,
        snapshot: { trial: true, price: input.price },
        lines,
        customerId: input.customerId,
        termsSource: input.termsSource,
        termsVersion: input.termsVersion,
        holdTtlMinutes: opts?.firmHold ? null : undefined,
        orderKind: "trial",
      });
      return ok({ orderId, amount: input.price, pointsApplied: 0, paidWithPoints: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/customer_not_found/i.test(msg)) return err("customer_not_found");
      if (/customer_checkout_needs_email/i.test(msg)) return err("customer_checkout_needs_email");
      if (/exclusion|23P01|overlap|conflict|deadlock|40P01/i.test(msg)) return err("slot_taken");
      return err(`checkout_failed: ${msg}`);
    }
  }
}
