/** Barra de porcentaje para celdas de tabla: track hairline + fill gold + valor mono. */
export function MeterCell({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-24 shrink-0 border hairline bg-ink" aria-hidden>
        <div className="h-full bg-gold" style={{ width: `${clamped}%` }} />
      </div>
      <span className="font-mono text-sm text-bone">{label}</span>
    </div>
  );
}
