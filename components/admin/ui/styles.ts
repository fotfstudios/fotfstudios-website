/** Clases compartidas del sistema de admin (dark, hairline, Gold acento, Sirena urgencia). */

export type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
export type BtnSize = "sm" | "md";

const VARIANT: Record<BtnVariant, string> = {
  primary: "bg-gold text-ink hover:bg-gold-deep",
  secondary: "border hairline text-bone hover:border-gold hover:text-gold",
  danger: "border border-sirena/40 text-sirena hover:bg-sirena hover:text-ink",
  ghost: "text-bone-quiet hover:text-gold",
};

const SIZE: Record<BtnSize, string> = {
  sm: "px-3 py-1.5 label-sm",
  md: "px-5 py-2.5 label",
};

export function btn(variant: BtnVariant = "primary", size: BtnSize = "md"): string {
  return [
    "inline-flex items-center justify-center gap-2 transition-colors",
    "outline-none focus-visible:ring-1 focus-visible:ring-gold",
    "disabled:opacity-40 disabled:pointer-events-none",
    VARIANT[variant],
    SIZE[size],
  ].join(" ");
}

/**
 * Input/select/textarea del admin. Borde ink-edge (3.3:1) y no hairline (1.2:1): el
 * límite de un control de formulario tiene que verse sin hover ni foco (WCAG 1.4.11).
 * Deshabilitado se VE deshabilitado (texto quiet, borde line, fondo soft): un campo
 * de solo lectura idéntico al editable invita a escribir donde no se puede.
 */
export const inputCls =
  "w-full border border-ink-edge bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors " +
  "placeholder:text-bone-quiet hover:border-gold/60 focus-visible:border-gold " +
  "disabled:cursor-not-allowed disabled:border-ink-line disabled:bg-ink-soft disabled:text-bone-quiet disabled:hover:border-ink-line";
