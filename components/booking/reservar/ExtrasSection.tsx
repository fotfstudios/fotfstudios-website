import { formatCLP } from "@/src/domain/money/money";
import SectionHead from "./SectionHead";

export type Addon = { key: string; name: string; amount: number; kind: "flat_service" | "per_hour" };

const CHECK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * 03 Mejora tu sesión (opcional): grabación (una, o ninguna — "Sin grabación" por defecto) y
 * extras por hora (guía 1:1). Sección propia y abierta: un desplegable escondía el upsell.
 * Precios desde el catálogo de la DB; lo elegido suma en el resumen.
 */
export default function ExtrasSection({
  n,
  addons,
  rec,
  onRec,
  extras,
  onToggleExtra,
}: {
  n?: string;
  addons: Addon[];
  rec: string;
  onRec: (key: string) => void;
  extras: string[];
  onToggleExtra: (key: string) => void;
}) {
  const recording = addons.filter((a) => a.kind === "flat_service");
  const hourly = addons.filter((a) => a.kind === "per_hour");
  if (recording.length + hourly.length === 0) return null;

  return (
    <section className="flex flex-col gap-3.5" aria-labelledby="bk-extras-title">
      <SectionHead
        id="bk-extras-title"
        n={n}
        title="Mejora tu sesión"
        aside={<span className="ds-mono text-xs text-[var(--text-muted)]">Opcional</span>}
      >
        Graba tu set o suma un guía. Se agrega a esta misma reserva.
      </SectionHead>

      {recording.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-xs text-[var(--text-muted)]">¿Grabamos tu sesión? Llévate tu set listo para publicar.</legend>
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
          <legend className="pt-2 pb-2 text-xs text-[var(--text-muted)]">¿Sumas un guía? Un DJ te acompaña durante toda la sesión.</legend>
          {hourly.map((a) => (
            <label key={a.key} className="ds-option">
              <input type="checkbox" className="ds-sr-input" checked={extras.includes(a.key)} onChange={() => onToggleExtra(a.key)} />
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
    </section>
  );
}
