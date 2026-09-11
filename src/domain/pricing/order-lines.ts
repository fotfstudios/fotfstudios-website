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

/** Glosa exacta de la línea de canje (la escribe el checkout). */
const POINTS_LINE = "Canje de puntos";

/** Concesión rescatada de un pedido: pesos positivos + la glosa que la explicaba. */
export interface CarriedConcession {
  amount: number;
  description: string;
}

/**
 * Ajuste que el motor mete en su propia línea de descuento (volumen + redondeo).
 * Es exactamente lo que hace `orderLinesFromQuote`, expuesto aparte para poder
 * RECONOCER esa línea entre las de un pedido ya guardado.
 */
export function engineAdjustFor(quote: Pick<Quote, "tierLines" | "addonsTotal" | "total">): number {
  const gross = quote.tierLines.reduce((s, l) => s + l.subtotal, 0) + quote.addonsTotal;
  return quote.total - gross;
}

/**
 * Rescata de un pedido la concesión que decidió una persona (el descuento manual
 * del staff), separándola de las que calcula el motor.
 *
 * Se lee de las LÍNEAS y no de `pricing_snapshot − amount_clp`, que parece
 * equivalente y no lo es: `reschedule_down` suma a `refunded_amount_clp` y deja
 * `amount_clp` intacto mientras reemplaza el snapshot, así que después de un
 * reagendamiento hacia abajo esa resta da cualquier cosa. Las líneas, en cambio,
 * las reescriben juntas todas las rutas de reagendamiento desde la misma llamada
 * y siempre suman el efectivo vigente.
 *
 * El snapshot se usa solo para identificar la línea del motor por su monto. Sin
 * snapshot no se puede distinguir, y se devuelve 0 — el comportamiento previo.
 */
export function concessionFromLines(
  // `line_type` llega como string desde la DB (la columna es text, no un enum),
  // así que el shape es deliberadamente laxo: lo satisfacen `OrderLine` y la fila.
  lines: { line_type: string; description: string; subtotal_clp: number }[],
  quote: Pick<Quote, "tierLines" | "addonsTotal" | "total"> | null,
): CarriedConcession {
  const none: CarriedConcession = { amount: 0, description: "" };
  if (!quote) return none;

  const engineAdjust = engineAdjustFor(quote);
  let engineSeen = engineAdjust === 0;
  const kept: typeof lines = [];
  for (const l of lines) {
    if (l.line_type !== "discount") continue;
    if (l.description === POINTS_LINE) continue;
    // Una sola línea del motor por pedido, y se reconoce por su monto exacto.
    if (!engineSeen && l.subtotal_clp === engineAdjust) {
      engineSeen = true;
      continue;
    }
    kept.push(l);
  }

  const amount = -kept.reduce((s, l) => s + l.subtotal_clp, 0);
  if (amount <= 0) return none;
  return { amount, description: kept.map((l) => l.description).join(" · ") };
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

  // Misma fuente que `concessionFromLines` usa para reconocer esta línea después:
  // si las dos se calcularan por separado podrían desalinearse en silencio.
  const adjust = engineAdjustFor(quote);
  if (adjust !== 0) {
    const label = quote.volumePct > 0 ? `Descuento por volumen (${Math.round(quote.volumePct * 100)}%)` : "Ajuste";
    lines.push({ line_type: "discount", description: label, quantity: 1, unit_price_clp: adjust, subtotal_clp: adjust });
  }
  return lines;
}
