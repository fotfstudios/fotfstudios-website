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
  /** Edición de contacto (rpc `update_customer_contact`): propaga el snapshot y da retro. */
  updateContact(
    customerId: string,
    d: { name: string | null; email: string | null; phone: string | null },
  ): Promise<void>;
}
