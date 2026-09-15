import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplyChargeOutcome,
  ReschedulePort,
  RescheduleChargeParams,
  RescheduleContext,
  RescheduleFinalizer,
  RescheduleMoveParams,
  RescheduleSettleDownParams,
} from "@/src/application/ports/reschedule";
import type { BackingBoleta } from "@/src/domain/scheduling/refund-split";
import { concessionFromLines, type CarriedConcession } from "@/src/domain/pricing/order-lines";
import { snapshotQuote } from "./pricing-snapshot";
import { retryOnDeadlock } from "./rpc-retry";
import type { Database, Json } from "./database.types";

/** Traduce los errores de las RPC de reagendamiento a mensajes es-CL para el admin. */
function rescheduleError(message: string): string {
  if (/exclusion|23P01|overlap|reservations_no_overlap/i.test(message)) return "Ese horario ya está tomado.";
  // Segundo 40P01 seguido (el primero ya se reintentó en el adaptador): el slot sigue en
  // disputa con otra transacción; para el admin es lo mismo que tomado.
  if (/deadlock|40P01/i.test(message)) return "Ese horario ya está tomado.";
  if (/reschedule_not_active|reschedule_not_eligible/i.test(message))
    return "Esta reserva ya no se puede reagendar (debe estar pagada y activa).";
  if (/reschedule_bad_delta/i.test(message)) return "El monto del reembolso no corresponde al cambio.";
  if (/reschedule_pending_exists/i.test(message))
    return "Hay un reagendamiento pendiente en esta reserva. Anúlalo o espera a que se pague antes de mover la sesión.";
  return message;
}

export class SupabaseRescheduleRepository implements ReschedulePort, RescheduleFinalizer {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async loadContext(reservationId: string): Promise<RescheduleContext | null> {
    const { data: r } = await this.db
      .from("reservations")
      .select("id, resource_id, starts_at, status, kind, order_id, resources(locations(timezone))")
      .eq("id", reservationId)
      .single();
    if (!r) return null;
    const timezone = r.resources?.locations?.timezone ?? "America/Santiago";

    let order: RescheduleContext["order"] = null;
    let addonKeys: string[] = [];
    let concession: CarriedConcession = { amount: 0, description: "" };
    if (r.order_id) {
      const { data: o } = await this.db
        .from("orders")
        .select("id, status, amount_clp, refunded_amount_clp, points_redeemed_clp, mp_payment_id, pricing_snapshot")
        .eq("id", r.order_id)
        .single();
      if (o) {
        order = {
          id: o.id,
          status: o.status,
          amountClp: o.amount_clp,
          refundedAmountClp: o.refunded_amount_clp ?? 0,
          pointsRedeemedClp: o.points_redeemed_clp ?? 0,
          mpPaymentId: o.mp_payment_id,
        };
        // Se leen TODAS las líneas (no solo las que traen addon_key): las de
        // descuento son las que guardan la concesión del staff, y filtrarlas en
        // la consulta era justamente lo que la hacía desaparecer al reagendar.
        const { data: lines } = await this.db
          .from("order_lines")
          .select("line_type, addon_key, description, subtotal_clp")
          .eq("order_id", r.order_id);
        addonKeys = (lines ?? []).map((l) => l.addon_key).filter((k): k is string => !!k);
        concession = concessionFromLines(lines ?? [], snapshotQuote(o.pricing_snapshot));
      }
    }

    // Al menos un reagendamiento pendiente (cobro por pagar, o —futuro— reembolso por
    // asentar) bloquea uno nuevo: el índice único parcial garantiza a lo más una fila.
    const { data: p } = await this.db
      .from("reschedules")
      .select("id, kind, delta_order_id, delta_clp, new_starts_at, new_ends_at, status")
      .eq("reservation_id", reservationId)
      .in("status", ["pending_charge", "pending_refund"])
      .maybeSingle();
    const pending = p
      ? {
          kind: p.status === "pending_charge" ? ("charge" as const) : ("refund" as const),
          rescheduleId: p.id,
          deltaOrderId: p.delta_order_id,
          amountClp: p.delta_clp,
          newStartsAt: p.new_starts_at,
          newEndsAt: p.new_ends_at,
        }
      : null;

    return {
      reservation: { id: r.id, resourceId: r.resource_id, startsAt: r.starts_at, status: r.status, kind: r.kind },
      order,
      addonKeys,
      concessionClp: concession.amount,
      concessionLabel: concession.description,
      timezone,
      pending,
    };
  }

  async moveCourtesy(p: { reservationId: string; startsAt: string; endsAt: string; note: string | null }): Promise<void> {
    // Mueve el rango de la reserva → puede deadlockear contra otro escritor del mismo slot
    // al verificar reservations_no_overlap; un reintento basta (rpc-retry.ts). Ídem abajo.
    const { error } = await retryOnDeadlock(() =>
      this.db.rpc("reschedule_courtesy", {
        p_reservation: p.reservationId,
        p_starts: p.startsAt,
        p_ends: p.endsAt,
        p_note: p.note ?? undefined,
      }),
    );
    if (error) throw new Error(rescheduleError(error.message));
  }

  async moveEqual(p: RescheduleMoveParams): Promise<void> {
    const { error } = await retryOnDeadlock(() =>
      this.db.rpc("reschedule_move", {
        p_reservation: p.reservationId,
        p_starts: p.startsAt,
        p_ends: p.endsAt,
        p_snapshot: p.snapshot as unknown as Json,
        p_lines: p.lines as unknown as Json,
        p_note: p.note ?? undefined,
      }),
    );
    if (error) throw new Error(rescheduleError(error.message));
  }

  async settleDown(p: RescheduleSettleDownParams): Promise<void> {
    const { error } = await retryOnDeadlock(() =>
      this.db.rpc("reschedule_down", {
        p_reservation: p.reservationId,
        p_starts: p.startsAt,
        p_ends: p.endsAt,
        p_snapshot: p.snapshot as unknown as Json,
        p_lines: p.lines as unknown as Json,
        // El SQL (`reschedule_down`, p_refund_id text) acepta NULL vía coalesce; el
        // typegen de Supabase no modela nullabilidad de argumentos de función.
        p_refund_id: p.refundId as string,
        p_refund_amount: p.refundAmount,
        p_note: p.note ?? undefined,
      }),
    );
    if (error) throw new Error(rescheduleError(error.message));
  }

  async setRefundId(orderId: string, refundId: string): Promise<void> {
    const { error } = await this.db.from("orders").update({ mp_refund_id: refundId }).eq("id", orderId);
    if (error) throw new Error(rescheduleError(error.message));
  }

  async backingBoletas(orderId: string): Promise<BackingBoleta[]> {
    const { data, error } = await this.db.rpc("order_backing_boletas", { p_order: orderId });
    if (error) throw new Error(rescheduleError(error.message));
    return (data ?? []).map((r) => ({ liveAmount: r.live_amount, paymentId: r.payment_id }));
  }

  async createCharge(p: RescheduleChargeParams): Promise<{ rescheduleId: string; deltaOrderId: string }> {
    const { data, error } = await this.db.rpc("create_reschedule_charge", {
      p_reservation: p.reservationId,
      p_starts: p.startsAt,
      p_ends: p.endsAt,
      p_snapshot: p.snapshot as unknown as Json,
      p_lines: p.lines as unknown as Json,
      p_delta: p.delta,
      p_delta_net: p.deltaNet,
      p_delta_tax: p.deltaTax,
      p_created_by: p.createdBy ?? undefined,
    });
    if (error) throw new Error(rescheduleError(error.message));
    const row = data?.[0];
    if (!row) throw new Error("No se pudo crear el cobro de reagendamiento.");
    return { rescheduleId: row.reschedule_id, deltaOrderId: row.delta_order_id };
  }

  async cancelCharge(rescheduleId: string, createdBy: string | null): Promise<boolean> {
    const { data, error } = await this.db.rpc("cancel_reschedule_charge", {
      p_reschedule: rescheduleId,
      p_created_by: createdBy ?? undefined,
    });
    if (error) throw new Error(rescheduleError(error.message));
    return !!data;
  }

  // ── RescheduleFinalizer (webhook) ──
  async chargeForOrder(orderId: string): Promise<{ deltaOrderId: string; rescheduleId: string } | null> {
    // `cancelled`/`expired` entran también: un pago que llega tarde (el cliente pagó
    // justo cuando el link expiraba, o la reserva se canceló mientras el pago viajaba)
    // sigue siendo un cobro de reagendamiento — hay que encontrarlo para devolverlo,
    // no dejarlo caer al confirm normal (que no sabe qué es una orden de delta).
    const { data } = await this.db
      .from("reschedules")
      .select("id, delta_order_id")
      .eq("delta_order_id", orderId)
      .in("status", ["pending_charge", "cancelled", "expired"])
      .maybeSingle();
    if (!data?.delta_order_id) return null;
    return { deltaOrderId: data.delta_order_id, rescheduleId: data.id };
  }

  async applyCharge(deltaOrderId: string, paymentId: string): Promise<ApplyChargeOutcome> {
    // También mueve el rango (tras el pago del delta); la reintenta el webhook de MP igual,
    // pero acá se resuelve sin esperar ese ciclo.
    const { data, error } = await retryOnDeadlock(() =>
      this.db.rpc("apply_reschedule_charge", { p_delta_order: deltaOrderId, p_payment_id: paymentId }),
    );
    if (error) throw new Error(rescheduleError(error.message));
    // El typegen de Supabase todavía tipa el retorno de esta RPC como `string`
    // (regenerarlo no lo estrecha); el cast documenta el contrato real de la función SQL.
    return (data ?? "noop") as ApplyChargeOutcome;
  }

  async markChargeRefunded(deltaOrderId: string, refundId: string): Promise<void> {
    const { error } = await this.db.rpc("mark_refunded", { p_order: deltaOrderId, p_refund_id: refundId });
    if (error) throw new Error(rescheduleError(error.message));
  }
}
