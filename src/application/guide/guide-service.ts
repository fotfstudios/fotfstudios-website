/**
 * Caso de uso de la Guía de iniciación al DJing (/guia-dj): pedirla y descargarla.
 *
 * Dos puertas de entrada comparten esta lógica: el route público (POST) y la página de
 * descarga (GET con token). Sin IO propio: el repositorio, el bucket y el correo entran
 * por puertos, así se prueba con fakes y cada adapter se prueba solo con su itest.
 */
import type { GuideLeadInput } from "@/src/domain/guide/lead";
import type { GuideFileStore, GuideLeadRepository } from "@/src/application/ports/guide";

/** Nombre exacto del objeto en el bucket `guias` (se sube a mano, ver DEPLOY.md § 8). */
export const GUIDE_PDF_OBJECT = "guia-iniciacion-djing.pdf";

/**
 * Vida de la URL firmada. Corta a propósito: el artefacto durable es el link del correo
 * (`/guia-dj/descarga/<token>`), que firma una URL nueva en cada clic.
 */
export const GUIDE_DOWNLOAD_TTL_S = 120;

/** Token hex de 48 emitido por la DB (`guide_leads.download_token`). */
const TOKEN_RE = /^[0-9a-f]{48}$/;

export interface GuideNotifier {
  notifyGuideLead(v: { email: string; token: string }): Promise<void>;
}

export type GuideDownload = { kind: "not_found" } | { kind: "unavailable" } | { kind: "ok"; url: string };

export class GuideService {
  constructor(
    private readonly leads: GuideLeadRepository,
    private readonly files: GuideFileStore,
    private readonly notifier: GuideNotifier,
  ) {}

  /**
   * Guarda (o re-pide) y manda el correo con el link. Si el correo falla, el error se
   * propaga a propósito: acá el correo ES el producto, no un aviso best-effort. El lead
   * ya quedó guardado y reintentar es idempotente (mismo token).
   */
  async request(input: GuideLeadInput): Promise<{ isNew: boolean }> {
    const lead = await this.leads.request(input);
    await this.notifier.notifyGuideLead({ email: input.email, token: lead.token });
    return { isNew: lead.isNew };
  }

  /** Resuelve el link del correo a una URL firmada de corta vida (o por qué no). */
  async resolveDownload(token: string): Promise<GuideDownload> {
    if (!TOKEN_RE.test(token)) return { kind: "not_found" };
    const known = await this.leads.touchDownload(token);
    if (!known) return { kind: "not_found" };
    const url = await this.files.signedDownloadUrl(GUIDE_PDF_OBJECT, GUIDE_DOWNLOAD_TTL_S);
    return url ? { kind: "ok", url } : { kind: "unavailable" };
  }
}
