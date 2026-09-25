/**
 * El motivo de barras del logo (components/core/Faders.jsx): `f` dibuja la F de cuatro
 * barras; `meter` es un medidor de nivel, animable. Siempre decorativo.
 */
const F_WIDTHS = [1, 0.45, 0.65, 0.33];
const METER_HEIGHTS = [1, 0.55, 0.8, 0.38, 0.65, 0.9, 0.5];

export default function Faders({
  variant = "f",
  color = "var(--accent)",
  size = 48,
  bars = 5,
  animated = false,
}: {
  variant?: "f" | "meter";
  color?: string;
  size?: number;
  bars?: number;
  animated?: boolean;
}) {
  if (variant === "meter") {
    return (
      <div aria-hidden="true" style={{ display: "flex", gap: Math.max(3, size * 0.09), alignItems: "flex-end", height: size }}>
        {Array.from({ length: bars }, (_, i) => (
          <i
            key={i}
            style={{
              display: "block",
              width: Math.max(4, size * 0.17),
              height: size * METER_HEIGHTS[i % METER_HEIGHTS.length],
              background: color,
              borderRadius: 2,
              transformOrigin: "bottom",
              animation: animated
                ? `ds-level ${0.7 + (i % 3) * 0.25}s ${i * 0.13}s infinite alternate var(--ease-out)`
                : "none",
            }}
          />
        ))}
      </div>
    );
  }

  const bh = size * 0.19;
  return (
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: size * 0.08, width: size }}>
      {F_WIDTHS.map((w, i) => (
        <i
          key={i}
          style={{ display: "block", height: bh, width: `${w * 100}%`, background: color, borderRadius: Math.max(2, bh * 0.17) }}
        />
      ))}
    </div>
  );
}
