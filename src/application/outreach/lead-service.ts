import type { LeadsRepository, LeadUpsertInput, TouchKind } from "@/src/application/ports/outreach";
import type { LeadStage } from "@/src/domain/outreach/pipeline";

/**
 * Fachada del CRM para las vías de captación y el admin. Toda captación es BEST-EFFORT: el
 * `lead_upsert` nunca debe tumbar la entrega de la guía / el alta del newsletter / la solicitud;
 * el route la llama tras su escritura principal y envuelve la falla (como `enqueueWa`).
 */
export class LeadService {
  constructor(private readonly repo: LeadsRepository) {}

  /** Captación: alta/actualización de ficha + toque; opcionalmente inscribe en nurture (opt-in). */
  async capture(input: LeadUpsertInput, enroll?: { source: string }): Promise<void> {
    await this.repo.upsert(input);
    if (enroll) await this.repo.enroll(input.email, enroll.source);
  }

  /** Pago confirmado (reserva o curso): ficha + toque y avance automático a 'ganado'. */
  async won(email: string, source: string, kind: TouchKind): Promise<void> {
    await this.repo.upsert({ email, source, kind });
    await this.repo.advance(email, "ganado");
  }

  /** Baja por token (desde /baja). Devuelve el correo o null si el token no existe. */
  unsubscribe(token: string): Promise<string | null> {
    return this.repo.unsubscribe(token);
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  setStage(email: string, stage: LeadStage): Promise<void> {
    return this.repo.setStage(email, stage);
  }
  setNotes(email: string, notes: string): Promise<void> {
    return this.repo.setNotes(email, notes);
  }
  assign(email: string, memberId: string | null): Promise<void> {
    return this.repo.assign(email, memberId);
  }
  /** Alta manual + inscripción inmediata (el admin agrega un lead y lo mete a la secuencia). */
  enroll(email: string, source: string): Promise<void> {
    return this.repo.enroll(email, source);
  }
}
