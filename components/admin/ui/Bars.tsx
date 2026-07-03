/**
 * Bar chart SVG de UNA serie — server-safe (sin hooks) y sin dependencias.
 * Specs dataviz: barras finas gold sobre Ink, gap 2px, data-ends redondeados
 * anclados a la línea base, ejes/grid recesivos (hairline/bone-mute), labels
 * selectivos (primero, máximo y último), tooltip nativo por barra (<title>),
 * `role="img"` + aria-label. Una serie → sin leyenda (el título de la Card
 * nombra la serie). El texto usa tokens bone, nunca el color de la serie.
 */
const W = 720;
const H = 180;
const PAD_BOTTOM = 22;
const PAD_TOP = 14;

export function Bars({
  data,
  format,
  ariaLabel,
}: {
  data: { label: string; value: number }[];
  format: (v: number) => string;
  ariaLabel: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const gap = 2;
  const barW = Math.max(2, (W - gap * (data.length - 1)) / data.length);
  const maxIdx = data.findIndex((d) => d.value === Math.max(...data.map((x) => x.value)));
  // Labels selectivos: primero, máximo y último (sin colisiones en rangos densos).
  const labelIdx = new Set([0, maxIdx, data.length - 1]);
  const showXLabel = (i: number) =>
    data.length <= 10 || i === 0 || i === data.length - 1 || i === maxIdx;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* línea base recesiva */}
      <line x1="0" y1={H - PAD_BOTTOM} x2={W} y2={H - PAD_BOTTOM} stroke="var(--color-ink-line)" strokeWidth="1" />
      {data.map((d, i) => {
        const h = d.value <= 0 ? 0 : Math.max(2, (d.value / max) * innerH);
        const x = i * (barW + gap);
        const y = H - PAD_BOTTOM - h;
        return (
          <g key={i}>
            {/* data-end redondeado arriba, anclado a baseline (rect con clip inferior) */}
            <path
              d={`M ${x} ${H - PAD_BOTTOM}
                  L ${x} ${y + 2}
                  Q ${x} ${y} ${x + 2} ${y}
                  L ${x + barW - 2} ${y}
                  Q ${x + barW} ${y} ${x + barW} ${y + 2}
                  L ${x + barW} ${H - PAD_BOTTOM} Z`}
              fill="var(--color-gold)"
              opacity={d.value > 0 ? 1 : 0}
            />
            {/* hit target + tooltip nativo por barra */}
            <rect x={x} y={PAD_TOP} width={barW + gap} height={H - PAD_TOP - PAD_BOTTOM} fill="transparent">
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
            {labelIdx.has(i) && d.value > 0 && (
              <text
                x={x + barW / 2}
                y={y - 5}
                textAnchor="middle"
                fill="var(--color-bone)"
                style={{ font: "600 11px ui-monospace, monospace" }}
              >
                {format(d.value)}
              </text>
            )}
            {showXLabel(i) && (
              <text
                x={x + barW / 2}
                y={H - 7}
                textAnchor="middle"
                fill="var(--color-bone-mute)"
                style={{ font: "10px ui-monospace, monospace" }}
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
