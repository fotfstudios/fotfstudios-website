/**
 * Postulaciones de DJ ("Súmata al equipo", /unete) — validación pura, sin IO.
 * `parseApplication` corre en el cliente (antes de enviar) Y en el route handler
 * público, así los mensajes de error y los topes nunca se desincronizan. Devuelve
 * un resultado de tres vías: ok (datos normalizados), spam (honeypot, se descarta
 * en silencio) o invalid (todos los issues juntos, no solo el primero).
 */

export const APPLICATION_STATUSES = ["nueva", "contactada", "descartada"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export function isApplicationStatus(s: string): s is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(s);
}

/**
 * Qué puede ofrecer el postulante: el equipo da CLASES grupales y sesiones guiadas
 * 1:1. Valor único ('ambas' cubre los dos casos), no multiselección.
 */
export const SESSION_FORMATS = ["clases", "uno_a_uno", "ambas"] as const;
export type SessionFormat = (typeof SESSION_FORMATS)[number];

export function isSessionFormat(s: string): s is SessionFormat {
  return (SESSION_FORMATS as readonly string[]).includes(s);
}

/** Etiquetas es-CL para UI y emails. */
export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  clases: "Clases grupales",
  uno_a_uno: "Sesiones 1:1",
  ambas: "Ambas",
};

/** Topes de largo por campo de texto. Los usa el form (maxLength), el route y el CHECK de la DB. */
export const APPLICATION_CAPS = {
  name: 80,
  email: 120,
  phone: 40,
  availability: 200,
  mixUrl: 300,
  instagram: 200,
  genres: 120,
  pitch: 1000,
} as const;

/** `format` valida por catálogo (no por largo), por eso va aparte de los caps. */
export type ApplicationField = keyof typeof APPLICATION_CAPS | "format";
export type ApplicationIssueCode = "required" | "too_long" | "invalid";
export type ApplicationIssue = { field: ApplicationField; code: ApplicationIssueCode };

/** Salida normalizada, lista para insertar. */
export interface ApplicationInput {
  name: string;
  email: string;
  phone: string;
  format: SessionFormat;
  availability: string;
  mixUrl: string;
  instagram: string | null;
  genres: string | null;
  pitch: string;
}

export type ParsedApplication =
  | { kind: "ok"; value: ApplicationInput }
  | { kind: "spam" }
  | { kind: "invalid"; issues: ApplicationIssue[] };

/** Lee una clave como string recortado; cualquier no-string se vuelve "". */
function str(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.trim() : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normaliza a "+"(opcional) + dígitos; null si no cae en 8–15 dígitos. */
function normalizePhone(raw: string): string | null {
  // "+" internacional si aparece antes del primer dígito (tolera "(+56)").
  const plus = /^[^\d]*\+/.test(raw);
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

/** Normaliza a href http(s) con dominio; null si no es una URL web válida. */
function normalizeUrl(raw: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;
  return url.href;
}

export function parseApplication(raw: unknown): ParsedApplication {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { kind: "invalid", issues: [{ field: "name", code: "required" }] };
  }
  const obj = raw as Record<string, unknown>;

  // Honeypot primero: un bot que llena el campo señuelo se descarta en silencio.
  if (typeof obj.website === "string" && obj.website.trim() !== "") {
    return { kind: "spam" };
  }

  const issues: ApplicationIssue[] = [];
  const add = (field: ApplicationField, code: ApplicationIssueCode) => issues.push({ field, code });

  const name = str(obj, "name");
  if (!name) add("name", "required");
  else if (name.length > APPLICATION_CAPS.name) add("name", "too_long");

  const email = str(obj, "email").toLowerCase();
  if (!email) add("email", "required");
  else if (email.length > APPLICATION_CAPS.email) add("email", "too_long");
  else if (!EMAIL_RE.test(email)) add("email", "invalid");

  const phoneRaw = str(obj, "phone");
  let phone = "";
  if (!phoneRaw) add("phone", "required");
  else if (phoneRaw.length > APPLICATION_CAPS.phone) add("phone", "too_long");
  else {
    const normalized = normalizePhone(phoneRaw);
    if (!normalized) add("phone", "invalid");
    else phone = normalized;
  }

  const formatRaw = str(obj, "format");
  let format: SessionFormat = "ambas";
  if (!formatRaw) add("format", "required");
  else if (!isSessionFormat(formatRaw)) add("format", "invalid");
  else format = formatRaw;

  const availability = str(obj, "availability");
  if (!availability) add("availability", "required");
  else if (availability.length > APPLICATION_CAPS.availability) add("availability", "too_long");

  const mixRaw = str(obj, "mixUrl");
  let mixUrl = "";
  if (!mixRaw) add("mixUrl", "required");
  else if (mixRaw.length > APPLICATION_CAPS.mixUrl) add("mixUrl", "too_long");
  else {
    const normalized = normalizeUrl(mixRaw);
    if (!normalized) add("mixUrl", "invalid");
    else mixUrl = normalized;
  }

  const instagramRaw = str(obj, "instagram");
  if (instagramRaw.length > APPLICATION_CAPS.instagram) add("instagram", "too_long");
  const instagram = instagramRaw ? instagramRaw.replace(/^@+/, "") : null;

  const genresRaw = str(obj, "genres");
  if (genresRaw.length > APPLICATION_CAPS.genres) add("genres", "too_long");
  const genres = genresRaw || null;

  const pitch = str(obj, "pitch");
  if (!pitch) add("pitch", "required");
  else if (pitch.length > APPLICATION_CAPS.pitch) add("pitch", "too_long");

  if (issues.length > 0) return { kind: "invalid", issues };

  return {
    kind: "ok",
    value: { name, email, phone, format, availability, mixUrl, instagram, genres, pitch },
  };
}
