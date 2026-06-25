/**
 * Dinero en CLP como ENTERO de pesos (sin decimales). Nunca usar float para
 * montos. El redondeo y el IVA viven aquí, como funciones nombradas y testeadas.
 */

/** Redondea al múltiplo `increment` más cercano (p.ej. $10). */
export function roundTo(amount: number, increment: number): number {
  if (increment <= 1) return Math.round(amount);
  return Math.round(amount / increment) * increment;
}

/** Monto del descuento `pct` (0..1) sobre `base`, redondeado a entero. */
export function discountAmount(base: number, pct: number): number {
  return Math.round(base * pct);
}

/** Neto a partir de un bruto IVA-incluido. */
export function netFromGrossInclusive(gross: number, taxPct: number): number {
  return Math.round(gross / (1 + taxPct));
}

/** IVA a partir de un bruto IVA-incluido. Cuadra: `net + tax === gross`. */
export function taxFromGrossInclusive(gross: number, taxPct: number): number {
  return gross - netFromGrossInclusive(gross, taxPct);
}

/** Formato es-CL: 14990 → "$14.990". */
export function formatCLP(amount: number): string {
  return "$" + Math.round(amount).toLocaleString("es-CL");
}
