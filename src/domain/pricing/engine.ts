/**
 * Motor de precios — puro y determinista. Reemplaza al `quote()` legacy, pero
 * las tarifas/volumen/add-ons son DATOS inyectados (RatePlan), no constantes.
 * Server-authoritative: este resultado es la verdad del monto a cobrar.
 */
import { netFromGrossInclusive, roundTo, taxFromGrossInclusive } from "@/src/domain/money/money";
import { err, ok, type Result } from "@/src/domain/shared/result";
import type { AddonLine, Quote, QuoteInput, RatePlan, RateTier, TierLine } from "./types";

const HOUR = 60;

/** Franja aplicable a (día, minuto); desempata por prioridad y monto. */
export function rateForSlot(plan: RatePlan, weekday: number, minute: number): RateTier | null {
  const matches = plan.tiers.filter(
    (t) => t.weekdays.includes(weekday) && minute >= t.startMinute && minute < t.endMinute,
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.priority - a.priority || b.amount - a.amount);
  return matches[0];
}

/** Descuento por volumen según horas totales (mayor umbral aplicable). */
export function volumePctFor(plan: RatePlan, hours: number): number {
  return plan.volumeDiscounts
    .filter((v) => hours >= v.minHours)
    .reduce((max, v) => Math.max(max, v.pct), 0);
}

export function quote(plan: RatePlan, input: QuoteInput): Result<Quote, string> {
  const { weekday, startMinute, durationHours } = input;
  if (!Number.isInteger(durationHours) || durationHours < plan.minHours) {
    return err(`duración inválida (mínimo ${plan.minHours}h, bloques de 1h)`);
  }

  // Suma por franja, hora a hora.
  const byTier = new Map<string, TierLine>();
  let roomSubtotal = 0;
  for (let i = 0; i < durationHours; i++) {
    const minute = startMinute + i * HOUR;
    const tier = rateForSlot(plan, weekday, minute);
    if (!tier) return err(`sin tarifa para el minuto ${minute} (día ${weekday})`);
    roomSubtotal += tier.amount;
    const line = byTier.get(tier.key) ?? { key: tier.key, hours: 0, rate: tier.amount, subtotal: 0 };
    line.hours += 1;
    line.subtotal += tier.amount;
    byTier.set(tier.key, line);
  }

  // Add-ons (no entran al descuento por volumen). 'per_hour' escala con la duración
  // (p. ej. la sesión 1:1 guiada: tarifa/hora × horas); el resto es monto fijo.
  const addonLines: AddonLine[] = [];
  for (const key of input.addonKeys ?? []) {
    const a = plan.addons.find((x) => x.key === key);
    if (!a) return err(`add-on desconocido: ${key}`);
    const amount = a.kind === "per_hour" ? a.amount * durationHours : a.amount;
    addonLines.push({ key: a.key, name: a.name, amount });
  }
  const addonsTotal = addonLines.reduce((s, a) => s + a.amount, 0);

  const volumePct = volumePctFor(plan, durationHours);
  const discountExact = roomSubtotal * volumePct; // exacto; el total se redondea al final
  const total = roundTo(roomSubtotal - discountExact + addonsTotal, plan.roundingIncrement);
  const net = netFromGrossInclusive(total, plan.taxPct);
  const tax = taxFromGrossInclusive(total, plan.taxPct);

  return ok({
    tierLines: [...byTier.values()],
    addonLines,
    roomSubtotal,
    volumePct,
    discount: Math.round(discountExact),
    addonsTotal,
    total,
    net,
    tax,
    endMinute: startMinute + durationHours * HOUR,
  });
}
