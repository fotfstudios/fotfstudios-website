import type {
  CustomerBooking,
  CustomerProfile,
  CustomerRepository,
  PointsMovement,
} from "@/src/application/ports/customers";

/**
 * Cuenta del cliente: perfil, puntos y reservas. Toda consulta se hace con
 * valores derivados de la sesión verificada (userId/email) — nunca con input
 * del cliente — porque el service-role bypasea RLS.
 */
export class CustomerService {
  constructor(private readonly repo: CustomerRepository) {}

  /**
   * Punto de entrada de cada visita autenticada (/cuenta y /reservar): asegura
   * el perfil y otorga los puntos retroactivos del historial. Idempotente y
   * barato de repetir (upsert + clave única del ledger).
   */
  async ensureCustomer(userId: string, email: string): Promise<void> {
    await this.repo.upsertCustomer(userId, email.toLowerCase());
    await this.repo.awardRetroPoints(userId);
  }

  profile(userId: string): Promise<CustomerProfile | null> {
    return this.repo.getProfile(userId);
  }

  updateProfile(userId: string, data: { name: string | null; phone: string | null }): Promise<void> {
    return this.repo.updateProfile(userId, data);
  }

  movements(userId: string, limit = 50): Promise<PointsMovement[]> {
    return this.repo.movements(userId, limit);
  }

  bookingsForEmail(email: string): Promise<CustomerBooking[]> {
    return this.repo.bookingsForEmail(email.toLowerCase());
  }

  /** Reservas partidas en próximas (vigentes, ascendente) y pasadas/terminadas. */
  async bookings(
    email: string,
    nowIso = new Date().toISOString(),
  ): Promise<{ upcoming: CustomerBooking[]; past: CustomerBooking[] }> {
    const all = await this.bookingsForEmail(email);
    const now = new Date(nowIso).getTime();
    const upcoming = all
      .filter((b) => new Date(b.startsAt).getTime() >= now && (b.status === "held" || b.status === "confirmed"))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const upcomingIds = new Set(upcoming.map((b) => b.id));
    return { upcoming, past: all.filter((b) => !upcomingIds.has(b.id)) };
  }
}
