import { formatCLP } from "@/src/domain/money/money";
import { hourlyRates, peakLegend } from "@/src/domain/pricing/slot-rates";
import type { RateTier } from "@/src/domain/pricing/types";
import { hourCells, type StartDay } from "@/src/domain/scheduling/day-starts";
import { hhmm } from "../format";

/**
 * Grilla de horas del día: cada celda es una hora de apertura con su precio por hora (oro
 * en la tarifa más alta). Se tacha solo lo OCUPADO (reservado o ya pasado); una hora libre
 * donde el bloque elegido no cabe queda deshabilitada pero sin tachar. Con un inicio
 * elegido, la celda de inicio va sólida y las horas que cubre, tintadas y con su precio.
 */
export default function TimeGrid({
  day,
  tiers,
  duration,
  selectedStart,
  onSelect,
}: {
  day: StartDay;
  tiers: RateTier[];
  duration: number;
  selectedStart: number | null;
  onSelect: (minute: number) => void;
}) {
  if (day.closed) {
    return <p className="text-sm text-[var(--text-muted)]">La sala no abre ese día. Elige otro.</p>;
  }
  const rates = new Map(hourlyRates(tiers, day.weekday, day.openMinute, day.closeMinute).map((r) => [r.minute, r]));
  const legend = peakLegend(tiers, day.weekday, day.openMinute, day.closeMinute);
  const cells = hourCells(day, duration);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[13px] text-[var(--text-secondary)]">
          Inicio · bloques de {duration}h · precio por hora, IVA incluido
        </span>
        <div className="ds-mono flex gap-3.5 text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          {legend && (
            <span className="flex items-center gap-1.5">
              <i aria-hidden="true" className="inline-block size-2 rounded-[2px] bg-[var(--gold)]" />
              {legend}
            </span>
          )}
          <span className="line-through">Ocupado</span>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
        {cells.map((c) => {
          const r = rates.get(c.minute);
          const isStart = c.minute === selectedStart;
          const covered =
            selectedStart !== null && c.minute > selectedStart && c.minute < selectedStart + duration * 60;
          const price = !c.occupied && r?.amount != null ? formatCLP(r.amount) : "—";
          const label = c.occupied
            ? `${hhmm(c.minute)}, ocupado`
            : c.startable
              ? `${hhmm(c.minute)}, ${price} por hora${r?.peak ? ", tarifa alta" : ""}`
              : `${hhmm(c.minute)}, libre, pero un bloque de ${duration}h no cabe desde aquí`;
          const tone = isStart
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--text-inverse)]"
            : covered
              ? "border-[var(--accent)] bg-[rgba(255,77,29,0.25)]"
              : c.occupied
                ? "border-[var(--border-subtle)] bg-transparent text-[var(--grey-500)] line-through"
                : c.startable
                  ? "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] opacity-60";
          const priceTone = isStart
            ? "text-[var(--text-inverse)]"
            : c.occupied
              ? "text-[var(--grey-500)]"
              : r?.peak
                ? "text-[var(--gold)]"
                : "text-[var(--text-muted)]";
          return (
            <button
              key={c.minute}
              type="button"
              onClick={() => onSelect(c.minute)}
              disabled={!c.startable}
              aria-pressed={isStart}
              aria-label={label}
              className={`ds-mono flex h-[58px] flex-col items-center justify-center gap-[3px] rounded-[6px] border text-[13px] transition-colors disabled:cursor-default ${tone}`}
            >
              <span>{hhmm(c.minute)}</span>
              <span className={`text-[10px] ${priceTone}`}>{price}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
