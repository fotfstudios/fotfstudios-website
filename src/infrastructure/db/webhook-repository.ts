import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfirmPaidStatus, PaymentNotificationRepository } from "@/src/application/ports/webhook";
import type { PaymentInfo } from "@/src/application/ports/payment";
import type { Database, Json } from "./database.types";

export class SupabaseWebhookRepository implements PaymentNotificationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async recordEvent(eventId: string, topic: string, payload: unknown): Promise<boolean> {
    const { error } = await this.db
      .from("webhook_events")
      .insert({ event_id: eventId, topic, payload: payload as Json });
    if (error) {
      if (error.code === "23505") return false; // unique_violation → duplicado
      throw new Error(error.message);
    }
    return true;
  }

  async getOrderAmount(orderId: string): Promise<number | null> {
    const { data } = await this.db.from("orders").select("amount_clp").eq("id", orderId).single();
    return data?.amount_clp ?? null;
  }

  async confirmPaid(orderId: string, payment: PaymentInfo): Promise<ConfirmPaidStatus> {
    const { data, error } = await this.db.rpc("confirm_payment", {
      p_order: orderId,
      p_payment_id: payment.id,
    });
    if (error) throw new Error(error.message);
    // Snapshot del pago (método/comisión/neto) para observabilidad en el admin.
    // Best-effort: no bloquea la confirmación si falla.
    await this.db
      .from("orders")
      .update({ payment_snapshot: paymentSnapshot(payment) })
      .eq("id", orderId);
    return data === "paid_no_hold" ? "paid_no_hold" : "confirmed";
  }

  async cancelUnpaid(orderId: string): Promise<void> {
    const { error } = await this.db.rpc("cancel_unpaid_order", { p_order: orderId });
    if (error) throw new Error(error.message);
  }

  async markRefunded(orderId: string, refundId?: string, amount?: number): Promise<void> {
    const { error } = await this.db.rpc("mark_refunded", {
      p_order: orderId,
      ...(refundId ? { p_refund_id: refundId } : {}),
      ...(amount != null ? { p_refund_amount: amount } : {}),
    });
    if (error) throw new Error(error.message);
  }
}

/** Campos del pago de MP que guardamos para mostrar en el admin (no todo el objeto). */
function paymentSnapshot(p: PaymentInfo): Json {
  return {
    payment_type_id: p.paymentTypeId ?? null,
    payment_method_id: p.paymentMethodId ?? null,
    card_last4: p.cardLast4 ?? null,
    installments: p.installments ?? null,
    gross_amount: p.amount ?? null,
    fee_amount: p.feeAmount ?? null,
    net_received_amount: p.netReceivedAmount ?? null,
    date_approved: p.dateApproved ?? null,
    payer_email: p.payerEmail ?? null,
    payer_name: p.payerName ?? null,
  };
}
