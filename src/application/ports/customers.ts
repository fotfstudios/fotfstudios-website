export type PointsEntryKind = "earn" | "earn_revoke" | "redeem" | "redeem_release" | "redeem_restore" | "adjust";

export interface CustomerProfile {
  id: string; // auth.users.id
  email: string;
  name: string | null;
  phone: string | null;
  pointsBalance: number;
}

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
  /** Crea/actualiza el perfil (id = auth user, email en minúsculas). Idempotente. */
  upsertCustomer(id: string, email: string): Promise<void>;
  /** Puntos retroactivos por el historial pagado del email. Idempotente; devuelve lo otorgado. */
  awardRetroPoints(id: string): Promise<number>;
  getProfile(id: string): Promise<CustomerProfile | null>;
  updateProfile(id: string, data: { name: string | null; phone: string | null }): Promise<void>;
  movements(id: string, limit: number): Promise<PointsMovement[]>;
  /** Reservas del email (verificado por sesión) — el WHERE es la frontera de ownership. */
  bookingsForEmail(email: string): Promise<CustomerBooking[]>;
}
