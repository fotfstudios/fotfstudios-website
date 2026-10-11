import Switch from "@/components/ds/Switch";
import { formatCLP } from "@/src/domain/money/money";
import BeatcoinsInfo from "./BeatcoinsInfo";

/**
 * Beatcoins del cliente con sesión, dentro del paso de pago (canjear es decidir cómo se
 * paga): Switch "usar el máximo aplicable" si hay saldo, cuánto suma esta reserva y qué
 * son, con enlace a sus condiciones. Con saldo 0 queda solo la parte informativa.
 */
export default function BeatcoinsBlock({
  points,
  expiryNote,
  usePoints,
  onUsePoints,
  pointsApplied,
  earn,
}: {
  points: number;
  expiryNote?: string | null;
  usePoints: boolean;
  onUsePoints: (v: boolean) => void;
  pointsApplied: number;
  earn: number | null;
}) {
  return (
    <div className="ds-card flex max-w-[760px] flex-col gap-3 px-5 py-4">
      {points > 0 ? (
        <div className="flex items-center gap-4">
          <span className="flex flex-1 flex-col gap-1">
            <span id="bk-points-label" className="text-[15px] font-medium">
              Usar mis Beatcoins
            </span>
            <span className="text-[13px] text-[var(--text-muted)]">
              Tienes <span className="ds-mono text-[var(--gold)]">{formatCLP(points)}</span> en Beatcoins. Se aplican
              después del descuento
              {usePoints && pointsApplied > 0 ? `: −${formatCLP(pointsApplied)}.` : "."}
            </span>
            {expiryNote && <span className="text-[13px] text-[var(--text-muted)]">{expiryNote}</span>}
          </span>
          <Switch aria-labelledby="bk-points-label" checked={usePoints} onChange={(e) => onUsePoints(e.target.checked)} />
        </div>
      ) : (
        <span className="text-[15px] font-medium">Tus Beatcoins</span>
      )}
      <BeatcoinsInfo earn={earn} />
    </div>
  );
}
