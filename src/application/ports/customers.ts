import type { ClientesListQuery } from "@/src/domain/admin/clientes-list";
export type PointsEntryKind = "earn" | "earn_revoke" | "redeem" | "redeem_release" | "redeem_restore" | "adjust";

export interface CustomerProfile {
  id: string; // customers.id — ya NO es auth.users.id (una ficha adoptada tiene id propio)
  authUserId: string | null; // cuenta de auth vinculada; null = ficha del directorio (invitado/backfill)
  email: string | null; // null = ficha solo-teléfono (nunca para titulares de cuenta)
  name: string | null;
  phone: string | null;
  pointsBalance: number;
  createdAt: string;
}

/** Resultado de `ensure_customer_for_user`: nunca lanza para un conflicto de email. */
export type EnsureCustomerResult = { kind: "ok"; id: string } | { kind: "email_conflict" };

export interface PointsMovement {
  id: string;
  orderId: string | null;
  kind: PointsEntryKind;
  amount: number; // con signo (CLP)
  createdAt: string;
}

export interface CustomerBooking {
  id: string; // reservation id
  startsAt: string;
  endsAt: string;
  status: "held" | "confirmed" | "cancelled" | "expired";
  orderId: string | null;
  orderStatus: string | null;
  amountClp: number | null; // efectivo cobrado
  pointsRedeemedClp: number;
}

export interface CustomerRepository {
  /** Puntos retroactivos por el historial pagado del email. Idempotente; devuelve lo otorgado. */
  awardRetroPoints(id: string): Promise<number>;
  getProfile(id: string): Promise<CustomerProfile | null>;
  movements(id: string, limit: number): Promise<PointsMovement[]>;
  /** Reservas del email (verificado por sesión) — el WHERE es la frontera de ownership. */
  bookingsForEmail(email: string): Promise<CustomerBooking[]>;
  /** Ficha de una cuenta de auth (índice único `auth_user_id`). NUNCA asumir id = userId. */
  findByAuthUser(userId: string): Promise<CustomerProfile | null>;
  /**
   * Reservas de un cliente: `customer_id = id` OR (sin vincular AND el email
   * coincide). La rama por email es alcanzable en prod (el backfill llega en PR3
   * y las cortesías no pasan por el checkout).
   */
  bookingsForCustomer(customerId: string, email: string | null): Promise<CustomerBooking[]>;
  /** Login → ficha (rpc `ensure_customer_for_user`). Un email tomado NO lanza: devuelve email_conflict. */
  ensureForAuthUser(userId: string, email: string): Promise<EnsureCustomerResult>;
  /**
   * Búsqueda del picker del admin: nombre o email por texto, teléfono por
   * dígitos (columna generada `phone_digits`, que ignora +, espacios y guiones).
   * Devuelve las más recientes primero, acotadas a `limit`.
   */
  search(needle: { text: string; digits: string | null }, limit: number): Promise<CustomerProfile[]>;
  /** Ficha por email exacto — el email ya viene normalizado por el dominio. */
  findByEmail(email: string): Promise<CustomerProfile | null>;
  /** Ficha por dígitos del teléfono. NO es único: devuelve la más reciente. */
  findByPhoneDigits(digits: string): Promise<CustomerProfile | null>;
  /** Alta desde el admin. Lanza el sentinela `email_taken` si el email ya es de otra ficha. */
  create(d: { name: string; email: string | null; phone: string | null }): Promise<CustomerProfile>;
  /**
   * Lista paginada de /admin/clientes. `search()` no sirve: es de límite 8, sin
   * count ni offset, y devuelve [] para términos cortos a propósito. Esta sí
   * acepta `q` vacío (= todo el directorio, paginado) porque la lista es la
   * pantalla para eso. Devuelve el mismo shape que `listBookings`.
   */
  list(query: ClientesListQuery): Promise<{ rows: CustomerProfile[]; total: number; grandTotal: number }>;
  /**
   * Edición de contacto (rpc `update_customer_contact`): escribe la ficha,
   * propaga el snapshot a sus reservas y pedidos, y otorga los retro si hay
   * email. Camino ÚNICO de edición: lo usan `/cuenta/perfil` y el editor del
   * admin, así que los dos escritores no pueden divergir.
   *
   * Fue destructivo hasta la migración de PR3: `customer_sync_snapshots` copiaba
   * los campos de la ficha —NULLs incluidos— sobre todo el historial. Ahora
   * nombre y teléfono se coalescean contra lo que ya tenía el pedido y solo el
   * email sigue siendo autoritativo, que es lo que mantiene resolviendo el join
   * `lower(orders.customer_email) = customers.email` de las funciones de puntos.
   */
  updateContact(
    customerId: string,
    d: { name: string | null; email: string | null; phone: string | null },
  ): Promise<void>;
}
