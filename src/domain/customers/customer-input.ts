/**
 * Entrada de cliente (staff e invitado) — parseo puro y COPY de los errores de
 * la DB. Único lugar donde viven las frases del directorio: `run()`/`runData`
 * muestran `e.message` tal cual en un toast, así que nada crudo de Postgres
 * puede llegar a una persona. La forma del email es la de `contact.ts`, que a
 * su vez es el espejo del gate SQL de PR1.
 */
import { escapeIlike } from "@/src/domain/admin/reservas-list";
import { EMAIL_MAX, normalizeEmail, normalizePhone, phoneDigits } from "@/src/domain/contact/contact";
import { err, ok, type Result } from "@/src/domain/shared/result";

/** Topes de las columnas de `customers` (name/email/phone). */
export const CUSTOMER_CAPS = { name: 80, email: EMAIL_MAX, phone: 40 } as const;

/** Aguja de búsqueda: tope de caracteres antes de escapar. */
export const SEARCH_MAX = 80;

/** Mínimo de dígitos para buscar por teléfono (menos que eso matchea todo). */
const MIN_SEARCH_DIGITS = 3;

export interface CustomerInput {
  name: string;
  email: string | null;
  phone: string | null;
}

/** Lee una clave como string recortado; cualquier no-string se vuelve "". */
function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Identidad mínima (decisión 3 del dueño): nombre + al menos uno de email o
 * teléfono. El email queda en minúsculas y con forma válida; el teléfono, en
 * `(+)?dígitos`. Devuelve Result — el dominio no lanza.
 */
export function parseCustomerInput(raw: unknown): Result<CustomerInput, string> {
  const obj = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  const name = str(obj, "name");
  if (!name) return err("El nombre es obligatorio.");
  if (name.length > CUSTOMER_CAPS.name) return err("El nombre no puede superar los 80 caracteres.");

  const emailRaw = str(obj, "email");
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  if (emailRaw && !email) return err("Email no válido.");

  const phoneRaw = str(obj, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return err("Teléfono no válido. Usa 8 a 15 dígitos, con o sin +.");

  if (!email && !phone) return err("Ingresa un email o un teléfono.");
  return ok({ name, email, phone });
}

/**
 * Aguja para el `.or()` de PostgREST: `text` ya escapado (comodines de ILIKE y
 * los delimitadores de la gramática) y `digits` solo cuando hay suficientes
 * para que buscar por teléfono discrimine.
 *
 * El tope se aplica UNA sola vez, sobre el input crudo: recortar DESPUÉS de
 * escapar podría partir un par `\%` al medio y dejar un backslash suelto al
 * final, que en el patrón de ILIKE es un escape sin nada que escapar (o un
 * error de Postgres). El escape solo puede alargar el texto, nunca acortarlo.
 */
export function customerSearchNeedle(q: string): { text: string; digits: string | null } {
  const raw = (q ?? "").trim().slice(0, SEARCH_MAX);
  const digits = phoneDigits(raw);
  return {
    text: escapeIlike(stripAccents(raw.toLowerCase())),
    digits: digits && digits.length >= MIN_SEARCH_DIGITS ? digits : null,
  };
}

/**
 * Quita diacríticos: "Matías" → "Matias", "Muñoz" → "Munoz".
 *
 * Espejo en JS de `immutable_unaccent` en SQL, que alimenta la columna generada
 * `customers.name_norm`. Los dos lados TIENEN que coincidir: la columna guarda
 * el nombre ya normalizado y acá se normaliza lo que tipeó el staff, así que si
 * uno de los dos cambiara de criterio la búsqueda dejaría de encontrar.
 *
 * NFD separa la letra base de su marca combinante, y U+0300–U+036F son
 * exactamente esas marcas; es la misma descomposición que aplica `unaccent`.
 * El rango va escapado a propósito: escrito con los caracteres literales queda
 * invisible en el editor y cualquier reformateo puede comérselo.
 */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Mínimo de letras para buscar por texto. Con una sola, un ilike matchea medio directorio. */
const MIN_SEARCH_LETTERS = 2;

/**
 * La aguja SOLO si alcanza para discriminar; null si no.
 *
 * Fuente única del umbral, y eso es lo importante: lo consultan el servicio
 * (para decidir si va a la base) y el picker (para decidir qué le dice al
 * staff). Con dos umbrales separados el picker mostraba "Sin coincidencias"
 * —es decir, "esta persona no está en el directorio"— cuando en realidad no
 * se había buscado nada, que es exactamente el error que lleva a crear una
 * ficha duplicada.
 *
 * El largo se mide sobre el texto YA ESCAPADO: `escapeIlike` convierte los
 * delimitadores de PostgREST (`,` `(` `)` `"` `*`) en espacios, así que "(("
 * son dos caracteres crudos pero una aguja vacía.
 */
export function searchableNeedle(q: string): { text: string; digits: string | null } | null {
  const needle = customerSearchNeedle(q);
  const letters = needle.text.replace(/\d/g, "").trim().length;
  if (letters < MIN_SEARCH_LETTERS && !needle.digits) return null;
  return needle;
}

/** Cómo se nombra a un cliente en la UI cuando falta el nombre. */
export function customerLabel(c: { name?: string | null; email?: string | null; phone?: string | null }): string {
  return c.name?.trim() || c.email || c.phone || "Cliente sin nombre";
}

/**
 * Copy genérico cuando un error de la DB no calza con ningún sentinela
 * reconocido (deadlock, timeout, un CHECK nuevo, columna que cambió, texto de
 * red...). Fuente única: tanto `throwDbError` del adaptador como `legible` de
 * `customer-service.ts` usan ESTA MISMA frase, para que un error sin
 * sentinela se vea idéntico sin importar qué capa lo atrapó primero. El texto
 * crudo de Postgres nunca llega a `.message` — solo a `.cause`, para logs.
 */
export const CUSTOMER_GENERIC_DB_ERROR = "No pudimos completar la operación. Intenta de nuevo.";

/** Frases (una por sentinela). Chileno, directo, oración completa. */
const CUSTOMER_DB_MESSAGES: Readonly<Record<string, string>> = {
  email_taken: "Ese email ya pertenece a otro cliente.",
  auth_user_taken: "Esa cuenta ya está vinculada a otro cliente.",
  customers_contact_required: "Ingresa un email o un teléfono.",
  customers_name_len: "El nombre no puede superar los 80 caracteres.",
  customers_phone_len: "Teléfono no válido. Usa 8 a 15 dígitos, con o sin +.",
  customers_email_lower: "Email no válido.",
  customer_not_found: "El cliente ya no existe. Vuelve a seleccionarlo.",
  customer_email_invalid: "Email no válido.",
  customer_has_account: "Este cliente tiene cuenta: su email es su acceso y no se puede cambiar desde el panel.",
  customer_email_in_use: "Este cliente tiene puntos o reservas con ese email: no puede quedarse sin email.",
  // OJO: el literal exagera la causa — también salta con una ficha de invitado
  // sin reclamar y en la carrera por PK. La frase habla de "otro cliente"
  // (una ficha del directorio), nunca de "otra cuenta".
  customer_email_owned_by_other_user: "Ese email ya pertenece a otro cliente.",
  customer_email_required: "Falta el email de la cuenta.",
  customer_user_required: "Falta la cuenta que vincular.",
  customer_assign_not_booking: "Solo se puede cambiar el cliente de una reserva de sala.",
  customer_assign_inactive: "Solo se puede cambiar el cliente de una reserva vigente.",
  customer_assign_points_order: "Esta reserva usó Puntos FOTF y no se puede reasignar; cancélala y vuelve a crearla.",
  customer_assign_needs_email: "Ese cliente no tiene email; agrégalo antes de reasignar una reserva pagada.",
  // Espejo del anterior, del lado del checkout: una ficha solo-teléfono no puede quedar
  // vinculada a un pedido que cobra (los puntos resuelven al cliente por el email del
  // snapshot, así que esa reserva no ganaría ni devolvería nada). Un pedido de $0 sí pasa.
  customer_checkout_needs_email: "Ese cliente no tiene email; agrégalo antes de cobrarle una reserva.",
};

/**
 * ¿Hay frase para esta clave? Propiedad PROPIA, nunca heredada: con el operador
 * `in`, un constraint o un literal llamado `constructor`/`toString`/`valueOf`
 * daría true y el indexado devolvería una función por una firma que promete
 * `string`.
 */
function hasMessage(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(CUSTOMER_DB_MESSAGES, key);
}

/** Nombre del constraint dentro del mensaje de Postgres (PostgrestError no trae `constraint`). */
function constraintFromMessage(message: string | null | undefined): string | null {
  return /constraint "([a-zA-Z0-9_]+)"/.exec(message ?? "")?.[1] ?? null;
}

/**
 * Sentinela estable del error de DB: `email_taken`, el nombre del CHECK, el
 * literal de la RPC — o `"unknown"`. El adaptador relanza con esta cadena para
 * que la capa de aplicación pueda ramificar sin conocer códigos de Postgres.
 */
export function customerDbErrorCode(
  code: string | null | undefined,
  constraint: string | null | undefined,
  message: string | null | undefined = null,
): string {
  if (code === "23505" || code === "23514") {
    const name = constraint ?? constraintFromMessage(message);
    if (name === "customers_email_key") return "email_taken";
    if (name === "customers_auth_user_id_key") return "auth_user_taken";
    if (name && hasMessage(name)) return name;
    return "unknown";
  }
  const literal = (message ?? "").trim();
  return hasMessage(literal) ? literal : "unknown";
}

/**
 * Frase para una persona, o null si no reconocemos el error (el caller decide:
 * jamás mostrar el texto crudo de Postgres).
 */
export function customerDbErrorMessage(
  code: string | null | undefined,
  constraint: string | null | undefined,
  message: string | null | undefined = null,
): string | null {
  const key = customerDbErrorCode(code, constraint, message);
  return hasMessage(key) ? CUSTOMER_DB_MESSAGES[key] : null;
}

/**
 * ¿El fallo de `ensure_customer_for_user` es "ese email ya es de otra ficha"?
 * El chequeo de email libre de la RPC no es serializable (PR1 lo dejó así a
 * propósito): una inserción concurrente del mismo email aflora como 23505 crudo
 * en vez del literal. Para el usuario es exactamente la misma condición.
 *
 * OJO: `customers` tiene DOS unique. El 23505 de `customers_auth_user_id_key`
 * (dos logins concurrentes del mismo usuario) es `auth_user_taken`, otra cosa:
 * se excluye para no mostrarle la pantalla de conflicto de email a alguien cuyo
 * email está perfecto. Ese caso sale por `throwDbError` como sentinela traducible.
 */
export function isEnsureEmailConflict(e: { code?: string | null; message?: string | null }): boolean {
  const message = e.message ?? "";
  if (message.includes("customer_email_owned_by_other_user")) return true;
  return e.code === "23505" && !message.includes("customers_auth_user_id_key");
}
