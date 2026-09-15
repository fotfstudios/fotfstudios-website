import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplyChargeOutcome,
  PendingRefundRow,
  ReschedulePort,
  RescheduleChargeParams,
  RescheduleContext,
  RescheduleFinalizer,
  RescheduleMoveDownParams,
  RescheduleMoveParams,
  SettleOutcome,
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
  // El índice único parcial (reschedules_one_pending_idx) es la red de la carrera que el
  // check de la RPC no alcanza a ver: mismo mensaje.
  if (/reschedule_pending_exists|reschedules_one_pending_idx/i.test(message))
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

    // Un reagendamiento pendiente (cobro por pagar o reembolso por asentar) bloquea uno
    // nuevo: el índice único parcial garantiza a lo más una fila.
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

  async moveDown(p: RescheduleMoveDownParams): Promise<{ rescheduleId: string }> {
    const { data, error } = await retryOnDeadlock(() =>
      this.db.rpc("reschedule_down_move", {
        p_reservation: p.reservationId,
        p_starts: p.startsAt,
        p_ends: p.endsAt,
        p_snapshot: p.snapshot as unknown as Json,
        p_lines: p.lines as unknown as Json,
        p_refund_amount: p.refundAmount,
        p_note: p.note ?? undefined,
        p_created_by: p.createdBy ?? undefined,
      }),
    );
    if (error) throw new Error(rescheduleError(error.message));
    if (!data) throw new Error("No se pudo abrir el reembolso de reagendamiento.");
    return { rescheduleId: data };
  }

  async settleRefund(rescheduleId: string, refundId: string, amount: number): Promise<SettleOutcome> {
    // Bloquea la fila + la orden y escribe tax_documents/points_ledger: puede deadlockear
    // contra el loopback del webhook que asienta el mismo reagendamiento; un reintento basta.
    const { data, error } = await retryOnDeadlock(() =>
      this.db.rpc("reschedule_settle_refund", {
        p_reschedule: rescheduleId,
        p_refund_id: refundId,
        p_amount: amount,
      }),
    );
    if (error) throw new Error(rescheduleError(error.message));
    // La RPC siempre devuelve un texto; un null es una respuesta rota, NO un "noop" (que el
    // servicio interpreta como "nada que asentar" y podría dejar plata sin registrar).
    if (!data) throw new Error("reschedule_settle_refund no devolvió resultado.");
    // El typegen tipa el retorno como `string`; el cast documenta el contrato real de la función SQL.
    return data as SettleOutcome;
  }

  async markRefundInFlight(rescheduleId: string, ref: { paymentId: string; refundId: string } | null): Promise<void> {
    // Solo sobre la fila pendiente: si el loopback la asentó entre medio (y limpió estas
    // columnas), no se le vuelve a colgar un reembolso ya aplicado.
    const { error } = await this.db
      .from("reschedules")
      .update({ mp_refund_id: ref?.refundId ?? null, mp_refund_payment_id: ref?.paymentId ?? null })
      .eq("id", rescheduleId)
      .eq("status", "pending_refund");
    if (error) throw new Error(rescheduleError(error.message));
  }

  async pendingRefundRow(rescheduleId: string): Promise<PendingRefundRow | null> {
    const { data, error } = await this.db
      .from("reschedules")
      .select("id, original_order_id, reservation_id, delta_clp, settled_clp, offline_settled_clp, mp_refund_id, mp_refund_payment_id")
      .eq("id", rescheduleId)
      .eq("status", "pending_refund")
      .maybeSingle();
    if (error) throw new Error(rescheduleError(error.message));
    if (!data?.original_order_id) return null;
    return {
      rescheduleId: data.id,
      orderId: data.original_order_id,
      reservationId: data.reservation_id,
      deltaClp: data.delta_clp,
      settledClp: data.settled_clp,
      offlineSettledClp: data.offline_settled_clp,
      inFlight:
        data.mp_refund_id && data.mp_refund_payment_id
          ? { paymentId: data.mp_refund_payment_id, refundId: data.mp_refund_id }
          : null,
    };
  }

  /** Ventana del lease: más que cualquier intento (varias llamadas a MP), menos que la paciencia del admin. */
  static readonly REFUND_LEASE_MINUTES = 5;

  async claimRefundAttempt(rescheduleId: string): Promise<boolean> {
    // UPDATE condicional atómico = el claim: solo toma la fila si sigue pendiente y nadie la
    // tiene (lease null) o el lease venció. El corte se calcula en JS (PostgREST no expresa
    // `now() - interval` en un filtro); una deriva de reloj de segundos entre app y DB solo
    // corre la ventana, no la rompe. `.select("id")` devuelve las filas tocadas: 1 = tomada.
    const cutoff = new Date(Date.now() - SupabaseRescheduleRepository.REFUND_LEASE_MINUTES * 60_000).toISOString();
    const { data, error } = await this.db
      .from("reschedules")
      .update({ refund_attempt_at: new Date().toISOString() })
      .eq("id", rescheduleId)
      .eq("status", "pending_refund")
      .or(`refund_attempt_at.is.null,refund_attempt_at.lt.${cutoff}`)
      .select("id");
    if (error) throw new Error(rescheduleError(error.message));
    return (data ?? []).length === 1;
  }

  async releaseRefundAttempt(rescheduleId: string): Promise<void> {
    const { error } = await this.db.from("reschedules").update({ refund_attempt_at: null }).eq("id", rescheduleId);
    if (error) throw new Error(rescheduleError(error.message));
  }

  async pendingRefundIds({ olderThanMinutes }: { olderThanMinutes: number }): Promise<string[]> {
    const { data, error } = await this.db
      .from("reschedules")
      .select("id")
      .eq("status", "pending_refund")
      .lt("created_at", new Date(Date.now() - olderThanMinutes * 60_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(rescheduleError(error.message));
    return (data ?? []).map((r) => r.id);
  }

  async unrefundedFailedCharges(): Promise<{ rescheduleId: string; deltaOrderId: string; paymentId: string }[]> {
    // Cobros cuyo delta se capturó en MP pero nunca se devolvió (MP falló o quedó
    // in_process en el webhook): la orden de delta sigue `paid` con un pago MP real.
    const { data, error } = await this.db
      .from("reschedules")
      .select("id, delta_order_id, orders!reschedules_delta_order_id_fkey(status, mp_payment_id)")
      .eq("kind", "charge")
      .in("status", ["failed_slot_taken", "cancelled", "expired"])
      .limit(50);
    if (error) throw new Error(rescheduleError(error.message));
    const out: { rescheduleId: string; deltaOrderId: string; paymentId: string }[] = [];
    for (const r of data ?? []) {
      const o = r.orders;
      if (!r.delta_order_id || o?.status !== "paid" || !o.mp_payment_id || o.mp_payment_id.startsWith("offline:")) continue;
      out.push({ rescheduleId: r.id, deltaOrderId: r.delta_order_id, paymentId: o.mp_payment_id });
    }
    return out;
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
    // `cancelled`/`expired`/`failed_slot_taken` entran también: un pago que llega tarde (el
    // cliente pagó justo cuando el link expiraba, o la reserva se canceló mientras el pago
    // viajaba) sigue siendo un cobro de reagendamiento — hay que encontrarlo para devolverlo,
    // no dejarlo caer al confirm normal (que no sabe qué es una orden de delta). Y el
    // reembolso del delta de un cobro FALLIDO (H9) vuelve por el webhook sobre esta misma
    // orden: sin `failed_slot_taken` acá, ese reembolso se leería como "no es cobro" y podría
    // asentarse sobre una fila pending_refund más nueva de la misma reserva.
    const { data, error } = await this.db
      .from("reschedules")
      .select("id, delta_order_id")
      .eq("delta_order_id", orderId)
      .in("status", ["pending_charge", "cancelled", "expired", "failed_slot_taken"])
      .maybeSingle();
    if (error) throw new Error(rescheduleError(error.message));
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

  async pendingRefundForOrder(orderId: string): Promise<{ rescheduleId: string; originalOrderId: string; remainingClp: number } | null> {
    // El reembolso de un reagendamiento puede caer sobre el pago original O sobre el de una
    // orden de delta (pedido encarecido antes); reservation_for_order resuelve ambos.
    const { data: reservationId, error: rpcError } = await this.db.rpc("reservation_for_order", { p_order: orderId });
    if (rpcError) throw new Error(rescheduleError(rpcError.message));
    if (!reservationId) return null;
    const { data, error } = await this.db
      .from("reschedules")
      .select("id, original_order_id, delta_clp, settled_clp")
      .eq("reservation_id", reservationId)
      .eq("status", "pending_refund")
      .maybeSingle();
    if (error) throw new Error(rescheduleError(error.message));
    return data?.original_order_id
      ? { rescheduleId: data.id, originalOrderId: data.original_order_id, remainingClp: data.delta_clp - data.settled_clp }
      : null;
  }
}
