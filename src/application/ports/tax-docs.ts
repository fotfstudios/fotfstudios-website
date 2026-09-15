import type { TaxDocRaw } from "@/src/domain/tax/tax-doc-steps";

/** Lo que el servicio de folios necesita de la persistencia (lo implementa SupabaseAdminRepository). */
export interface TaxDocRepository {
  /** Todos los documentos del pedido al que pertenece `docId`; `null` si no existe. */
  taxDocsForOrderOf(docId: string): Promise<TaxDocRaw[] | null>;
  /** Marca emitida con folio. `firstTime` fija `emitted_at`; una corrección lo conserva. */
  recordTaxDocFolio(docId: string, folio: string, firstTime: boolean): Promise<void>;
  /** Evento `boleta_emitted` / `nota_credito_emitted` en el timeline de la reserva del pedido (si tiene). */
  logTaxDocEmitted(doc: TaxDocRaw, folio: string, previousFolio: string | null, actor: string | null): Promise<void>;
}
