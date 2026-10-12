/**
 * Precio por hora para la grilla de horarios de /reservar. Puro, sobre el mismo
 * `rateForSlot` del motor: la grilla muestra exactamente lo que se cobraría.
 */
import { rateForSlot } from "./engine";
import { tierLabel } from "./tier-labels";
import type { RateTier } from "./types";

export interface HourRate {
  minute: number; // inicio de la hora (minuto del día)
  amount: number | null; // CLP por hora; null si ningún tramo la cubre
  tierKey: string | null;
  /** Más cara que la tarifa más baja del plan (se pinta en oro). */
  peak: boolean;
}

const HOUR = 60;

/** Tarifa de cada hora entre apertura y cierre del día `weekday`. */
export function hourlyRates(tiers: RateTier[], weekday: number, openMinute: number, closeMinute: number): HourRate[] {
  const base = tiers.length ? Math.min(...tiers.map((t) => t.amount)) : 0;
  const out: HourRate[] = [];
  for (let m = openMinute; m < closeMinute; m += HOUR) {
    const t = rateForSlot({ tiers }, weekday, m);
    out.push({ minute: m, amount: t?.amount ?? null, tierKey: t?.key ?? null, peak: !!t && t.amount > base });
  }
  return out;
}

const hhmm = (minute: number) => `${String(Math.floor(minute / HOUR)).padStart(2, "0")}:${String(minute % HOUR).padStart(2, "0")}`;

/** Leyenda de la grilla: "Tarifa nocturna desde 17:00", "Tarifa fin de semana · todo el día" o null. */
export function peakLegend(tiers: RateTier[], weekday: number, openMinute: number, closeMinute: number): string | null {
  const rates = hourlyRates(tiers, weekday, openMinute, closeMinute);
  const firstPeak = rates.find((r) => r.peak);
  if (!firstPeak) return null;
  const name = tierLabel(firstPeak.tierKey!);
  return rates.every((r) => r.peak) ? `${name} · todo el día` : `${name} desde ${hhmm(firstPeak.minute)}`;
}
