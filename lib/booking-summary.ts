/**
 * Desglose del total en /reservar (resumen de escritorio y revisión del móvil): tramos
 * con horas × tarifa, extras, y en oro los descuentos (volumen, primera reserva) y los
 * Beatcoins. Puro: sale de la cotización del servidor, no recalcula precios.
 */
import { formatCLP } from "@/src/domain/money/money";
import { checkoutTierLabel } from "@/src/domain/pricing/tier-labels";

export interface SummaryLine {
  label: string;
  value: string;
  gold: boolean;
}

export function summaryLines({
  quote,
  duration,
  hourlyKeys,
  promoLine,
  pointsApplied,
}: {
  quote: {
    tierLines: { key: string; hours: number; rate: number; subtotal: number }[];
    addonLines: { key: string; name: string; amount: number }[];
    adjust: { description: string; amount: number } | null;
  } | null;
  duration: number;
  hourlyKeys: Set<string>;
  promoLine: { description: string; amount: number } | null;
  pointsApplied: number;
}): SummaryLine[] {
  if (!quote) return [];
  const lines: SummaryLine[] = [
    ...quote.tierLines.map((l) => ({
      label: `${checkoutTierLabel(l.key)} · ${l.hours}h × ${formatCLP(l.rate)}`,
      value: formatCLP(l.subtotal),
      gold: false,
    })),
    ...quote.addonLines.map((a) => ({
      label: hourlyKeys.has(a.key) ? `${a.name} · ${duration}h` : a.name,
      value: formatCLP(a.amount),
      gold: false,
    })),
  ];
  if (quote.adjust) {
    const sign = quote.adjust.amount < 0 ? "−" : "+";
    lines.push({ label: quote.adjust.description, value: `${sign}${formatCLP(Math.abs(quote.adjust.amount))}`, gold: true });
  }
  if (promoLine) lines.push({ label: promoLine.description, value: `−${formatCLP(promoLine.amount)}`, gold: true });
  if (pointsApplied > 0) lines.push({ label: "Beatcoins", value: `−${formatCLP(pointsApplied)}`, gold: true });
  return lines;
}
