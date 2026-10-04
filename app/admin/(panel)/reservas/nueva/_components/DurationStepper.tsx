import { fmtHours } from "@/components/admin/format";

/**
 * Duración (− / +) con la escalera de descuentos por volumen. Paso de 1 h; la
 * cortesía pasa `step={0.5}` porque admite medias horas.
 */
export function DurationStepper({
  duration,
  maxDuration,
  volumeDiscounts,
  onChange,
  step = 1,
}: {
  duration: number;
  maxDuration: number;
  volumeDiscounts: { minHours: number; pct: number }[];
  onChange: (hours: number) => void;
  step?: 0.5 | 1;
}) {
  const unit = step === 1 ? "una hora" : "media hora";
  const btnCls =
    "w-12 shrink-0 font-display text-2xl text-bone transition-colors outline-none " +
    "hover:bg-ink-soft hover:text-gold focus-visible:ring-1 focus-visible:ring-gold disabled:opacity-25";
  return (
    <div>
      <div className="flex items-stretch border hairline">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, duration - step))}
          disabled={duration <= 1}
          aria-label={`Restar ${unit}`}
          className={btnCls}
        >
          −
        </button>
        <span role="status" className="flex flex-1 items-center justify-center border-x hairline py-2.5 font-display text-2xl text-bone">
          {fmtHours(duration)}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(maxDuration, duration + step))}
          disabled={duration >= maxDuration}
          aria-label={`Sumar ${unit}`}
          className={btnCls}
        >
          +
        </button>
      </div>
      {volumeDiscounts.length > 0 && (
        <p className="label-sm mt-2.5 text-bone-quiet">
          Ahorra:{" "}
          {volumeDiscounts.map((v, i) => (
            <span key={v.minHours}>
              {i > 0 && " · "}
              <span className={duration >= v.minHours ? "text-gold" : ""}>
                {v.minHours}h −{Math.round(v.pct * 100)}%
              </span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
