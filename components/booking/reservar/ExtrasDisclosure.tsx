import { useId } from "react";
import { formatCLP } from "@/src/domain/money/money";

export type Addon = { key: string; name: string; amount: number; kind: "flat_service" | "per_hour" };

const CHECK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * "Mejora la sesión · opcional": grabación (una, o ninguna) y extras por hora (guía 1:1).
 * Cerrado muestra el resumen de lo elegido y cuánto suma. Precios desde el catálogo de la DB.
 */
export default function ExtrasDisclosure({
  addons,
  rec,
  onRec,
  extras,
  onToggleExtra,
  duration,
  open,
  onToggle,
}: {
  addons: Addon[];
  rec: string;
  onRec: (key: string) => void;
  extras: string[];
  onToggleExtra: (key: string) => void;
  duration: number;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const recording = addons.filter((a) => a.kind === "flat_service");
  const hourly = addons.filter((a) => a.kind === "per_hour");
  if (recording.length + hourly.length === 0) return null;

  const chosen = [...recording.filter((a) => a.key === rec), ...hourly.filter((a) => extras.includes(a.key))];
  const added = chosen.reduce((s, a) => s + (a.kind === "per_hour" ? a.amount * duration : a.amount), 0);
  const summary = chosen.length
    ? chosen.map((a) => a.name).join(" · ")
    : [...(recording.length ? ["Grabación de audio o video"] : []), ...hourly.map((a) => a.name)].join(" · ");

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 items-center gap-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-4 text-left transition-colors hover:border-[var(--border-strong)]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="ds-eyebrow text-[var(--text-muted)]">Mejora la sesión · opcional</span>
          <span className="truncate text-sm text-[var(--text-secondary)]">{summary}</span>
        </span>
        {added > 0 && <span className="ds-mono whitespace-nowrap text-[13px]">+{formatCLP(added)}</span>}
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div id={panelId} hidden={!open} className="flex flex-col gap-2">
        {recording.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="pt-1 pb-2 text-xs text-[var(--text-muted)]">
              ¿Grabamos tu sesión? Llévate tu set listo para publicar.
            </legend>
            {[{ key: "none", name: "Sin grabación", amount: 0 }, ...recording].map((a) => (
              <label key={a.key} className="ds-option">
                <input type="radio" name="bk-rec" className="ds-sr-input" checked={rec === a.key} onChange={() => onRec(a.key)} />
                <span className="ds-option-mark ds-option-mark--radio" aria-hidden="true" />
                <span className="flex-1 text-[15px] font-medium">{a.name}</span>
                {a.amount > 0 && <span className="ds-mono whitespace-nowrap text-sm">+{formatCLP(a.amount)}</span>}
              </label>
            ))}
          </fieldset>
        )}
        {hourly.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="pt-2 pb-2 text-xs text-[var(--text-muted)]">
              ¿Sumas un guía? Un DJ te acompaña durante toda la sesión.
            </legend>
            {hourly.map((a) => (
              <label key={a.key} className="ds-option">
                <input
                  type="checkbox"
                  className="ds-sr-input"
                  checked={extras.includes(a.key)}
                  onChange={() => onToggleExtra(a.key)}
                />
                <span className="ds-option-mark ds-option-mark--check" aria-hidden="true">
                  {CHECK}
                </span>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{a.name}</span>
                  <span className="text-[13px] text-[var(--text-muted)]">Sin descuento por volumen.</span>
                </span>
                <span className="ds-mono whitespace-nowrap text-sm">+{formatCLP(a.amount)}/h</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </div>
  );
}
