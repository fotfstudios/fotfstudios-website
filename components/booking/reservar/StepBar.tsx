/** Barra de pasos del wizard móvil: 01 Horario · 02 Datos · 03 Pagar. Se vuelve a un paso hecho. */
export const STEPS = ["Horario", "Datos", "Pagar"] as const;

export default function StepBar({ current, onGo }: { current: number; onGo: (step: number) => void }) {
  return (
    <ol className="flex gap-1.5" aria-label="Pasos de la reserva">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onGo(i)}
              disabled={!done}
              aria-current={active ? "step" : undefined}
              className="flex w-full flex-col gap-2 text-left disabled:cursor-default"
            >
              <span className={`block h-1 rounded-[2px] transition-colors ${done || active ? "bg-[var(--accent)]" : "bg-[var(--grey-700)]"}`} />
              <span
                className={`ds-mono truncate text-[11px] uppercase tracking-[0.12em] ${
                  active ? "text-[var(--text-primary)]" : done ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
                }`}
              >
                0{i + 1} {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
