import { hhmm } from "@/components/booking/format";

/** Estado visible de un inicio posible (lo computa BookingConsole). */
export interface SlotView {
  minute: number;
  tag: "ocupado" | "bloqueo" | "no alcanza" | "pasado" | null;
  disabled: boolean;
  /** Seleccionable solo como cortesía (pasado / fuera de horario) — se pinta en sirena. */
  warn: boolean;
}

/**
 * Grilla de horarios del admin: muestra TODAS las horas con su estado (el
 * público solo lista las libres). `outOfHours` aparece bajo un divisor y solo
 * llega con horas cuando el método es cortesía.
 */
export function SlotGrid({
  slots,
  outOfHours,
  selected,
  onSelect,
}: {
  slots: SlotView[];
  outOfHours: SlotView[];
  selected: number | null;
  onSelect: (minute: number) => void;
}) {
  return (
    <div className="grid max-h-[22rem] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
      {slots.map((s) => (
        <SlotButton key={s.minute} slot={s} selected={selected === s.minute} onSelect={onSelect} />
      ))}
      {outOfHours.length > 0 && (
        <p className="label-sm col-span-2 mt-2 text-bone-mute">Fuera de horario</p>
      )}
      {outOfHours.map((s) => (
        <SlotButton key={`ooh-${s.minute}`} slot={s} selected={selected === s.minute} onSelect={onSelect} />
      ))}
    </div>
  );
}

function SlotButton({
  slot,
  selected,
  onSelect,
}: {
  slot: SlotView;
  selected: boolean;
  onSelect: (minute: number) => void;
}) {
  const cls = selected
    ? "border-gold bg-gold text-ink"
    : slot.disabled
      ? "hairline text-bone-mute/40"
      : slot.warn
        ? "border-sirena/40 text-bone-dim hover:border-sirena"
        : "hairline text-bone-dim hover:border-gold hover:text-gold";
  return (
    <button
      type="button"
      disabled={slot.disabled}
      aria-pressed={selected}
      aria-label={`Inicio ${hhmm(slot.minute)}${slot.tag ? `, ${slot.tag}` : ""}`}
      onClick={() => onSelect(slot.minute)}
      className={`flex items-center justify-between gap-2 border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-gold ${cls}`}
    >
      <span className="font-mono text-sm">{hhmm(slot.minute)}</span>
      {slot.tag && (
        <span className={`label-sm ${!selected && slot.warn ? "text-sirena" : ""}`}>{slot.tag}</span>
      )}
    </button>
  );
}
