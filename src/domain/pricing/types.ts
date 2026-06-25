/**
 * Tipos del motor de precios — datos puros (desacoplados de la DB). El plan de
 * tarifas se carga desde el price book activo y se inyecta al motor.
 */

/** Una franja: cubre ciertos días y una ventana de minutos a una tarifa. */
export interface RateTier {
  key: string;
  weekdays: number[]; // 0=Dom … 6=Sáb
  startMinute: number; // minuto del día (local)
  endMinute: number;
  amount: number; // CLP entero por hora
  priority: number; // desempate cuando varias franjas calzan
}

export interface VolumeDiscount {
  minHours: number;
  pct: number; // 0..1
}

export interface AddonDef {
  key: string;
  name: string;
  amount: number; // CLP entero, monto fijo
}

/** Plan de tarifas resuelto para un recurso (una versión del price book). */
export interface RatePlan {
  currency: string;
  taxMode: "inclusive" | "exclusive";
  taxPct: number; // p.ej. 0.19
  roundingIncrement: number; // p.ej. 10
  minHours: number;
  tiers: RateTier[];
  volumeDiscounts: VolumeDiscount[];
  addons: AddonDef[];
}

export interface QuoteInput {
  weekday: number; // 0..6
  startMinute: number; // minuto del día
  durationHours: number; // bloques enteros de 1h
  addonKeys?: string[];
}

export interface TierLine {
  key: string;
  hours: number;
  rate: number;
  subtotal: number;
}

export interface AddonLine {
  key: string;
  name: string;
  amount: number;
}

export interface Quote {
  tierLines: TierLine[];
  addonLines: AddonLine[];
  roomSubtotal: number;
  volumePct: number;
  discount: number;
  addonsTotal: number;
  total: number; // bruto, IVA incluido, redondeado
  net: number;
  tax: number;
  endMinute: number;
}
