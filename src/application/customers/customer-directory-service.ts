import type { CustomerProfile, CustomerRepository } from "@/src/application/ports/customers";
import { normalizePhone, phoneDigits } from "@/src/domain/contact/contact";
import {
  CUSTOMER_GENERIC_DB_ERROR,
  customerDbErrorMessage,
  customerSearchNeedle,
  parseCustomerInput,
} from "@/src/domain/customers/customer-input";
import { err, ok, type Result } from "@/src/domain/shared/result";

/** Filas que muestra el picker de una vez. Más que esto deja de ser un vistazo. */
export const PICKER_LIMIT = 8;

/**
 * Mínimos para que la búsqueda discrimine. Con menos, un `ilike %a%` devuelve
 * medio directorio y el staff no aprende nada del resultado.
 */
export const MIN_SEARCH_LETTERS = 2;
const MIN_SEARCH_DIGITS = 3;

/**
 * Alta desde el admin. `exists` NO es un error: el staff tipeó el email de
 * alguien que ya está en el directorio, y lo correcto es ofrecerle esa ficha en
 * vez de hacerle rellenar el formulario de nuevo.
 */
export type CreateCustomerOutcome =
  | { kind: "created"; customer: CustomerProfile }
  | { kind: "exists"; customer: CustomerProfile };

/** Traduce un sentinela del adaptador a una frase; lo desconocido cae al copy genérico. */
function legible(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return customerDbErrorMessage(null, null, msg) ?? CUSTOMER_GENERIC_DB_ERROR;
}

/**
 * Directorio de clientes para la consola del admin: buscar, crear y resolver una
 * ficha. Separado de `CustomerService` a propósito — ese resuelve SIEMPRE por la
 * sesión del titular (`auth_user_id`) y nunca acepta un id del cliente, mientras
 * este trabaja con ids que elige el staff. Mezclarlos invitaría a que una ruta
 * pública terminara leyendo por id arbitrario.
 */
export class CustomerDirectoryService {
  constructor(private readonly repo: CustomerRepository) {}

  /**
   * Devuelve [] cuando el término es demasiado corto, en vez de buscar igual:
   * un `%` solo haría un scan del directorio entero para mostrar basura.
   */
  async search(q: string, limit = PICKER_LIMIT): Promise<CustomerProfile[]> {
    const raw = (q ?? "").trim();
    const needle = customerSearchNeedle(raw);
    const letters = raw.replace(/\d/g, "").trim().length;
    if (letters < MIN_SEARCH_LETTERS && !needle.digits) return [];
    return this.repo.search(needle, limit);
  }

  /** La ficha elegida, para re-leerla en el servidor antes de escribir nada. */
  get(id: string): Promise<CustomerProfile | null> {
    return this.repo.getProfile(id);
  }

  /**
   * Crea la ficha, o devuelve la que ya tiene ese email.
   *
   * El chequeo previo por email evita el caso común (el staff tipea a alguien
   * que ya existe) con un mensaje útil; el `catch` del `email_taken` cubre la
   * CARRERA — dos personas del staff creando la misma ficha a la vez —, donde
   * el chequeo previo ya pasó y el único árbitro es el índice único.
   */
  async create(raw: unknown): Promise<Result<CreateCustomerOutcome, string>> {
    const parsed = parseCustomerInput(raw);
    if (!parsed.ok) return err(parsed.error);
    const { name, email, phone } = parsed.value;

    if (email) {
      const existing = await this.repo.findByEmail(email);
      if (existing) return ok({ kind: "exists", customer: existing });
    }

    try {
      return ok({ kind: "created", customer: await this.repo.create({ name, email, phone }) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "email_taken" && email) {
        const again = await this.repo.findByEmail(email);
        if (again) return ok({ kind: "exists", customer: again });
      }
      return err(legible(e));
    }
  }

  /**
   * Aviso blando al tipear un teléfono que ya está en el directorio. Solo
   * informa: el teléfono NO es único (una pareja que reserva por el mismo
   * número es un caso real), así que jamás decide por el staff.
   */
  async lookupPhone(phone: string): Promise<CustomerProfile | null> {
    const normalized = normalizePhone((phone ?? "").trim());
    if (!normalized) return null;
    const digits = phoneDigits(normalized);
    if (!digits || digits.length < MIN_SEARCH_DIGITS) return null;
    return this.repo.findByPhoneDigits(digits);
  }
}
