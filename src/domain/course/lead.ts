/**
 * Solicitudes de inscripción al Curso de DJ (formulario público de /curso-dj) —
 * validación pura, sin IO. Mismo contrato que parseApplication (/unete):
 * `parseCourseLead` corre en el cliente antes de enviar Y en el route handler, así
 * los topes y los mensajes nunca se desincronizan. Devuelve tres vías: ok (datos
 * normalizados), spam (honeypot, se descarta en silencio) o invalid (TODOS los
 * issues juntos, no solo el primero).
 *
 * Ojo con el alcance: una solicitud NO es una inscripción y NO toma cupo. El cupo
 * se consume recién cuando el dueño la confirma desde el admin — eso saca la
 * carrera de asientos del borde público por completo.
 */
import { COURSE_LEAD_STATUSES, EXPERIENCE_LEVELS, LEAD_PLANS, type CourseLeadStatus, type ExperienceLevel, type LeadPlan } from "./course";

/** Topes de largo por campo. Los usa el form (maxLength), el route y el CHECK de la DB. */
export const COURSE_LEAD_CAPS = {
  name: 80,
  email: 120,
  phone: 40,
  availability: 200,
  message: 1000,
} as const;

/** `plan` y `experience` validan por catálogo, no por largo: van aparte de los caps. */
export type CourseLeadField = keyof typeof COURSE_LEAD_CAPS | "plan" | "experience";
export type CourseLeadIssueCode = "required" | "too_long" | "invalid";
export type CourseLeadIssue = { field: CourseLeadField; code: CourseLeadIssueCode };

/** Salida normalizada, lista para insertar. */
export interface CourseLeadInput {
  name: string;
  email: string;
  phone: string;
  plan: LeadPlan;
  experience: ExperienceLevel;
  availability: string;
  message: string | null;
}

export type ParsedCourseLead =
  | { kind: "ok"; value: CourseLeadInput }
  | { kind: "spam" }
  | { kind: "invalid"; issues: CourseLeadIssue[] };

export function isCourseLeadStatus(s: string): s is CourseLeadStatus {
  return (COURSE_LEAD_STATUSES as readonly string[]).includes(s);
}

function str(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.trim() : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normaliza a "+"(opcional) + dígitos; null si no cae en 8–15 dígitos. */
function normalizePhone(raw: string): string | null {
  const plus = /^[^\d]*\+/.test(raw);
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

export function parseCourseLead(raw: unknown): ParsedCourseLead {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { kind: "invalid", issues: [{ field: "name", code: "required" }] };
  }
  const obj = raw as Record<string, unknown>;

  // Honeypot primero: un bot que llena el campo señuelo se descarta en silencio.
  if (typeof obj.website === "string" && obj.website.trim() !== "") {
    return { kind: "spam" };
  }

  const issues: CourseLeadIssue[] = [];
  const add = (field: CourseLeadField, code: CourseLeadIssueCode) => issues.push({ field, code });

  const name = str(obj, "name");
  if (!name) add("name", "required");
  else if (name.length > COURSE_LEAD_CAPS.name) add("name", "too_long");

  const email = str(obj, "email").toLowerCase();
  if (!email) add("email", "required");
  else if (email.length > COURSE_LEAD_CAPS.email) add("email", "too_long");
  else if (!EMAIL_RE.test(email)) add("email", "invalid");

  const phoneRaw = str(obj, "phone");
  let phone = "";
  if (!phoneRaw) add("phone", "required");
  else if (phoneRaw.length > COURSE_LEAD_CAPS.phone) add("phone", "too_long");
  else {
    const normalized = normalizePhone(phoneRaw);
    if (!normalized) add("phone", "invalid");
    else phone = normalized;
  }

  const planRaw = str(obj, "plan");
  if (!planRaw) add("plan", "required");
  else if (!(LEAD_PLANS as readonly string[]).includes(planRaw)) add("plan", "invalid");

  const experienceRaw = str(obj, "experience");
  if (!experienceRaw) add("experience", "required");
  else if (!(EXPERIENCE_LEVELS as readonly string[]).includes(experienceRaw)) add("experience", "invalid");

  const availability = str(obj, "availability");
  if (!availability) add("availability", "required");
  else if (availability.length > COURSE_LEAD_CAPS.availability) add("availability", "too_long");

  // Opcional: solo se valida el tope.
  const message = str(obj, "message");
  if (message.length > COURSE_LEAD_CAPS.message) add("message", "too_long");

  if (issues.length > 0) return { kind: "invalid", issues };

  return {
    kind: "ok",
    value: {
      name,
      email,
      phone,
      plan: planRaw as LeadPlan,
      experience: experienceRaw as ExperienceLevel,
      availability,
      message: message || null,
    },
  };
}
