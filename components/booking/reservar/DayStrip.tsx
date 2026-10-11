import type { StartDay } from "@/src/domain/scheduling/day-starts";
import { stripCell } from "@/src/domain/scheduling/day-starts";

/**
 * Tira horizontal de días (64px, scroll-snap): HOY / día de semana, número y cuántos
 * inicios caben con la duración elegida ("N hrs" en acento si quedan ≤3, LLENO, CERRADO).
 */
export default function DayStrip({
  days,
  duration,
  today,
  selected,
  onSelect,
  canExtend,
  onExtend,
  loading,
}: {
  days: StartDay[];
  duration: number;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
  canExtend: boolean;
  onExtend: () => void;
  loading: boolean;
}) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-4 pb-1.5 sm:mx-0 sm:px-0">
      {days.map((d) => {
        const c = stripCell(d, duration, today);
        const active = c.date === selected;
        return (
          <button
            key={c.date}
            type="button"
            onClick={() => onSelect(c.date)}
            disabled={c.disabled}
            aria-pressed={active}
            aria-label={`${c.dow === "HOY" ? "Hoy" : c.dow} ${c.num}: ${c.label.toLowerCase()}`}
            className={`flex w-16 shrink-0 snap-start flex-col items-center rounded-[6px] border py-2.5 transition-colors disabled:cursor-default disabled:opacity-45 ${
              active
                ? "border-[var(--accent)] bg-[rgba(255,77,29,0.06)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]"
            }`}
          >
            <span className={`text-[10px] font-light tracking-[0.2em] ${active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
              {c.dow}
            </span>
            <span className="ds-mono mt-0.5 text-lg">{c.num}</span>
            <span
              className={`ds-mono mt-1 text-[10px] ${
                c.disabled ? "text-[var(--grey-500)]" : c.low ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              }`}
            >
              {c.label}
            </span>
          </button>
        );
      })}
      {canExtend && (
        <button
          type="button"
          onClick={onExtend}
          disabled={loading}
          className="ds-mono flex w-24 shrink-0 snap-start items-center justify-center rounded-[6px] border border-dashed border-[var(--border-strong)] px-2 text-center text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-45"
        >
          {loading ? "Cargando…" : "Ver más días"}
        </button>
      )}
    </div>
  );
}
