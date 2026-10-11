import type { StartDay } from "@/src/domain/scheduling/day-starts";
import { dateShortLabel, startCountsByDuration } from "@/src/domain/scheduling/day-starts";
import SectionHead from "./SectionHead";

/** Duraciones que ofrece el checkout público (el motor y el admin aceptan más). */
export const DURATIONS = [1, 2, 3, 4];

/** 01 Duración: cuatro tarjetas con el descuento por volumen y cuántos inicios quedan ese día. */
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
  const dayName = day ? dateShortLabel(day.date).split(" ").slice(0, 2).join(" ") : "";

  return (
    <section className="flex flex-col gap-3.5" aria-labelledby="bk-duration-title">
      <SectionHead id="bk-duration-title" n={n} title="Duración">
        ¿Cuánto rato necesitas?{volumeDiscounts.length > 0 && " Desde 2 h el precio por hora baja."}
      </SectionHead>
      <div role="radiogroup" aria-labelledby="bk-duration-title" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DURATIONS.map((h) => {
          const pct = volPct(h);
          const count = counts?.[h] ?? null;
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
              <span className="ds-mono text-xs text-[var(--text-muted)]">
                {count === null ? " " : count > 0 ? `${count} ${count === 1 ? "horario" : "horarios"} el ${dayName}` : "Sin horarios ese día"}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
