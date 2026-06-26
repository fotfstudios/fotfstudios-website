/** Clases compartidas del sistema de admin (dark, hairline, Gold acento, Sirena urgencia). */

export type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
export type BtnSize = "sm" | "md";

const VARIANT: Record<BtnVariant, string> = {
  primary: "bg-gold text-ink hover:bg-gold-deep",
  secondary: "border hairline text-bone hover:border-gold hover:text-gold",
  danger: "border border-sirena/40 text-sirena hover:bg-sirena hover:text-ink",
  ghost: "text-bone-mute hover:text-gold",
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

/** Input/select/textarea del admin. */
export const inputCls =
  "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors " +
  "placeholder:text-bone-mute hover:border-gold/60 focus-visible:border-gold";
