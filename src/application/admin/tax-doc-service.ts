import type { TaxDocRepository } from "@/src/application/ports/tax-docs";
import { blockedNcMessage, describeTaxDocs, parseFolio } from "@/src/domain/tax/tax-doc-steps";

/**
 * Registrar el folio que el SII asignó a un documento. La app NO emite nada: el
 * dueño emite en sii.cl y acá se anota el folio. El guard real vive acá (no en el
 * input deshabilitado): una NC cuya boleta sigue sin folio se rechaza porque el
 * SII no puede referenciarla todavía.
 */
export class TaxDocService {
  constructor(private readonly repo: TaxDocRepository) {}

  async recordFolio(docId: string, rawFolio: string, actor: string | null): Promise<{ corrected: boolean }> {
    const parsed = parseFolio(rawFolio);
    if (!parsed.ok) throw new Error(parsed.error);

    const docs = await this.repo.taxDocsForOrderOf(docId);
    const doc = docs?.find((d) => d.id === docId);
    if (!docs || !doc) throw new Error("Documento no encontrado.");

    const step = describeTaxDocs(docs, { now: new Date().toISOString() }).find((s) => s.id === docId)!;
    if (step.state === "bloqueada") {
      throw new Error(blockedNcMessage(step.parentTotal ?? 0));
    }
    const previous = doc.folio;
    if (previous === parsed.folio) return { corrected: false };

    await this.repo.recordTaxDocFolio(docId, parsed.folio, previous === null);
    // Best-effort, NO throw: el folio ya quedó guardado; un fallo del log solo deja un
    // hueco en el timeline (mismo criterio que la cortesía en admin-repository).
    await this.repo.logTaxDocEmitted(doc, parsed.folio, previous, actor).catch((e) => console.error("[taxdoc:event]", e));
    return { corrected: previous !== null };
  }
}
