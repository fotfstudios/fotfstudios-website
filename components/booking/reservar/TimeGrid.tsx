import { formatCLP } from "@/src/domain/money/money";
import { hourlyRates, peakLegend } from "@/src/domain/pricing/slot-rates";
import type { RateTier } from "@/src/domain/pricing/types";
import type { StartDay } from "@/src/domain/scheduling/day-starts";
import { hhmm } from "../format";

/**
 * Grilla de horas del día: cada celda es una hora de apertura con su precio por hora
 * (oro en punta). Solo se puede tocar un inicio donde cabe la duración completa; el resto
 * va tachado. Con un inicio elegido, la celda de inicio va sólida y las horas cubiertas,
 * tintadas.
 */
export default function TimeGrid({
  day,
  tiers,
  starts,
  duration,
  selectedStart,
  onSelect,
}: {
  day: StartDay;
  tiers: RateTier[];
  starts: number[];
  duration: number;
  selectedStart: number | null;
  onSelect: (minute: number) => void;
}) {
  if (day.closed) {
    return <p className="text-sm text-[var(--text-muted)]">La sala no abre ese día. Elige otro.</p>;
  }
  const rates = hourlyRates(tiers, day.weekday, day.openMinute, day.closeMinute);
  const legend = peakLegend(tiers, day.weekday, day.openMinute, day.closeMinute);

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
          <span className="line-through">No disponible</span>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
        {rates.map((r) => {
          const ok = starts.includes(r.minute);
          const isStart = r.minute === selectedStart;
          const covered = selectedStart !== null && r.minute > selectedStart && r.minute < selectedStart + duration * 60;
          const price = ok && r.amount !== null ? formatCLP(r.amount) : "—";
          return (
            <button
              key={r.minute}
              type="button"
              onClick={() => onSelect(r.minute)}
              disabled={!ok}
              aria-pressed={isStart}
              aria-label={ok ? `${hhmm(r.minute)}, ${price} por hora${r.peak ? ", punta" : ""}` : `${hhmm(r.minute)}, no disponible`}
              className={`ds-mono flex h-[58px] flex-col items-center justify-center gap-[3px] rounded-[6px] border text-[13px] transition-colors disabled:cursor-default ${
                isStart
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--text-inverse)]"
                  : covered
                    ? "border-[var(--accent)] bg-[rgba(255,77,29,0.25)]"
                    : ok
                      ? "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]"
                      : "border-[var(--border-subtle)] bg-transparent text-[var(--grey-500)] line-through"
              }`}
            >
              <span>{hhmm(r.minute)}</span>
              <span
                className={`text-[10px] ${
                  isStart
                    ? "text-[var(--text-inverse)]"
                    : !ok
                      ? "text-[var(--grey-500)]"
                      : r.peak
                        ? "text-[var(--gold)]"
                        : "text-[var(--text-muted)]"
                }`}
              >
                {price}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
