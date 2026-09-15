import { DateTime } from "luxon";
import { formatCLP } from "@/src/domain/money/money";

/**
 * Cada fila de `tax_documents` traducida al PASO que el dueño tiene que hacer en
 * sii.cl. El modelo de datos ya sigue el procedimiento del SII para boletas
 * electrónicas (guías F1345/F1346/F1347-2025): no se modifica el monto de una
 * boleta — para bajar se anula con nota de crédito (NC) y se reemite por el saldo;
 * para subir se emite otra boleta. Acá solo se DESCRIBE esa cadena; nada se decide.
 *
 * Reglas que este módulo hace explícitas (y testeables, sin I/O):
 *  - Una NC no se puede emitir hasta que la boleta que anula tenga folio → `bloqueada`.
 *  - Una boleta con `is_live = false` está `anulada`, tenga o no folio la NC.
 *  - Una boleta pendiente Y anulada sigue `por_emitir` (el SII espera ambas), con nota.
 *  - Boleta creada en la MISMA transacción que una NC del pedido = boleta de saldo
 *    (`created_at` idéntico: now() es constante dentro de la tx).
 *  - Boleta financiada por otra orden (`settlement_order_id ≠ order_id`) = delta.
 *  - `atrasada` solo si sigue pendiente y nació en un mes calendario anterior
 *    (America/Santiago): período ya declarado → rectificar F29.
 */

const TZ = "America/Santiago";
export const MAX_FOLIO_LEN = 12;

export type TaxDocKind = "boleta" | "nota_credito";
export type TaxDocStatus = "pendiente" | "emitida";

/** Fila de `tax_documents` con las columnas que la UI necesita (espejo 1:1 del esquema). */
export interface TaxDocRaw {
  id: string;
  orderId: string;
  kind: TaxDocKind;
  status: TaxDocStatus;
  folio: string | null;
  neto: number;
  iva: number;
  total: number;
  createdAt: string;
  emittedAt: string | null;
  /** NC: la boleta que anula (`reverses_document_id`). */
  reversesDocumentId: string | null;
  /** Boleta: sigue viva (`reversed_clp < total`). Una NC siempre es `false`. */
  isLive: boolean;
  /** Boleta: qué orden (su pago) la financia. `null` en NC. */
  settlementOrderId: string | null;
}

export type TaxDocStepState = "por_emitir" | "bloqueada" | "emitida" | "anulada";
export type TaxDocRole = "pago" | "delta" | "saldo" | "nc";

export interface TaxDocStep {
  id: string;
  orderId: string;
  kind: TaxDocKind;
  state: TaxDocStepState;
  role: TaxDocRole;
  total: number;
  neto: number;
  iva: number;
  folio: string | null;
  createdAt: string;
  emittedAt: string | null;
  /** NC: folio de la boleta que anula (`null` si esa boleta sigue pendiente). */
  parentFolio: string | null;
  /** NC: total de la boleta que anula (`null` si no se pudo resolver). */
  parentTotal: number | null;
  /** Boleta anulada: folio de la NC que la anula (`null` si la NC sigue pendiente). */
  reversedByFolio: string | null;
  /** Boleta anulada por una NC que aún no tiene folio. */
  reversedByPending: boolean;
  /** Boleta de saldo: folio de la boleta anulada en la misma tx (`null` si pendiente). */
  saldoOfFolio: string | null;
  saldoOfTotal: number | null;
  /** NC por emitir: texto sugerido para "razón de referencia" del formulario del SII. */
  razonReferencia: string | null;
  ageDays: number;
  atrasada: boolean;
  /** Aviso corto cuando el paso tiene una trampa (boleta pendiente ya anulada). */
  note: string | null;
  /** Se puede registrar/corregir folio (todo salvo `bloqueada`). */
  canRecord: boolean;
}

/** Mensaje de bloqueo compartido: el guard real (`TaxDocService`) y la copia estática (`step-copy`). */
export const blockedNcMessage = (parentTotal: number) => `Primero registra el folio de la boleta de ${formatCLP(parentTotal)}.`;

export function parseFolio(raw: string): { ok: true; folio: string } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: false, error: "Ingresa el folio que asignó el SII." };
  if (!new RegExp(`^\\d{1,${MAX_FOLIO_LEN}}$`).test(s)) {
    return { ok: false, error: `El folio es un número (solo dígitos, hasta ${MAX_FOLIO_LEN}).` };
  }
  return { ok: true, folio: s };
}

const byChrono = (a: TaxDocRaw, b: TaxDocRaw) => {
  const chrono = a.createdAt.localeCompare(b.createdAt);
  if (chrono !== 0) return chrono;
  // When createdAt is the same, nota_credito comes before boleta
  if (a.kind !== b.kind) return a.kind === "nota_credito" ? -1 : 1;
  return a.id.localeCompare(b.id);
};

export function describeTaxDocs(docs: TaxDocRaw[], opts: { now: string }): TaxDocStep[] {
  const sorted = [...docs].sort(byChrono);
  const byId = new Map(sorted.map((d) => [d.id, d]));
  const now = DateTime.fromISO(opts.now).setZone(TZ);
  const nowMonth = now.startOf("month");

  // Boleta → la NC que la anula. Una boleta se anula a lo más una vez (las RPC siempre
  // reversan el monto vivo completo), así que el mapa es 1:1.
  const ncByParent = new Map<string, TaxDocRaw>();
  for (const d of sorted) if (d.kind === "nota_credito" && d.reversesDocumentId) ncByParent.set(d.reversesDocumentId, d);

  const sameTxNcs = (d: TaxDocRaw) =>
    sorted.filter((x) => x.kind === "nota_credito" && x.orderId === d.orderId && x.createdAt === d.createdAt);

  /** Boleta padre de una NC: el vínculo duro, o (legacy sin vínculo) la primera boleta emitida del mismo total. */
  const parentOf = (nc: TaxDocRaw): TaxDocRaw | null => {
    if (nc.reversesDocumentId) return byId.get(nc.reversesDocumentId) ?? null;
    return sorted.find((x) => x.kind === "boleta" && x.orderId === nc.orderId && x.total === nc.total && x.status === "emitida") ?? null;
  };

  return sorted.map((d): TaxDocStep => {
    const created = DateTime.fromISO(d.createdAt).setZone(TZ);
    const ageDays = Math.max(0, Math.floor(now.diff(created, "days").days));
    const atrasada = d.status === "pendiente" && created.startOf("month") < nowMonth;
    const base = {
      id: d.id, orderId: d.orderId, kind: d.kind, total: d.total, neto: d.neto, iva: d.iva,
      folio: d.folio, createdAt: d.createdAt, emittedAt: d.emittedAt,
      parentFolio: null, parentTotal: null, reversedByFolio: null, reversedByPending: false,
      saldoOfFolio: null, saldoOfTotal: null, razonReferencia: null, ageDays, atrasada, note: null,
    };

    if (d.kind === "nota_credito") {
      const parent = parentOf(d);
      const state: TaxDocStepState =
        d.status === "emitida" ? "emitida" : parent && !parent.folio ? "bloqueada" : "por_emitir";
      const parentSett = parent?.settlementOrderId ?? null;
      const hasSaldoTwin = sorted.some(
        (x) =>
          x.kind === "boleta" &&
          x.orderId === d.orderId &&
          x.createdAt === d.createdAt &&
          (parentSett === null || x.settlementOrderId === parentSett),
      );
      const razon =
        state === "por_emitir"
          ? `${parent?.folio ? `Anula boleta N° ${parent.folio}.` : "Anula boleta de este pedido."} ${hasSaldoTwin ? "Reembolso parcial: se reemite boleta por el saldo." : "Anulación total."}`
          : null;
      return { ...base, state, role: "nc", parentFolio: parent?.folio ?? null, parentTotal: parent?.total ?? null, razonReferencia: razon, canRecord: state !== "bloqueada" };
    }

    // Boleta
    const reversedBy = ncByParent.get(d.id) ?? null;
    const twins = sameTxNcs(d);
    const role: TaxDocRole =
      d.settlementOrderId && d.settlementOrderId !== d.orderId && twins.length === 0 ? "delta" : twins.length > 0 ? "saldo" : "pago";
    // Saldo: qué boleta reemplaza. Con varias NC en la misma tx, la que anuló una boleta
    // financiada por el MISMO pago que este saldo (create_boleta_amount(…, v_setts[i])).
    let saldoOf: TaxDocRaw | null = null;
    if (role === "saldo") {
      const parents = twins.map((nc) => parentOf(nc)).filter((p): p is TaxDocRaw => !!p);
      saldoOf = parents.find((p) => p.settlementOrderId === d.settlementOrderId) ?? parents[0] ?? null;
    }
    const state: TaxDocStepState = d.status === "pendiente" ? "por_emitir" : d.isLive ? "emitida" : "anulada";
    const note =
      d.status === "pendiente" && !d.isLive
        ? "Ya está anulada por una nota de crédito: igual hay que emitirla en el SII y después la nota de crédito."
        : null;
    return {
      ...base, state, role,
      reversedByFolio: reversedBy?.folio ?? null,
      reversedByPending: !!reversedBy && !reversedBy.folio,
      saldoOfFolio: saldoOf?.folio ?? null,
      saldoOfTotal: saldoOf?.total ?? null,
      note,
      canRecord: true,
    };
  });
}
