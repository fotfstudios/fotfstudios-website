/**
 * Motor de precios de FOTF Studios — lógica pura, sin UI.
 *
 * Modelo dinámico: tres franjas horarias + descuento por volumen + add-ons.
 * Precios en CLP, IVA incluido. Trabaja en slots de 30 min: cada medio bloque
 * se cobra a la tarifa de su franja, así los cruces de franja y el split del
 * viernes salen solos. Total redondeado a $10.
 */

// 0 = Domingo … 6 = Sábado (igual que Date.getDay)
export const DAYS = [
  { key: "dom", label: "Domingo", short: "Dom" },
  { key: "lun", label: "Lunes", short: "Lun" },
  { key: "mar", label: "Martes", short: "Mar" },
  { key: "mie", label: "Miércoles", short: "Mié" },
  { key: "jue", label: "Jueves", short: "Jue" },
  { key: "vie", label: "Viernes", short: "Vie" },
  { key: "sab", label: "Sábado", short: "Sáb" },
] as const;

/** Apertura/cierre por día (hora decimal 24h). */
export const OPENING: Record<number, [number, number]> = {
  0: [9, 22], // Dom
  1: [9, 22], // Lun
  2: [9, 22], // Mar
  3: [9, 22], // Mié
  4: [9, 22], // Jue
  5: [9, 23], // Vie
  6: [9, 23], // Sáb
};

export type TierKey = "valle" | "puntaSemana" | "puntaFinde";

export const RATES: Record<TierKey, number> = {
  valle: 9990,
  puntaSemana: 14990,
  puntaFinde: 19990,
};

/** Tabla de referencia para la UI. */
export const TIERS: {
  key: TierKey;
  name: string;
  when: string;
  rate: number;
}[] = [
  {
    key: "valle",
    name: "Valle",
    when: "Lun–Vie · apertura → 17:00",
    rate: RATES.valle,
  },
  {
    key: "puntaSemana",
    name: "Punta semana",
    when: "Lun–Jue · 17:00 → cierre",
    rate: RATES.puntaSemana,
  },
  {
    key: "puntaFinde",
    name: "Punta finde",
    when: "Vie 17:00 → Dom cierre",
    rate: RATES.puntaFinde,
  },
];

/** Escalera de descuento por volumen, de mayor a menor umbral. */
export const VOLUME: { minHours: number; off: number }[] = [
  { minHours: 4, off: 0.2 },
  { minHours: 3, off: 0.15 },
  { minHours: 2, off: 0.1 },
];

export const ADDONS = {
  audio: { key: "audio", name: "Grabación de audio", price: 9990 },
  audioVideo: {
    key: "audioVideo",
    name: "Grabación audio + video",
    price: 49990,
  },
} as const;

export const BOOKING = {
  minHours: 1,
  stepHours: 1,
  ivaIncluded: true,
  roundTo: 10,
  peakStart: 17, // toda franja "punta" arranca a las 17:00
} as const;

/** Tarifa del slot que empieza en (día, hora). */
export function rateAt(day: number, hour: number): number {
  // Fin de semana: Vie desde 17:00, todo Sáb, todo Dom → punta finde
  const isWeekendPeak =
    (day === 5 && hour >= BOOKING.peakStart) || day === 6 || day === 0;
  if (isWeekendPeak) return RATES.puntaFinde;

  // Lun–Jue 17:00+ → punta semana
  if (day >= 1 && day <= 4 && hour >= BOOKING.peakStart)
    return RATES.puntaSemana;

  // Resto (Lun–Vie hasta 17:00) → valle
  return RATES.valle;
}

/** Descuento por volumen según horas totales de sesión. */
export function volumePct(hours: number): number {
  for (const tier of VOLUME) {
    if (hours >= tier.minHours) return tier.off;
  }
  return 0;
}

function roundTo(n: number, to = BOOKING.roundTo): number {
  return Math.round(n / to) * to;
}

/** Horas de inicio válidas para un día (deja al menos `minHours` antes del cierre). */
export function startOptions(day: number): number[] {
  const [open, close] = OPENING[day];
  const out: number[] = [];
  for (
    let h = open;
    h <= close - BOOKING.minHours + 1e-9;
    h += BOOKING.stepHours
  ) {
    out.push(Math.round(h * 2) / 2);
  }
  return out;
}

/** Duración máxima reservable desde un inicio dado (hasta el cierre). */
export function maxHours(day: number, start: number): number {
  const [, close] = OPENING[day];
  return Math.max(BOOKING.minHours, Math.round((close - start) * 2) / 2);
}

export interface QuoteInput {
  day: number;
  start: number;
  hours: number;
  coachHours?: number;
  audio?: boolean;
  audioVideo?: boolean;
}

export interface TierLine {
  key: TierKey;
  hours: number;
  rate: number;
  subtotal: number;
}

export interface Quote {
  roomSubtotal: number;
  coachSubtotal: number;
  volumePct: number;
  discount: number;
  addonsFlat: number;
  total: number;
  tierLines: TierLine[];
  addonLines: { name: string; amount: number }[];
  end: number;
}

/** Suma por franjas el costo de `hours` horas desde (day, start), en slots de 30 min. */
function sumSlots(day: number, start: number, hours: number) {
  const slots = Math.round(hours / BOOKING.stepHours);
  const byTier = new Map<
    TierKey,
    { hours: number; rate: number; subtotal: number }
  >();
  let subtotal = 0;
  for (let i = 0; i < slots; i++) {
    const hour = start + i * BOOKING.stepHours;
    const rate = rateAt(day, hour);
    const key = (
      rate === RATES.puntaFinde
        ? "puntaFinde"
        : rate === RATES.puntaSemana
          ? "puntaSemana"
          : "valle"
    ) as TierKey;
    const slotCost = rate * BOOKING.stepHours; // medio bloque
    subtotal += slotCost;
    const cur = byTier.get(key) ?? { hours: 0, rate, subtotal: 0 };
    cur.hours += BOOKING.stepHours;
    cur.subtotal += slotCost;
    byTier.set(key, cur);
  }
  return { subtotal, byTier };
}

/** Cotización completa de una sesión. */
export function quote(input: QuoteInput): Quote {
  const { day, start, hours } = input;
  const coachHours = Math.min(input.coachHours ?? 0, hours);

  const room = sumSlots(day, start, hours);
  const coach =
    coachHours > 0
      ? sumSlots(day, start, coachHours)
      : { subtotal: 0, byTier: new Map() };

  const pct = volumePct(hours);
  const discountableBase = room.subtotal + coach.subtotal;
  const discount = discountableBase * pct;

  const audio = input.audioVideo
    ? ADDONS.audioVideo.price
    : input.audio
      ? ADDONS.audio.price
      : 0;

  const total = roundTo(discountableBase - discount + audio);

  const tierLines: TierLine[] = TIERS.filter((t) => room.byTier.has(t.key)).map(
    (t) => {
      const v = room.byTier.get(t.key)!;
      return { key: t.key, hours: v.hours, rate: v.rate, subtotal: v.subtotal };
    },
  );

  const addonLines: { name: string; amount: number }[] = [];
  if (coachHours > 0)
    addonLines.push({
      name: `1:1 guiado · ${formatDuration(coachHours)}`,
      amount: coach.subtotal,
    });
  if (input.audioVideo)
    addonLines.push({
      name: ADDONS.audioVideo.name,
      amount: ADDONS.audioVideo.price,
    });
  else if (input.audio)
    addonLines.push({ name: ADDONS.audio.name, amount: ADDONS.audio.price });

  return {
    roomSubtotal: room.subtotal,
    coachSubtotal: coach.subtotal,
    volumePct: pct,
    discount,
    addonsFlat: audio,
    total,
    tierLines,
    addonLines,
    end: start + hours,
  };
}

/** $14.990 — separador de miles con punto (es-CL). */
export function formatCLP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

/** 1 → "1h" · 1.5 → "1h 30min" */
export function formatDuration(h: number): string {
  const whole = Math.floor(h);
  const half = h - whole >= 0.5;
  if (whole === 0) return "30min";
  return half ? `${whole}h 30min` : `${whole}h`;
}

/** 9 → "09:00" · 17.5 → "17:30" */
export function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = h - hh >= 0.5 ? "30" : "00";
  return `${String(hh).padStart(2, "0")}:${mm}`;
}

/** Forma larga, pluralizada: 1 → "1 hora" · 3 → "3 horas" · 1.5 → "1,5 horas" */
export function formatHoras(h: number): string {
  const num = Number.isInteger(h) ? String(h) : String(h).replace(".", ",");
  return `${num} ${h === 1 ? "hora" : "horas"}`;
}

/** Forma corta con espacio para el desglose: 3 → "3 h" · 1.5 → "1,5 h" */
function horasCortas(h: number): string {
  return `${Number.isInteger(h) ? String(h) : String(h).replace(".", ",")} h`;
}

function recLabel(input: QuoteInput, capitalized: boolean): string | null {
  if (input.audioVideo) return `${capitalized ? "G" : "g"}rabación de audio + video`;
  if (input.audio) return `${capitalized ? "G" : "g"}rabación de audio`;
  return null;
}

/**
 * Mensaje de reserva para WhatsApp — saludo, campos rotulados y desglose itemizado.
 * Termina en el total (Instagram/email se piden al confirmar, no aquí).
 */
export function bookingMessage(input: QuoteInput, q: Quote): string {
  const { day, start, hours } = input;
  const coachHours = Math.min(input.coachHours ?? 0, hours);
  const hasCoach = coachHours > 0;

  // Marcadores de formato de WhatsApp
  const bold = (s: string) => `*${s}*`;
  const mono = (s: string) => "`" + s + "`";
  const money = (n: number) => mono(formatCLP(n));

  // Resumen de extras (línea humana)
  const extras: string[] = [];
  if (hasCoach) extras.push(`1:1 guiado (${formatHoras(coachHours)})`);
  const recExtra = recLabel(input, false);
  if (recExtra) extras.push(recExtra);

  // Desglose itemizado — montos en monoespaciado
  const detalle: string[] = [];
  for (const line of q.tierLines) {
    const name = TIERS.find((t) => t.key === line.key)?.name ?? line.key;
    detalle.push(
      `- Sala ${horasCortas(line.hours)} (${name}, ${money(line.rate)}/h): ${money(line.subtotal)}`
    );
  }
  if (hasCoach) {
    detalle.push(`- 1:1 guiado ${horasCortas(coachHours)}: ${money(q.coachSubtotal)}`);
  }
  if (q.volumePct > 0) {
    detalle.push(
      `- Descuento por volumen (${Math.round(q.volumePct * 100)}%): ${mono("−" + formatCLP(q.discount))}`
    );
  }
  const recDetalle = recLabel(input, true);
  if (recDetalle) detalle.push(`- ${recDetalle}: ${money(q.addonsFlat)}`);

  const lines: string[] = [
    `Hola ${bold("FOTF Studios")}. Quiero reservar una sesión en la sala de ensayo de DJ:`,
    "",
    `${bold("Día y hora:")} ${DAYS[day].label} ${formatHour(start)}-${formatHour(q.end)}`,
    `${bold("Duración:")} ${formatHoras(hours)}`,
  ];
  if (extras.length) lines.push(`${bold("Extras:")} ${extras.join(", ")}`);
  lines.push(
    "",
    bold("Detalle"),
    ...detalle,
    "",
    `${bold("Total estimado (IVA incl.):")} ${money(q.total)}`
  );

  return lines.join("\n");
}
