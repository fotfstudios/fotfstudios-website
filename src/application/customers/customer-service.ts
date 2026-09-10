import type {
  CustomerBooking,
  CustomerProfile,
  CustomerRepository,
  PointsMovement,
} from "@/src/application/ports/customers";
import { customerDbErrorMessage } from "@/src/domain/customers/customer-input";

/** Resultado de asegurar la ficha del titular de la sesión. */
export type EnsureCustomerOutcome = { kind: "ok"; profile: CustomerProfile } | { kind: "email_conflict" };

/** Traduce la sentinela del adaptador a una frase; deja pasar lo desconocido. */
function legible(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  return new Error(customerDbErrorMessage(null, null, msg) ?? msg);
}

/**
 * Cuenta del cliente: perfil, puntos y reservas. Toda consulta se hace con
 * valores derivados de la sesión verificada (userId/email) — nunca con input
 * del cliente — porque el service-role bypasea RLS.
 *
 * La ficha se resuelve SIEMPRE por `auth_user_id`: desde el directorio,
 * `customers.id` ya no es `auth.users.id` (una ficha adoptada conserva su id).
 */
export class CustomerService {
  constructor(private readonly repo: CustomerRepository) {}

  /**
   * Punto de entrada de cada visita autenticada (/cuenta y /reservar): asegura
   * la ficha y otorga los puntos retroactivos del historial. Idempotente.
   * Un email que ya es de otra ficha vuelve como VALOR (`email_conflict`): los
   * error.tsx del repo jamás muestran `error.message` y un layout no lo captura
   * su propio boundary, así que un throw nunca llegaría con copy legible.
   */
  async ensureCustomer(userId: string, email: string): Promise<EnsureCustomerOutcome> {
    const ensured = await this.repo.ensureForAuthUser(userId, email.trim().toLowerCase());
    if (ensured.kind !== "ok") return { kind: "email_conflict" };
    await this.repo.awardRetroPoints(ensured.id);
    const profile = await this.repo.getProfile(ensured.id);
    // Inalcanzable salvo borrado concurrente (no hay flujo de borrado de fichas).
    if (!profile) throw legible(new Error("customer_not_found"));
    return { kind: "ok", profile };
  }

  profileByUser(userId: string): Promise<CustomerProfile | null> {
    return this.repo.findByAuthUser(userId);
  }

  async movementsByUser(userId: string, limit = 50): Promise<PointsMovement[]> {
    const profile = await this.repo.findByAuthUser(userId);
    return profile ? this.repo.movements(profile.id, limit) : [];
  }

  /**
   * Edición desde /cuenta/perfil. Pasa por `update_customer_contact` — el MISMO
   * camino que el admin — así los dos escritores nunca derivan y el snapshot de
   * la próxima reserva (el que el staff usa para WhatsApp) se actualiza solo.
   * Reenvía el email ACTUAL: la función rechaza cambiarlo para un titular.
   *
   * OJO: la LECTURA va dentro del try. Si `findByAuthUser` falla, su mensaje es
   * texto crudo de Postgres y `run()` lo mostraría tal cual en el toast del
   * perfil; adentro pasa por `legible` como cualquier otro fallo.
   */
  async updateProfileByUser(userId: string, data: { name: string | null; phone: string | null }): Promise<void> {
    try {
      const profile = await this.repo.findByAuthUser(userId);
      if (!profile) throw new Error("customer_not_found");
      await this.repo.updateContact(profile.id, { name: data.name, email: profile.email, phone: data.phone });
    } catch (e) {
      throw legible(e);
    }
  }

  /** @deprecated PR2: usa profileByUser. Se elimina al soltar los métodos legacy del puerto. */
  profile(userId: string): Promise<CustomerProfile | null> {
    return this.repo.getProfile(userId);
  }

  /** @deprecated PR2: usa updateProfileByUser. */
  updateProfile(userId: string, data: { name: string | null; phone: string | null }): Promise<void> {
    return this.repo.updateProfile(userId, data);
  }

  /** @deprecated PR2: usa movementsByUser. */
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
