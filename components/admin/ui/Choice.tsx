"use client";

/**
 * Selector segmentado de una opción (tipo, ¿ya pagó?, método…). Radios NATIVOS
 * escondidos tras un botón visual: el navegador da gratis las flechas entre opciones,
 * el foco y el envío en un <form> (name/value), y el lector de pantalla anuncia el
 * grupo por su <legend>. Reemplaza los grupos `role="radio"` hechos a mano.
 */
export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
  disabled?: boolean;
}

const COLS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as const;
const TEXT = { xs: "px-1 text-[0.625rem]", sm: "px-3 text-xs" } as const;

export function Choice<V extends string>({
  name,
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  size = "sm",
  className = "",
  optionClassName = "",
}: {
  /** Nombre del grupo de radios (y del campo si va dentro de un <form>). */
  name: string;
  legend: string;
  /** La leyenda solo para lectores de pantalla (cuando el contexto ya la dice). */
  hideLegend?: boolean;
  options: ChoiceOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  size?: keyof typeof TEXT;
  /** Clases extra del contenedor de opciones (p. ej. `shrink-0`). */
  className?: string;
  /** Clases extra de cada opción (p. ej. un ancho fijo). */
  optionClassName?: string;
}) {
  const cols = COLS[options.length as keyof typeof COLS] ?? "grid-cols-2";
  return (
    <fieldset className="min-w-0">
      <legend className={hideLegend ? "sr-only" : "label-sm text-bone-quiet"}>{legend}</legend>
      <div className={`grid ${cols} border border-ink-edge ${hideLegend ? "" : "mt-2.5"} ${className}`}>
        {options.map((o, i) => (
          <label key={o.value} className={`relative flex ${i > 0 ? "border-l border-ink-edge" : ""}`}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={`flex w-full cursor-pointer items-center justify-center py-2.5 text-center font-mono font-medium uppercase tracking-[0.06em] text-bone-dim transition-colors hover:text-gold peer-checked:bg-gold peer-checked:text-ink peer-focus-visible:ring-1 peer-focus-visible:ring-inset peer-focus-visible:ring-gold peer-disabled:cursor-not-allowed peer-disabled:opacity-40 peer-disabled:hover:text-bone-dim ${TEXT[size]} ${optionClassName}`}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
