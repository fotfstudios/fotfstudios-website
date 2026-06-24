/**
 * FOTF — Imagotipo oficial (SVG real desde /public/logo).
 * Variantes: lockup (barras + OTF + STUDIOS) · mini (barras + OTF) · icono (barras).
 * Color por defecto gold sobre Ink (uso de todos los días, según el manual).
 */

type Variant = "lockup" | "mini" | "icon";
type Color = "gold" | "cream" | "black" | "deepblack" | "grey" | "orange";

export default function Logo({
  variant = "lockup",
  color = "gold",
  height = 32,
  className = "",
  title = "FOTF Studios",
}: {
  variant?: Variant;
  color?: Color;
  /** altura renderizada del logo en px (el SVG es cuadrado, ancho = alto) */
  height?: number;
  className?: string;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/logo/fotf-${variant}-${color}.svg`}
      alt={title}
      height={height}
      width={height}
      draggable={false}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
