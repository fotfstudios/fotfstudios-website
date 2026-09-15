import type { PaymentGateway, PaymentRefundInfo, RefundResult } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";
import type { PendingRefundRow, RescheduleFinalizer, ReschedulePort } from "@/src/application/ports/reschedule";
import type { PaymentService } from "@/src/application/payment/payment-service";
import type { PricingService } from "@/src/application/pricing/pricing-service";
import { classifyReschedule } from "@/src/domain/scheduling/reschedule";
import { isSettledRefund, splitRefundAcrossPayments } from "@/src/domain/scheduling/refund-split";
import { rangeFor } from "@/src/domain/scheduling/time";
import { reschedulePolicy } from "@/src/domain/scheduling/cancellation-policy";
import { orderLinesFromQuote } from "@/src/domain/pricing/order-lines";
import { carryConcession } from "@/src/domain/pricing/manual-discount";
import { err, ok, type Result } from "@/src/domain/shared/result";

/**
 * Inbox compartido con el webhook: dedupe por `refund:{id}` (misma clave que RefundService).
 * `markRefunded` se usa solo cuando la fila ya no está pendiente (reserva cancelada entre
 * medio) y el reembolso es nuestro: se asienta sobre la orden cancelada en vez de perderse.
 */
export type RescheduleInbox = Pick<PaymentNotificationRepository, "recordEvent" | "markRefunded">;

/** Lo que el servicio necesita de la pasarela: crear un reembolso y consultar uno en vuelo. */
export type RescheduleGateway = Pick<PaymentGateway, "refundPayment" | "getRefund">;

/** Puerto + el asiento del delta de un cobro fallido (H9), que vive en el lado webhook del repo. */
export type RescheduleRepo = ReschedulePort & Pick<RescheduleFinalizer, "markChargeRefunded">;

/** Ventana de pago del cobro de reagendamiento (sin hold; el cliente ausente paga cuando puede). */
export const RESCHEDULE_CHARGE_TTL_MINUTES = 24 * 60;

export interface RescheduleInput {
  reservationId: string;
  date: string; // YYYY-MM-DD (local de la locación)
  startMinute: number;
  durationHours: number;
  createdBy?: string | null;
  now?: Date;
}

export type RescheduleOutcome =
  | { kind: "moved" }
  /**
   * `offlineAmount`: parte del delta asentada como devolución en mano (la hace el dueño).
   * 0 si todo salió por MP; igual a `amount` (con `offline: true`) si todo fue offline.
   */
  | { kind: "refunded"; amount: number; offline: boolean; offlineAmount: number }
  /**
   * La reserva YA se movió; el reembolso quedó pendiente: MP falló (`mp_error`) o lo dejó
   * en contingencia (`in_process` — también cuando otro emisor tiene el lease de la fila).
   * Se completa con `retryRefund` (admin) o el cron. `offlineAmount`: lo asentado en mano
   * EN ESTA PASADA antes de quedar pendiente (pedido mixto), para que el admin no lo pierda.
   */
  | { kind: "refund_pending"; rescheduleId: string; amount: number; reason: "mp_error" | "in_process"; offlineAmount: number }
  /** Raro: la reserva se canceló con el reembolso en vuelo — la plata se asentó sobre la orden cancelada. */
  | { kind: "refund_looped_back" }
  /**
   * MP aprobó un reembolso NUESTRO pero la fila ya no está pendiente y tampoco cancelada
   * (aplicada por otro id, o desapareció): no hay dónde asentarlo. Nunca se cancela nada por
   * esto — el dueño lo revisa en el panel de MP.
   */
  | { kind: "refund_unaccounted"; refundId: string; amount: number }
  /** Más caro: se creó el cobro del delta; la reserva se mueve cuando el cliente pague. */
  | {
      kind: "charge_pending";
      deltaOrderId: string;
      rescheduleId: string;
      initPoint: string;
      amount: number;
      newStartsAt: string;
      newEndsAt: string;
    };

/** Un `mp_payment_id` es reembolsable en MP si existe y no es un pago offline. */
function isRealMpPayment(id: string | null): id is string {
  return !!id && !id.startsWith("offline:");
}

/**
 * Un reembolso en vuelo que MP ya no va a aprobar: no existe, o quedó rechazado/anulado.
 * Cualquier otro estado se trata como "todavía en proceso" — clasificar mal hacia "muerto"
 * emite un reembolso NUEVO (clave salada), y si el viejo después se aprueba, se devolvió
 * dos veces; clasificar mal hacia "en proceso" solo demora un reintento.
 */
function isDeadRefund(r: PaymentRefundInfo | null): boolean {
  return !r || r.status === "rejected" || r.status === "cancelled";
}

/** Los asientos offline no pasan por MP ni por el inbox (la devolución física la hace el dueño). */
const OFFLINE_REFUND_ID = "offline:reschedule";

/**
 * Reagenda (admin) una reserva PAGADA a otro horario. Re-cotiza en servidor y,
 * según el delta contra la boleta viva: mueve sin plata (equal), mueve y devuelve el
 * delta en MP manteniendo el booking vivo (refund) o cobra el extra en diferido (charge).
 *
 * Orden money-safety del camino "más barato" (H1): MOVER primero (reschedule_down_move
 * abre una fila `pending_refund` y aborta limpio por GiST si el slot se tomó, SIN tocar
 * plata) → reembolso irreversible en MP → inbox (reclama el refund id para que el webhook
 * loopback no cancele el booking vivo) → ASENTAR por reembolso aprobado
 * (reschedule_settle_refund). Así la base nunca declara devuelto lo que MP no devolvió: si
 * MP falla o deja el reembolso en contingencia, la fila queda pendiente y `retryRefund`
 * (o el cron) la completa con la misma clave de idempotencia.
 */
export class RescheduleService {
  constructor(
    private readonly gateway: RescheduleGateway,
    private readonly pricing: PricingService,
    private readonly repo: RescheduleRepo,
    private readonly inbox: RescheduleInbox,
    private readonly payments: Pick<PaymentService, "createPreferenceForOrder">,
  ) {}

  async reschedule(input: RescheduleInput): Promise<Result<RescheduleOutcome, string>> {
    const now = input.now ?? new Date();

    const ctx = await this.repo.loadContext(input.reservationId);
    if (!ctx) return err("not_found");
    if (ctx.reservation.status !== "confirmed" || ctx.reservation.kind !== "booking") return err("not_active");
    // A lo más UN reagendamiento pendiente por reserva (cobro por pagar o reembolso
    // por asentar): cotizar/mover encima de esa fila la dejaría huérfana.
    if (ctx.pending) return err("reschedule_pending");

    // Cortesía (sin orden): movimiento puro de calendario — sin plata no hay
    // cotización, MP ni política de 12 h (misma flexibilidad que crearla). El
    // rango destino se arma con la tz de la sala; el GiST es la red anti-solape.
    if (!ctx.order) {
      const range = rangeFor(input.date, input.startMinute, input.durationHours, ctx.timezone);
      if (Date.parse(range.startsAt) <= now.getTime()) return err("target_past");
      await this.repo.moveCourtesy({ reservationId: ctx.reservation.id, ...range, note: null });
      return ok({ kind: "moved" });
    }

    if (ctx.order.status !== "paid") return err("not_paid");
    if (ctx.order.pointsRedeemedClp > 0) return err("points_order");
    if (!reschedulePolicy(ctx.reservation.startsAt, now).allowed) return err("too_late");

    const q = await this.pricing.quoteBooking({
      resourceId: ctx.reservation.resourceId,
      date: input.date,
      startMinute: input.startMinute,
      durationHours: input.durationHours,
      addonKeys: ctx.addonKeys,
    });
    if (!q.ok) return err(q.error);
    const { quote, startsAt, endsAt } = q.value;
    if (Date.parse(startsAt) <= now.getTime()) return err("target_past");

    // El motor solo sabe de price book: un descuento que decidió una persona no
    // sobrevive a la re-cotización por sí solo. Sin arrastrarlo, mover una reserva
    // con concesión al MISMO precio le pedía al cliente justo esos pesos de vuelta.
    const carried = carryConcession(quote, ctx.concessionClp, ctx.concessionLabel);
    const newTotal = carried ? carried.cashTotal : quote.total;

    const oldLive = ctx.order.amountClp - ctx.order.refundedAmountClp;
    const delta = classifyReschedule(oldLive, newTotal);
    const lines = orderLinesFromQuote(quote);
    if (carried) {
      lines.push({
        line_type: "discount",
        description: carried.description,
        quantity: 1,
        unit_price_clp: -carried.amount,
        subtotal_clp: -carried.amount,
      });
    }
    // El snapshot que se persiste es el del MOTOR (sin la concesión), igual que en
    // el checkout: así la concesión se vuelve a deducir de las líneas la próxima
    // vez que esta reserva se mueva.
    // Sin nota automática: la tabla `reschedules` es el registro (la línea de
    // tiempo del admin lo muestra); las notas quedan para el operador.
    const base = { reservationId: ctx.reservation.id, startsAt, endsAt, snapshot: quote, lines, note: null };

    if (delta.kind === "equal") {
      await this.repo.moveEqual(base);
      return ok({ kind: "moved" });
    }

    if (delta.kind === "refund") {
      // I2: MOVER primero. El GiST aborta acá si el slot se tomó en la carrera, sin
      // tocar plata; si pasa, la fila pending_refund ya dice cuánto se debe.
      const { rescheduleId } = await this.repo.moveDown({ ...base, refundAmount: delta.amount, createdBy: input.createdBy ?? null });
      // Se relee la fila en vez de armarla en memoria: es la MISMA entrada que usan
      // "Reintentar" y el cron, así el primer intento no es un camino aparte.
      const row = await this.repo.pendingRefundRow(rescheduleId);
      if (!row) return ok({ kind: "refund_looped_back" });
      return this.refundRemaining(row);
    }

    // delta.kind === "charge" — nuevo más caro: cobro diferido. Crea la orden de
    // delta + su preference; la reserva NO se mueve hasta que el cliente pague (el
    // webhook finaliza vía apply_reschedule_charge). Split del delta proporcional al
    // quote nuevo (mismo criterio que create_boleta_amount en la DB).
    // El reparto neto/IVA va contra el total EFECTIVO (ya con la concesión), que es
    // lo que respalda la boleta del delta; usar el del motor inflaría el neto.
    const netBase = carried ? carried.cashNet : quote.net;
    const totalBase = carried ? carried.cashTotal : quote.total;
    const deltaNet = Math.round((delta.amount * netBase) / totalBase);
    const deltaTax = delta.amount - deltaNet;
    const { rescheduleId, deltaOrderId } = await this.repo.createCharge({
      ...base,
      delta: delta.amount,
      deltaNet,
      deltaTax,
      createdBy: input.createdBy ?? null,
    });
    const pref = await this.payments.createPreferenceForOrder(deltaOrderId, {
      expiresInMinutes: RESCHEDULE_CHARGE_TTL_MINUTES,
    });
    if (!pref.ok) return err(pref.error);
    return ok({
      kind: "charge_pending",
      deltaOrderId,
      rescheduleId,
      initPoint: pref.value.initPoint,
      amount: delta.amount,
      newStartsAt: startsAt,
      newEndsAt: endsAt,
    });
  }

  /** Completa el reembolso de una fila `pending_refund` ("Reintentar" del admin o el cron). */
  async retryRefund(rescheduleId: string): Promise<Result<RescheduleOutcome, string>> {
    const row = await this.repo.pendingRefundRow(rescheduleId);
    if (!row) return err("noop");
    return this.refundRemaining(row);
  }

  /**
   * H9: el delta de un cobro que no se aplicó (slot tomado / reserva cancelada / link
   * anulado) se capturó en MP pero el webhook no logró devolverlo. Misma llamada que el
   * webhook (total, clave por defecto `refund:{pago}`) → MP dedupea si aquella sí salió.
   */
  async retryFailedChargeRefund(row: {
    rescheduleId: string;
    deltaOrderId: string;
    paymentId: string;
  }): Promise<"done" | "pending" | "failed"> {
    try {
      const r = await this.gateway.refundPayment(row.paymentId);
      // Solo `approved` se asienta; `in_process` lo asienta el loopback cuando MP lo apruebe.
      if (!isSettledRefund(r)) return "pending";
      await this.inbox.recordEvent(`refund:${r.id}`, "refund", r);
      await this.repo.markChargeRefunded(row.deltaOrderId, r.id);
      return "done";
    } catch (e) {
      console.error("[reschedule:charge-refund-retry]", e);
      return "failed";
    }
  }

  /** Anula el cobro pendiente de un reagendamiento, liberando la reserva para reagendar de nuevo. */
  async cancelPendingCharge(rescheduleId: string, createdBy: string | null): Promise<boolean> {
    return this.repo.cancelCharge(rescheduleId, createdBy);
  }

  /**
   * Reembolsa lo que falta de una fila pending_refund y asienta por reembolso aprobado.
   * Compartido por el primer intento, "Reintentar" y el cron: cada entrada lee la fila y
   * sigue desde donde quedó (in-flight, parcial o desde cero).
   */
  private async refundRemaining(row: PendingRefundRow): Promise<Result<RescheduleOutcome, string>> {
    // Lease de 5 min sobre la fila: admin ("Reintentar") y cron pueden entrar a la vez, y dos
    // emisores que reparten sobre snapshots distintos de boletas arman claves de idempotencia
    // distintas → MP devolvería dos veces. El que no toma el lease sale como "in_process":
    // para el admin es lo mismo que "otro está en eso, vuelve a intentar más tarde".
    if (!(await this.repo.claimRefundAttempt(row.rescheduleId))) {
      return ok({ kind: "refund_pending", rescheduleId: row.rescheduleId, amount: row.deltaClp, reason: "in_process", offlineAmount: 0 });
    }
    try {
      return await this.refundRemainingLeased(row);
    } finally {
      // Siempre se suelta: el lease solo serializa emisores concurrentes; un reembolso que
      // quedó en vuelo en MP tiene su propia marca (mp_refund_id). Best-effort: si fallara,
      // vence solo a los 5 min y no debe tapar el error real del intento.
      await this.repo.releaseRefundAttempt(row.rescheduleId).catch((e) => console.error("[reschedule:refund] release lease", e));
    }
  }

  private async refundRemainingLeased(row: PendingRefundRow): Promise<Result<RescheduleOutcome, string>> {
    // Lo asentado como offline EN ESTA PASADA: es la plata que el dueño devuelve en mano y el
    // admin debe ver aparte. (Lo offline de una pasada anterior lo trae la fila:
    // offlineSettledClp; la ficha lo muestra.)
    let offlineAmount = 0;
    const refunded = (offline: boolean): Result<RescheduleOutcome, string> =>
      ok({ kind: "refunded", amount: row.deltaClp, offline, offlineAmount });
    const pending = (reason: "mp_error" | "in_process"): Result<RescheduleOutcome, string> =>
      ok({ kind: "refund_pending", rescheduleId: row.rescheduleId, amount: row.deltaClp, reason, offlineAmount });

    // Un reembolso quedó en vuelo (in_process) en un intento anterior: antes de emitir
    // otro hay que saber en qué quedó, o se devuelve dos veces.
    let salt = "";
    // Marca en vuelo de un reembolso muerto: se conserva hasta que la re-emisión salada
    // RESPONDA. Si se borrara antes y MP lanzara, el próximo reintento ya no sabría del
    // rechazo y volvería a la clave sin sal (MP devolvería el reembolso muerto).
    let stale = false;
    const dropStale = async () => {
      if (!stale) return;
      await this.repo.markRefundInFlight(row.rescheduleId, null);
      stale = false;
    };
    if (row.inFlight) {
      const r = await this.gateway.getRefund(row.inFlight.paymentId, row.inFlight.refundId);
      if (r && isSettledRefund(r)) {
        const step = await this.settleOne(row, r.id, r.amount, offlineAmount);
        if (step === "applied") return refunded(false);
        if (step !== "partial") return step;
        // Quedó plata por devolver (multi-pago): releer para saber cuánto. Si la fila ya no
        // está pendiente es que el loopback la completó entre medio.
        const next = await this.repo.pendingRefundRow(row.rescheduleId);
        if (!next) return refunded(false);
        row = next;
        if (row.inFlight) await this.repo.markRefundInFlight(row.rescheduleId, null);
      } else if (isDeadRefund(r)) {
        // Rechazado/anulado/inexistente: clave NUEVA para el mismo intento (MP dedupea la
        // vieja y devolvería el reembolso muerto). La fila sigue apuntándole hasta que la
        // re-emisión responda (ver `stale`).
        salt = `:after:${row.inFlight.refundId}`;
        stale = true;
      } else {
        return pending("in_process");
      }
    }

    const remaining = row.deltaClp - row.settledClp;
    if (remaining <= 0) return refunded(false);
    // Reparto por-pago: un pedido encarecido tiene boletas de distintos pagos (original +
    // orden de delta); MP rechaza devolver a un pago más de lo que capturó.
    const splits = splitRefundAcrossPayments(await this.repo.backingBoletas(row.orderId), remaining);
    const offline = !splits.some((s) => isRealMpPayment(s.paymentId));

    // Se asienta split por split EN EL ORDEN de las boletas (más-antigua-primero), el mismo
    // en que reschedule_settle_refund las anula: cada asiento consume exactamente la boleta
    // de su pago. Saltarse la porción offline para asentarla después desalinea plata y NC,
    // y un reintento (que reparte de nuevo sobre las boletas vivas) devolvería dos veces.
    // Último asiento de la pasada: la fila debería quedar `applied` justo con la última cuota;
    // si queda antes (otro reembolso la completó entre medio) se corta — seguir emitiría plata
    // que ya no tiene dónde asentarse.
    let last: "applied" | "partial" | null = null;
    for (const [i, s] of splits.entries()) {
      let step: "applied" | "partial";
      if (!isRealMpPayment(s.paymentId)) {
        // Porción offline: sin MP ni inbox (la devolución física la hace el dueño); se
        // asienta directo. Un pedido tiene a lo más un pago offline → un solo asiento así.
        await dropStale();
        const r = await this.settleOne(row, OFFLINE_REFUND_ID, s.amount, offlineAmount);
        if (typeof r !== "string") return r;
        offlineAmount += s.amount;
        step = r;
      } else {
        let refund: RefundResult;
        try {
          // Clave por (pago, monto, fila): un reintento del MISMO intento la repite y MP
          // devuelve el mismo reembolso sin duplicar; el `salt` la renueva tras uno muerto.
          refund = await this.gateway.refundPayment(s.paymentId, s.amount, `refund:${s.paymentId}:${s.amount}:${row.rescheduleId}${salt}`);
        } catch (e) {
          // La reserva ya está movida; la plata queda pendiente y se reintenta con la misma
          // clave (y con la marca en vuelo intacta, si la había).
          console.error("[reschedule:refund]", e);
          return pending("mp_error");
        }
        if (!isSettledRefund(refund)) {
          // Contingencia MP: se recuerda el id en vuelo (reemplazando al muerto, si lo había)
          // y NO se sigue con el próximo split (si este se rechaza, el orden de las NC ya no
          // coincidiría con la plata).
          await this.repo.markRefundInFlight(row.rescheduleId, { paymentId: s.paymentId, refundId: refund.id });
          return pending("in_process");
        }
        await dropStale();
        const r = await this.settleOne(row, refund.id, refund.amount ?? s.amount, offlineAmount);
        if (typeof r !== "string") return r;
        step = r;
      }
      last = step;
      if (step === "applied" && i < splits.length - 1) {
        console.error("[reschedule:refund] fila aplicada antes de la última cuota", { rescheduleId: row.rescheduleId, split: i + 1, of: splits.length });
        break;
      }
    }
    // Observabilidad: la fila debería estar `applied` acá. Si la última cuota quedó `partial`
    // (duplicate del loopback o settled sin llegar al delta) se devuelve `refunded` igual —
    // la plata salió — pero queda rastro para revisar la fila.
    if (last !== "applied") {
      console.error("[reschedule:refund] última cuota no aplicó", { rescheduleId: row.rescheduleId, last, splits: splits.length });
    }
    return refunded(offline);
  }

  /**
   * Inbox-first + asiento de UN reembolso. `applied` = la fila quedó completa; `partial` =
   * falta plata (o el loopback ya asentó este split: `duplicate`); un Result corta el flujo.
   * `offlineAmount` es lo offline ya asentado en la pasada (para el outcome `refund_pending`).
   */
  private async settleOne(
    row: PendingRefundRow,
    refundId: string,
    amount: number,
    offlineAmount: number,
  ): Promise<"applied" | "partial" | Result<RescheduleOutcome, string>> {
    // Un "aprobado" sin monto (MP a veces no lo trae en GET refund → 0 en el adaptador) no se
    // puede asentar ni reclamar en el inbox: se deja en vuelo y el próximo reintento lo relee.
    if (!(amount > 0)) {
      console.error("[reschedule:refund] reembolso aprobado sin monto", { rescheduleId: row.rescheduleId, refundId });
      return ok({ kind: "refund_pending", rescheduleId: row.rescheduleId, amount: row.deltaClp, reason: "in_process", offlineAmount });
    }
    // Reclamar el inbox ANTES de asentar, para que el loopback de ESTE reembolso dedupee
    // en vez de cancelar el booking ya movido. Los asientos offline no tienen loopback.
    const offline = refundId.startsWith("offline:");
    const fresh = offline ? true : await this.inbox.recordEvent(`refund:${refundId}`, "refund", { id: refundId, amount });
    const res = await this.repo.settleRefund(row.rescheduleId, refundId, amount);
    if (res === "applied") return "applied";
    if (res === "settled" || res === "duplicate") return "partial";
    if (res === "cancelled") {
      // La reserva se canceló con el reembolso en vuelo. Si el reembolso es nuestro (fresco),
      // la plata igual salió: se asienta sobre la orden cancelada. Dependencia de orden: el
      // webhook también es inbox-first, así que un reembolso que el loopback ya procesó llega
      // acá SIEMPRE con `!fresh`. `mark_refunded` cancela una reserva confirmada — solo es
      // correcto porque la RPC confirmó que la fila está CANCELADA; jamás por un loopback.
      if (fresh && !offline) await this.inbox.markRefunded(row.orderId, refundId, amount);
      return ok({ kind: "refund_looped_back" });
    }
    // noop: no hay nada que asentar (fila inexistente / aplicada por otro id / monto 0).
    // - Reembolso nuestro y fresco: MP devolvió plata que no calza con ninguna fila → NO se
    //   cancela nada (la reserva está viva); se avisa y el dueño lo mira en el panel de MP.
    // - No fresco (o offline, que no mueve plata en MP): el loopback ya completó la fila.
    if (fresh && !offline) {
      console.error("[reschedule:refund] reembolso aprobado sin fila pendiente", { rescheduleId: row.rescheduleId, refundId, amount });
      return ok({ kind: "refund_unaccounted", refundId, amount });
    }
    return "applied";
  }
}
