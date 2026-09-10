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
   * Escritura ACOTADA para `/cuenta/perfil`: solo `name` y `phone` en la fila
   * de `customers`, por el id de la FICHA (nunca el de `auth.users`). No toca
   * el email ni propaga nada a `orders`/`reservations`.
   *
   * Existe porque `update_customer_contact` (abajo) es hoy DESTRUCTIVO para
   * este caso: escribe la ficha y después `customer_sync_snapshots` copia sus
   * campos —NULLs incluidos— sobre cada pedido y reserva del cliente. Como
   * `validateProfile` manda null por cada campo vacío del formulario, el
   * primero que guarde su perfil con un campo en blanco borraría el otro dato
   * en todo su historial, incluidas reservas pagadas y confirmadas — y
   * justamente los datos que el backfill de PR3 lee para poblar el directorio.
   */
  updateNamePhone(customerId: string, d: { name: string | null; phone: string | null }): Promise<void>;
  /**
   * Edición de contacto (rpc `update_customer_contact`): propaga el snapshot y
   * da retro. **Todavía sin consumidor**: es el camino correcto para el editor
   * del admin en PR5, cuando PR3 haya hecho `customer_sync_snapshots` no
   * destructivo (`coalesce` de nombre y teléfono, email autoritativo). Hasta
   * entonces `/cuenta/perfil` usa `updateNamePhone`; ver el comentario de ahí.
   */
  updateContact(
    customerId: string,
    d: { name: string | null; email: string | null; phone: string | null },
  ): Promise<void>;
}
