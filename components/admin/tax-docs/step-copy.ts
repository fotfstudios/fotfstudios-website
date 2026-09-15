import { fmtDate } from "@/components/admin/format";
import { formatCLP } from "@/src/domain/money/money";
import { blockedNcMessage, type TaxDocStep } from "@/src/domain/tax/tax-doc-steps";

/** Copy de cada paso SII en la voz del dueño. Puro: la fila y la cola lo comparten. */

const ago = (d: number) => (d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`);

export function stepTitle(s: TaxDocStep): string {
  const clp = formatCLP(s.total);
  if (s.kind === "nota_credito") return s.state === "por_emitir" || s.state === "bloqueada" ? `Emitir nota de crédito por ${clp}` : `Nota de crédito ${clp}`;
  return s.state === "por_emitir" ? `Emitir boleta afecta por ${clp}` : `Boleta ${clp}`;
}

export function stepDetail(s: TaxDocStep): string | null {
  if (s.kind === "nota_credito") {
    if (s.state === "bloqueada") return blockedNcMessage(s.parentTotal ?? 0);
    if (s.parentFolio) return `Anula la boleta folio ${s.parentFolio}.`;
    return `Anula una boleta de ${formatCLP(s.parentTotal ?? s.total)} de este pedido (sin vínculo).`;
  }
  if (s.state === "anulada") {
    return s.reversedByFolio ? `Anulada por nota de crédito folio ${s.reversedByFolio}.` : "Anulada por una nota de crédito aún por emitir.";
  }
  if (s.role === "delta") return "Cobro adicional por reagendamiento.";
  if (s.role === "saldo") {
    return s.saldoOfFolio
      ? `Saldo tras anular la boleta folio ${s.saldoOfFolio}.`
      : `Saldo tras anular la boleta de ${formatCLP(s.saldoOfTotal ?? 0)} (aún sin folio).`;
  }
  return null;
}

/** Neto e IVA del documento (el SII los calcula solo; acá son para cotejar). */
export function stepAmounts(s: TaxDocStep): string {
  return `Neto ${formatCLP(s.neto)} · IVA ${formatCLP(s.iva)}`;
}

/** Cuándo nació el paso: una boleta se "paga", una NC se "genera". */
export function stepWhen(s: TaxDocStep): string {
  const verb = s.kind === "boleta" ? "pagada" : "generada";
  return `${verb} el ${fmtDate(s.createdAt)} (${ago(s.ageDays)})`;
}

export function stepMeta(s: TaxDocStep): string {
  if (s.state === "emitida" || (s.state === "anulada" && s.folio)) {
    return `Folio ${s.folio}${s.emittedAt ? ` · emitida el ${fmtDate(s.emittedAt)}` : ""}`;
  }
  return `${stepAmounts(s)} · ${stepWhen(s)}`;
}

// ── Copy compacto para la tabla de la cola (/admin/sii) ─────────────────────
// Una celda por dato: el tipo va en "Documento", el vínculo en "Referencia". Sin
// punto final: son etiquetas, no frases.

export function stepKindLabel(s: TaxDocStep): string {
  if (s.kind === "nota_credito") return "Nota de crédito";
  if (s.role === "saldo") return "Boleta afecta · saldo";
  if (s.role === "delta") return "Boleta afecta · delta";
  return "Boleta afecta";
}

export function stepReference(s: TaxDocStep): string | null {
  if (s.kind === "nota_credito") {
    if (s.parentFolio) return `Anula la boleta folio ${s.parentFolio}`;
    if (s.parentTotal != null && s.state === "bloqueada") return `Anula la boleta de ${formatCLP(s.parentTotal)} (sin folio aún)`;
    return `Anula una boleta de ${formatCLP(s.parentTotal ?? s.total)} (sin vínculo)`;
  }
  if (s.role === "delta") return "Cobro adicional por reagendamiento";
  if (s.role === "saldo") {
    return s.saldoOfFolio
      ? `Saldo de la boleta folio ${s.saldoOfFolio}`
      : `Saldo de la boleta de ${formatCLP(s.saldoOfTotal ?? 0)} (sin folio aún)`;
  }
  return null;
}
