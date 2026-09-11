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
import { clientesOrdenSpec, type ClientesListQuery } from "@/src/domain/admin/clientes-list";
import { customerSearchNeedle } from "@/src/domain/customers/customer-input";
import { CUSTOMER_GENERIC_DB_ERROR, customerDbErrorCode, isEnsureEmailConflict } from "@/src/domain/customers/customer-input";
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
 * (`email_taken`, `customer_has_account`, `customers_name_len`, …), o con el
 * copy genérico compartido (`CUSTOMER_GENERIC_DB_ERROR`) cuando
 * `customerDbErrorCode` no reconoce nada (deadlock 40P01, timeout 57014, un
 * CHECK nuevo, conexión caída, …). Es el ÚNICO camino de error de la clase:
 * cada método de este adaptador pasa su `error` por acá, así que texto crudo
 * de Postgres jamás llega al `.message` que ve una persona — solo a `.cause`,
 * para logs. La capa de aplicación ramifica sobre el sentinela y
 * `customerDbErrorMessage` lo traduce.
 */
function throwDbError(error: { code?: string | null; message: string }): never {
  const sentinel = customerDbErrorCode(error.code, null, error.message);
  throw new Error(sentinel === "unknown" ? CUSTOMER_GENERIC_DB_ERROR : sentinel, { cause: error.message });
}

/** Adaptador Supabase del perfil de cliente + ledger de puntos. */
export class SupabaseCustomerRepository implements CustomerRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async awardRetroPoints(id: string): Promise<number> {
    const { data, error } = await this.db.rpc("award_retro_points", { p_customer: id });
    if (error) throwDbError(error);
    return data ?? 0;
  }

  async getProfile(id: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db.from("customers").select(PROFILE_COLS).eq("id", id).maybeSingle();
    if (error) throwDbError(error);
    return data ? toProfile(data) : null;
  }

  async movements(id: string, limit: number): Promise<PointsMovement[]> {
    const { data, error } = await this.db
      .from("points_ledger")
      .select("id, order_id, kind, amount, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwDbError(error);
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
      .select(BOOKING_COLS)
      .ilike("customer_email", email)
      .eq("kind", "booking")
      .order("starts_at", { ascending: false })
      .limit(200);
    if (error) throwDbError(error);
    return (data ?? []).filter((r) => r.customer_email?.toLowerCase() === email).map(toBooking);
  }

  async findByAuthUser(userId: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db.from("customers").select(PROFILE_COLS).eq("auth_user_id", userId).maybeSingle();
    if (error) throwDbError(error);
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
    if (error) throwDbError(error);
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
    // Toda ruta SQL de la función devuelve un uuid o lanza (nunca null sin error);
    // el guard hace explícito ese contrato en vez de forzarlo con un cast.
    if (!data) throwDbError({ code: null, message: "ensure_customer_for_user: id nulo sin error" });
    return { kind: "ok", id: data };
  }

  /**
   * Búsqueda del picker. Tres columnas en un solo `or`: nombre y email por
   * texto, teléfono por la columna GENERADA `phone_digits` (que ya viene sin
   * `+`, espacios ni guiones), así "9988" encuentra a quien guardó
   * "+56 9 9988 7766", y "pia" a "Pía" — el nombre se compara contra la columna
   * generada `name_norm` (minúsculas, sin diacríticos) y el término viene ya
   * normalizado igual por `customerSearchNeedle`. El email se guarda en
   * minúsculas y sin tildes válidas, así que se compara tal cual.
   *
   * `needle.text` YA VIENE ESCAPADO por `customerSearchNeedle` (que es donde el
   * tope de largo y el escape tienen que ir juntos, porque recortar después de
   * escapar puede partir un par `\%` al medio). Volver a escaparlo acá buscaría
   * los backslashes literalmente, así que se usa tal cual.
   *
   * Orden por `updated_at` desc: en una lista acotada a 8, lo más reciente es
   * casi siempre lo que el staff está buscando.
   */
  async search(needle: { text: string; digits: string | null }, limit: number): Promise<CustomerProfile[]> {
    // Un texto vacío haría `name.ilike.%%`, que matchea TODO. El servicio ya lo
    // corta antes, pero la defensa vive también acá: este método es público y
    // un caller nuevo no tiene por qué conocer esa trampa.
    const parts = needle.text.trim() ? [`name_norm.ilike.%${needle.text}%`, `email.ilike.%${needle.text}%`] : [];
    if (needle.digits) parts.push(`phone_digits.ilike.%${needle.digits}%`);
    if (parts.length === 0) return [];

    const { data, error } = await this.db
      .from("customers")
      .select(PROFILE_COLS)
      .or(parts.join(","))
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throwDbError(error);
    return (data ?? []).map(toProfile);
  }

  /**
   * Lista paginada: datos y conteos en una sola pasada, como `listBookings`.
   * `total` respeta la búsqueda; `grandTotal` no (distingue "sin clientes" de
   * "sin resultados"). Orden estable con desempate por `id`. Con `q` vacío
   * lista todo: acá el "vuelco del directorio" es la función, no un accidente.
   */
  async list(query: ClientesListQuery): Promise<{ rows: CustomerProfile[]; total: number; grandTotal: number }> {
    const from = (query.page - 1) * query.perPage;
    const orden = clientesOrdenSpec(query.orden);
    const needle = query.q ? customerSearchNeedle(query.q) : null;

    const orFilter =
      needle && (needle.text.trim() || needle.digits)
        ? [
            ...(needle.text.trim() ? [`name_norm.ilike.%${needle.text}%`, `email.ilike.%${needle.text}%`] : []),
            ...(needle.digits ? [`phone_digits.ilike.%${needle.digits}%`] : []),
          ].join(",")
        : null;
    const filtered = <T>(b: T & { or(f: string): T }): T => (orFilter ? b.or(orFilter) : b);

    // La página de datos NO pide count: con count, un offset fuera de rango
    // devuelve 416 en vez de []. Los conteos van aparte, como en listBookings.
    const [page, matching, all] = await Promise.all([
      filtered(this.db.from("customers").select(PROFILE_COLS))
        .order(orden.column, { ascending: orden.ascending, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, from + query.perPage - 1),
      filtered(this.db.from("customers").select("id", { count: "exact", head: true })),
      this.db.from("customers").select("id", { count: "exact", head: true }),
    ]);
    if (page.error) throwDbError(page.error);
    if (matching.error) throwDbError(matching.error);
    return {
      rows: (page.data ?? []).map(toProfile),
      total: matching.count ?? 0,
      grandTotal: all.count ?? 0,
    };
  }

  async findByEmail(email: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db.from("customers").select(PROFILE_COLS).eq("email", email).maybeSingle();
    if (error) throwDbError(error);
    return data ? toProfile(data) : null;
  }

  /**
   * `phone_digits` NO es único (dos personas pueden compartir un teléfono, y de
   * hecho una pareja que reserva por el mismo número es un caso real), así que
   * esto ordena y toma una — nunca `maybeSingle`, que reventaría con dos filas.
   * Se usa solo para AVISAR al staff, jamás para elegir por él.
   */
  async findByPhoneDigits(digits: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db
      .from("customers")
      .select(PROFILE_COLS)
      .eq("phone_digits", digits)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throwDbError(error);
    return data?.[0] ? toProfile(data[0]) : null;
  }

  async create(d: { name: string; email: string | null; phone: string | null }): Promise<CustomerProfile> {
    const { data, error } = await this.db
      .from("customers")
      .insert({ name: d.name, email: d.email, phone: d.phone })
      .select(PROFILE_COLS)
      .single();
    if (error) throwDbError(error);
    // El insert con `.select().single()` devuelve la fila o error; el guard hace
    // explícito ese contrato en vez de forzarlo con un cast.
    if (!data) throwDbError({ code: null, message: "customers insert: fila nula sin error" });
    return toProfile(data);
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
