import type { NurtureLead, NurtureStep } from "@/src/domain/outreach/nurture-schedule";
import type { AutoStage, LeadStage } from "@/src/domain/outreach/pipeline";

/** Atribución de un toque (query string de la captación). */
export interface TouchUtm {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  referrerHost?: string | null;
}

export type TouchKind =
  | "guia_download"
  | "newsletter_subscribe"
  | "curso_solicitud"
  | "dj_application"
  | "booking_paid"
  | "course_enrolled"
  | "manual"
  | "nurture_sent"
  | "unsubscribe"
  | "stage_change"
  | "enroll";

/** Alta/actualización de ficha + un toque. */
export interface LeadUpsertInput {
  email: string;
  name?: string | null;
  phone?: string | null;
  source?: string | null;
  kind: TouchKind;
  utm?: TouchUtm;
  detail?: Record<string, unknown> | null;
}

/** Candidato del barrido de nurture: lo que `nextStepDue` necesita + a quién mandarle. */
export interface NurtureCandidate extends NurtureLead {
  id: string;
  email: string;
  name: string | null;
  unsubscribeToken: string;
}

/** Repositorio del CRM/nurture (tablas leads/lead_touches/email_suppressions). Solo service_role. */
export interface LeadsRepository {
  /** Upsert por correo (primer toque conserva identidad/source) + append de un toque. Devuelve el id. */
  upsert(input: LeadUpsertInput): Promise<string>;
  /** Toque suelto para eventos que no son captación (nurture_sent, unsubscribe, …). */
  recordTouch(email: string, kind: TouchKind, detail?: Record<string, unknown> | null): Promise<void>;
  /**
   * Inscribe en la secuencia (opt-in): sella consent/enrolled. `clearSuppression` reactiva una
   * baja previa y borra la supresión global — SOLO desde una acción autenticada (admin); las vías
   * públicas lo dejan en false, así un POST no re-suscribe a un tercero que se dio de baja.
   */
  enroll(email: string, source: string, consentAt?: Date, clearSuppression?: boolean): Promise<void>;
  /** Candidatos con algún paso pendiente (barrido). El paso lo decide `nextStepDue` en el servicio. */
  candidates(limit?: number): Promise<NurtureCandidate[]>;
  /** Reclama un paso: lo marca enviado solo si estaba null. true = esta corrida lo marcó. */
  claimStep(id: string, step: NurtureStep): Promise<boolean>;
  /** Suelta el reclamo (vuelve el paso a null) si el envío falló. */
  releaseStep(id: string, step: NurtureStep): Promise<void>;
  /** Baja por token: marca, suprime globalmente, deja toque. Devuelve el correo o null. */
  unsubscribe(token: string): Promise<string | null>;
  /** Avance automático del embudo (hacia adelante; nunca pisa ganado/perdido). */
  advance(email: string, target: AutoStage): Promise<void>;
  /** Cambio manual de etapa (admin). */
  setStage(email: string, stage: LeadStage): Promise<void>;
  setNotes(email: string, notes: string): Promise<void>;
  assign(email: string, memberId: string | null): Promise<void>;
}
