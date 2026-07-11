import type { Quote } from "./types";

/** Línea de pedido priceada. Fuente única del shape (la reexporta el puerto de checkout). */
export interface OrderLine {
  line_type: "room_time" | "flat_service" | "discount";
  addon_key?: string;
  description: string;
  quantity: number;
  unit_price_clp: number;
  subtotal_clp: number;
}

/**
 * Construye las líneas de pedido a partir de una cotización (SIN canje de puntos).
 * Las líneas SUMAN exactamente el total cobrado: una línea de ajuste absorbe el
 * descuento por volumen + el redondeo. Compartido por el checkout y el reagendamiento.
 */
export function orderLinesFromQuote(quote: Quote): OrderLine[] {
  const lines: OrderLine[] = [
    ...quote.tierLines.map((l) => ({
      line_type: "room_time" as const,
      description: `Sala · ${l.hours}h (${l.key})`,
      quantity: l.hours,
      unit_price_clp: l.rate,
      subtotal_clp: l.subtotal,
    })),
    ...quote.addonLines.map((a) => ({
      line_type: "flat_service" as const,
      addon_key: a.key,
      description: a.name,
      quantity: 1,
      unit_price_clp: a.amount,
      subtotal_clp: a.amount,
    })),
  ];

  const gross = quote.tierLines.reduce((s, l) => s + l.subtotal, 0) + quote.addonsTotal;
  const adjust = quote.total - gross;
  if (adjust !== 0) {
    const label = quote.volumePct > 0 ? `Descuento por volumen (${Math.round(quote.volumePct * 100)}%)` : "Ajuste";
    lines.push({ line_type: "discount", description: label, quantity: 1, unit_price_clp: adjust, subtotal_clp: adjust });
  }
  return lines;
}
