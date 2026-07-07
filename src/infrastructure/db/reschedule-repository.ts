import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReschedulePort,
  RescheduleChargeParams,
  RescheduleContext,
  RescheduleFinalizer,
  RescheduleMoveParams,
  RescheduleSettleDownParams,
} from "@/src/application/ports/reschedule";
import type { Database, Json } from "./database.types";

/** Traduce los errores de las RPC de reagendamiento a mensajes es-CL para el admin. */
function rescheduleError(message: string): string {
  if (/exclusion|23P01|overlap|reservations_no_overlap/i.test(message)) return "Ese horario ya está tomado.";
  if (/reschedule_not_active|reschedule_not_eligible/i.test(message))
    return "Esta reserva ya no se puede reagendar (debe estar pagada y activa).";
  if (/reschedule_bad_delta/i.test(message)) return "El monto del reembolso no corresponde al cambio.";
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
    if (r.order_id) {
      const { data: o } = await this.db
        .from("orders")
        .select("id, status, amount_clp, refunded_amount_clp, points_redeemed_clp, mp_payment_id")
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
        const { data: lines } = await this.db
          .from("order_lines")
          .select("addon_key")
          .eq("order_id", r.order_id)
          .not("addon_key", "is", null);
        addonKeys = (lines ?? []).map((l) => l.addon_key).filter((k): k is string => !!k);
      }
    }

    return {
      reservation: { id: r.id, resourceId: r.resource_id, startsAt: r.starts_at, status: r.status, kind: r.kind },
      order,
      addonKeys,
      timezone,
    };
  }

  async moveCourtesy(p: { reservationId: string; startsAt: string; endsAt: string; note: string | null }): Promise<void> {
    const { error } = await this.db.rpc("reschedule_courtesy", {
      p_reservation: p.reservationId,
      p_starts: p.startsAt,
      p_ends: p.endsAt,
      p_note: p.note ?? undefined,
    });
    if (error) throw new Error(rescheduleError(error.message));
  }

  async moveEqual(p: RescheduleMoveParams): Promise<void> {
    const { error } = await this.db.rpc("reschedule_move", {
      p_reservation: p.reservationId,
      p_starts: p.startsAt,
      p_ends: p.endsAt,
      p_snapshot: p.snapshot as unknown as Json,
      p_lines: p.lines as unknown as Json,
      p_note: p.note ?? undefined,
    });
    if (error) throw new Error(rescheduleError(error.message));
  }

  async settleDown(p: RescheduleSettleDownParams): Promise<void> {
    const { error } = await this.db.rpc("reschedule_down", {
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
    });
    if (error) throw new Error(rescheduleError(error.message));
  }

  async setRefundId(orderId: string, refundId: string): Promise<void> {
    const { error } = await this.db.from("orders").update({ mp_refund_id: refundId }).eq("id", orderId);
    if (error) throw new Error(rescheduleError(error.message));
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

  // ── RescheduleFinalizer (webhook) ──
  async pendingChargeForOrder(orderId: string): Promise<{ deltaOrderId: string; rescheduleId: string } | null> {
    const { data } = await this.db
      .from("reschedules")
      .select("id, delta_order_id")
      .eq("delta_order_id", orderId)
      .eq("status", "pending_charge")
      .maybeSingle();
    if (!data?.delta_order_id) return null;
    return { deltaOrderId: data.delta_order_id, rescheduleId: data.id };
  }

  async applyCharge(deltaOrderId: string, paymentId: string): Promise<"applied" | "slot_taken" | "noop"> {
    const { data, error } = await this.db.rpc("apply_reschedule_charge", { p_delta_order: deltaOrderId, p_payment_id: paymentId });
    if (error) throw new Error(rescheduleError(error.message));
    return (data ?? "noop") as "applied" | "slot_taken" | "noop";
  }

  async markChargeRefunded(deltaOrderId: string, refundId: string): Promise<void> {
    const { error } = await this.db.rpc("mark_refunded", { p_order: deltaOrderId, p_refund_id: refundId });
    if (error) throw new Error(rescheduleError(error.message));
  }
}
