import type {
  CustomerBooking,
  CustomerProfile,
  CustomerRepository,
  PointsMovement,
} from "@/src/application/ports/customers";
import { CUSTOMER_GENERIC_DB_ERROR, customerDbErrorMessage } from "@/src/domain/customers/customer-input";

/** Resultado de asegurar la ficha del titular de la sesión. */
export type EnsureCustomerOutcome = { kind: "ok"; profile: CustomerProfile } | { kind: "email_conflict" };

/**
 * Traduce una sentinela a una frase. Lo desconocido NUNCA pasa tal cual — cae
 * al mismo copy genérico que usa `throwDbError` del adaptador
 * (`CUSTOMER_GENERIC_DB_ERROR`), así un error sin sentinela se ve idéntico
 * venga de donde venga. El texto original (o la sentinela) queda en `.cause`
 * para logs, nunca en `.message`.
 */
function legible(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error && e.cause !== undefined ? e.cause : msg;
  return new Error(customerDbErrorMessage(null, null, msg) ?? CUSTOMER_GENERIC_DB_ERROR, { cause });
}

/**
 * Cuenta del cliente: perfil, puntos y reservas. Toda consulta se hace con
 * valores derivados de la sesión verificada (userId/email) — nunca con input
 * del cliente — porque el service-role bypasea RLS.
 *
 * Todo método (`ensureCustomer`, `profileByUser`, `movementsByUser`,
 * `updateProfileByUser`) resuelve la ficha SIEMPRE por `auth_user_id`: desde
 * el directorio, `customers.id` ya no es `auth.users.id` (una ficha adoptada
 * conserva su id propio). Los tres métodos `@deprecated` que asumían
 * `id === userId` — el bug que esta clase reemplaza — vivieron acá solo hasta
 * que Task 7 migró los call sites; Task 8 los borró.
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
    if (ensured.kind === "email_conflict") return { kind: "email_conflict" };
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
   * Guarda el perfil del cliente y PROPAGA el contacto a sus reservas y pedidos
   * (rpc `update_customer_contact`).
   *
   * El email viaja como el que ya tiene la ficha, nunca el del formulario: para
   * un titular de cuenta el email es su acceso, y la RPC además rechaza
   * cambiárselo (`customer_has_account`).
   *
   * Esto era imposible hasta que la migración de PR3 hizo `customer_sync_snapshots`
   * no destructivo: antes copiaba los campos de la ficha —NULLs incluidos— sobre
   * todo el historial, así que el primer perfil guardado con un campo en blanco
   * borraba ese dato de reservas pagadas. Ahora nombre y teléfono se coalescean
   * (el email sigue siendo autoritativo, que es lo que mantiene vivo el join de
   * puntos). Efecto lateral buscado: vaciar el teléfono en el perfil NO lo borra
   * de las reservas viejas; solo deja de agregarlo.
   *
   * OJO: la LECTURA va dentro del try. `findByAuthUser` ya no puede lanzar
   * texto crudo de Postgres (el adaptador lo traduce con `throwDbError`), pero
   * igual pasa por `legible` acá — mismo camino que la escritura — para que
   * `run()` nunca dependa de qué método falló para decidir si el toast del
   * perfil es seguro de mostrar tal cual.
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
