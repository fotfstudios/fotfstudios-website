/**
 * KPI tile del admin (promovido del dashboard "Hoy"). `delta` opcional muestra
 * la variación vs el período anterior: positivo en gold, negativo en bone-dim
 * (sirena queda reservada a urgencia real, no a "bajó una métrica").
 */
export function Stat({
  label,
  value,
  accent,
  delta,
}: {
  label: string;
  value: string;
  accent?: boolean;
  delta?: { pct: number } | null;
}) {
  return (
    <div className="border hairline bg-ink/40 p-5">
      <p className="label-sm text-bone-mute">{label}</p>
      <p className={`font-display mt-2 text-4xl ${accent ? "text-gold" : "text-bone"}`}>{value}</p>
      {delta != null && (
        <p className={`label-sm mt-2 ${delta.pct >= 0 ? "text-gold" : "text-bone-dim"}`}>
          {delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct).toFixed(Math.abs(delta.pct) < 10 ? 1 : 0)}%
          <span className="text-bone-mute"> vs anterior</span>
        </p>
      )}
    </div>
  );
}
