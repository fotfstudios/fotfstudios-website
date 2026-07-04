import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomerBooking,
  CustomerProfile,
  CustomerRepository,
  PointsEntryKind,
  PointsMovement,
} from "@/src/application/ports/customers";
import type { Database } from "./database.types";

/** Adaptador Supabase del perfil de cliente + ledger de puntos. */
export class SupabaseCustomerRepository implements CustomerRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async upsertCustomer(id: string, email: string): Promise<void> {
    const { error } = await this.db.from("customers").upsert({ id, email }, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  async awardRetroPoints(id: string): Promise<number> {
    const { data, error } = await this.db.rpc("award_retro_points", { p_customer: id });
    if (error) throw new Error(error.message);
    return data ?? 0;
  }

  async getProfile(id: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db
      .from("customers")
      .select("id, email, name, phone, points_balance")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { id: data.id, email: data.email, name: data.name, phone: data.phone, pointsBalance: data.points_balance };
  }

  async updateProfile(id: string, data: { name: string | null; phone: string | null }): Promise<void> {
    const { error } = await this.db
      .from("customers")
      .update({ name: data.name, phone: data.phone, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async movements(id: string, limit: number): Promise<PointsMovement[]> {
    const { data, error } = await this.db
      .from("points_ledger")
      .select("id, order_id, kind, amount, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      orderId: r.order_id,
      kind: r.kind as PointsEntryKind,
      amount: r.amount,
      createdAt: r.created_at,
    }));
  }

  async bookingsForEmail(email: string): Promise<CustomerBooking[]> {
    // El email histórico se guardó tal como lo tipearon → ilike para matchear
    // sin distinguir mayúsculas. Como ilike trata `_` como comodín, re-filtramos
    // exacto en minúsculas: por aquí no puede colarse una reserva ajena.
    const { data, error } = await this.db
      .from("reservations")
      .select("id, starts_at, ends_at, status, order_id, customer_email, orders(status, amount_clp, points_redeemed_clp)")
      .ilike("customer_email", email)
      .eq("kind", "booking")
      .order("starts_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((r) => r.customer_email?.toLowerCase() === email)
      .map((r) => ({
        id: r.id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        status: r.status as CustomerBooking["status"],
        orderId: r.order_id,
        orderStatus: r.orders?.status ?? null,
        amountClp: r.orders?.amount_clp ?? null,
        pointsRedeemedClp: r.orders?.points_redeemed_clp ?? 0,
      }));
  }
}
