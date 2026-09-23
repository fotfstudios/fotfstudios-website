/**
 * Caso de uso de las guías gratis: pedirlas y descargarlas.
 *
 * Dos puertas de entrada comparten esta lógica: el route público (POST) y la página de
 * descarga (GET con token). Sin IO propio: el repositorio, el bucket, el correo y el
 * catálogo entran por puertos, así se prueba con fakes y cada adapter con su itest.
 */
import type { GuideLeadInput } from "@/src/domain/guide/lead";
import type {
  GuideCatalog,
  GuideEmailCopy,
  GuideFileStore,
  GuideLeadRepository,
} from "@/src/application/ports/guide";

/**
 * Vida de la URL firmada. Corta a propósito: el artefacto durable es el link del correo,
 * que firma una URL nueva en cada clic.
 */
export const GUIDE_DOWNLOAD_TTL_S = 120;

/** Token hex de 48 emitido por la DB (`guide_leads.download_token`). */
const TOKEN_RE = /^[0-9a-f]{48}$/;

export interface GuideNotifier {
  notifyGuideLead(v: { email: string; token: string; copy: GuideEmailCopy; landingPath: string }): Promise<void>;
}

export type GuideDownload =
  | { kind: "not_found" }
  | { kind: "unavailable"; guide: string }
  | { kind: "ok"; url: string; guide: string };

export class GuideService {
  constructor(
    private readonly leads: GuideLeadRepository,
    private readonly files: GuideFileStore,
    private readonly notifier: GuideNotifier,
    private readonly catalog: GuideCatalog,
  ) {}

  /**
   * Guarda (o re-pide) y manda el correo con el link. Si el correo falla, el error se
   * propaga a propósito: acá el correo ES el producto, no un aviso best-effort. El lead
   * ya quedó guardado y reintentar es idempotente (mismo token).
   */
  async request(input: GuideLeadInput): Promise<{ isNew: boolean }> {
    const copy = this.catalog.emailCopy(input.guide);
    const landingPath = this.catalog.landingPath(input.guide);
    // El route ya validó la guía contra el registro: acá sería una invariante rota.
    if (!copy || !landingPath) throw new Error(`guía desconocida: ${input.guide}`);
    const lead = await this.leads.request(input);
    await this.notifier.notifyGuideLead({ email: input.email, token: lead.token, copy, landingPath });
    return { isNew: lead.isNew };
  }

  /** Resuelve el link del correo a una URL firmada de corta vida (o por qué no). */
  async resolveDownload(token: string): Promise<GuideDownload> {
    if (!TOKEN_RE.test(token)) return { kind: "not_found" };
    const lead = await this.leads.touchDownload(token);
    if (!lead) return { kind: "not_found" };
    // Guía retirada del registro con leads vivos: el token es válido, el PDF ya no está.
    const object = this.catalog.pdfObject(lead.guideSlug);
    if (!object) return { kind: "unavailable", guide: lead.guideSlug };
    const url = await this.files.signedDownloadUrl(object, GUIDE_DOWNLOAD_TTL_S);
    return url ? { kind: "ok", url, guide: lead.guideSlug } : { kind: "unavailable", guide: lead.guideSlug };
  }
}
