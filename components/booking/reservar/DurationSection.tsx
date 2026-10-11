import type { StartDay } from "@/src/domain/scheduling/day-starts";
import { startCountsByDuration } from "@/src/domain/scheduling/day-starts";
import SectionHead from "./SectionHead";

/** Duraciones que ofrece el checkout público (el motor y el admin aceptan más). */
export const DURATIONS = [1, 2, 3, 4];

/**
 * 01 Duración: cuatro tarjetas con el descuento por volumen. No revela cuántos horarios
 * quedan (decisión del dueño); solo avisa cuando esa duración no cabe en el día elegido.
 */
export default function DurationSection({
  n,
  duration,
  onPick,
  day,
  volumeDiscounts,
}: {
  n?: string;
  duration: number;
  onPick: (hours: number) => void;
  day: StartDay | null;
  volumeDiscounts: { minHours: number; pct: number }[];
}) {
  const counts = day ? startCountsByDuration(day, DURATIONS) : null;
  const volPct = (h: number) =>
    volumeDiscounts.filter((v) => h >= v.minHours).reduce((max, v) => Math.max(max, v.pct), 0);

  return (
    <section className="flex flex-col gap-3.5" aria-labelledby="bk-duration-title">
      <SectionHead id="bk-duration-title" n={n} title="Duración">
        ¿Cuánto rato necesitas?{volumeDiscounts.length > 0 && " Desde 2 h el precio por hora baja."}
      </SectionHead>
      <div role="radiogroup" aria-labelledby="bk-duration-title" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DURATIONS.map((h) => {
          const pct = volPct(h);
          return (
            <label key={h} className="ds-option ds-option--stack">
              <input
                type="radio"
                name="bk-duration"
                className="ds-sr-input"
                checked={duration === h}
                onChange={() => onPick(h)}
              />
              <span className="flex items-center justify-between gap-1.5">
                <span className="ds-mono text-lg">{h}h</span>
                {pct > 0 && <span className="ds-badge ds-badge--gold">−{Math.round(pct * 100)}%</span>}
              </span>
              {counts?.[h] === 0 && <span className="ds-mono text-xs text-[var(--text-muted)]">Sin horarios ese día</span>}
            </label>
          );
        })}
      </div>
    </section>
  );
}
