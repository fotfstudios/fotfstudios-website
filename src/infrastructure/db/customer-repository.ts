import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomerBooking,
  CustomerProfile,
  CustomerRepository,
  EnsureCustomerResult,
  PointsEntryKind,
  PointsMovement,
} from "@/src/application/ports/customers";
import { escapeIlike } from "@/src/domain/admin/reservas-list";
import { customerDbErrorCode, isEnsureEmailConflict } from "@/src/domain/customers/customer-input";
import type { Database } from "./database.types";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

/** Columnas del perfil completo (una sola fuente para todas las consultas). */
const PROFILE_COLS = "id, auth_user_id, email, name, phone, points_balance, created_at";

function toProfile(r: Pick<CustomerRow, "id" | "auth_user_id" | "email" | "name" | "phone" | "points_balance" | "created_at">): CustomerProfile {
  return {
    id: r.id,
    authUserId: r.auth_user_id,
    email: r.email,
    name: r.name,
    phone: r.phone,
    pointsBalance: r.points_balance,
    createdAt: r.created_at,
  };
}

/** Mapea la fila de reserva (con su pedido) al shape del puerto. */
function toBooking(r: {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  order_id: string | null;
  orders: { status: string; amount_clp: number | null; points_redeemed_clp: number } | null;
}): CustomerBooking {
  return {
    id: r.id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status as CustomerBooking["status"],
    orderId: r.order_id,
    orderStatus: r.orders?.status ?? null,
    amountClp: r.orders?.amount_clp ?? null,
    pointsRedeemedClp: r.orders?.points_redeemed_clp ?? 0,
  };
}

const BOOKING_COLS =
  "id, starts_at, ends_at, status, order_id, customer_id, customer_email, orders(status, amount_clp, points_redeemed_clp)";

/**
 * Relanza el error de la DB con una SENTINELA estable como mensaje
 * (`email_taken`, `customer_has_account`, `customers_name_len`, …). La capa de
 * aplicación ramifica sobre ella y `customerDbErrorMessage` la traduce; nunca
 * viaja texto crudo de Postgres hacia un toast.
 */
function throwDbError(error: { code?: string | null; message: string }): never {
  const sentinel = customerDbErrorCode(error.code, null, error.message);
  throw new Error(sentinel === "unknown" ? error.message : sentinel);
}

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
    const { data, error } = await this.db.from("customers").select(PROFILE_COLS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProfile(data) : null;
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

  async findByAuthUser(userId: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db.from("customers").select(PROFILE_COLS).eq("auth_user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProfile(data) : null;
  }

  async bookingsForCustomer(customerId: string, email: string | null): Promise<CustomerBooking[]> {
    const lower = email?.trim().toLowerCase() ?? null;
    let query = this.db
      .from("reservations")
      .select(BOOKING_COLS)
      .eq("kind", "booking")
      .order("starts_at", { ascending: false })
      .limit(200);
    // El email histórico se guardó tal como lo tipearon → ilike; el re-filtro
    // exacto en JS es la frontera (ilike trata `_` como comodín).
    query = lower
      ? query.or(`customer_id.eq.${customerId},and(customer_id.is.null,customer_email.ilike.${escapeIlike(lower)})`)
      : query.eq("customer_id", customerId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((r) => r.customer_id === customerId || (r.customer_id === null && r.customer_email?.toLowerCase() === lower))
      .map(toBooking);
  }

  async ensureForAuthUser(userId: string, email: string): Promise<EnsureCustomerResult> {
    const { data, error } = await this.db.rpc("ensure_customer_for_user", { p_user: userId, p_email: email });
    if (error) {
      // El chequeo de email libre de la RPC no es serializable: una carrera
      // aflora como 23505 crudo en vez del literal. Misma condición.
      if (isEnsureEmailConflict(error)) return { kind: "email_conflict" };
      // Todo lo demás (incluido el 23505 de customers_auth_user_id_key) sale
      // como sentinela: por acá NO puede viajar texto crudo de Postgres.
      throwDbError(error);
    }
    return { kind: "ok", id: data as string };
  }

  async updateContact(
    customerId: string,
    d: { name: string | null; email: string | null; phone: string | null },
  ): Promise<void> {
    const { error } = await this.db.rpc("update_customer_contact", {
      p_customer: customerId,
      // El generador tipa los text params como `string`; la función SQL acepta
      // NULL (normaliza con nullif). El cast documenta el gap, no cambia runtime.
      p_name: d.name as unknown as string,
      p_email: d.email as unknown as string,
      p_phone: d.phone as unknown as string,
    });
    if (error) throwDbError(error);
  }
}
