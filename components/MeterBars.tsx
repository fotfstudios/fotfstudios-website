/**
 * Elemento decorativo: un VU/ecualizador en movimiento.
 * NO es el logo — el logo nunca se anima ni se redibuja.
 * Esto es ambiente de cabina: barras de nivel, sonido en movimiento.
 */
export default function MeterBars({
  className = "",
  color = "var(--color-gold)",
  bars = 4,
}: {
  className?: string;
  color?: string;
  bars?: number;
}) {
  const anims = ["meter-1", "meter-2", "meter-3", "meter-4"];
  return (
    <span
      className={className}
      aria-hidden
      style={{ display: "inline-flex", alignItems: "flex-end", gap: "0.22em", height: "1em" }}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          style={{
            width: "0.2em",
            height: "100%",
            background: color,
            transformOrigin: "bottom",
            borderRadius: "0.04em",
            animation: `var(--animate-${anims[i % anims.length]})`,
            animationDelay: `${(i % anims.length) * 0.12}s`,
          }}
        />
      ))}
    </span>
  );
}
