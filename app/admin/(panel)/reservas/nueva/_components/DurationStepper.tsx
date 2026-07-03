/** Duración en horas enteras (− / +) con la escalera de descuentos por volumen. */
export function DurationStepper({
  duration,
  maxDuration,
  volumeDiscounts,
  onChange,
}: {
  duration: number;
  maxDuration: number;
  volumeDiscounts: { minHours: number; pct: number }[];
  onChange: (hours: number) => void;
}) {
  const btnCls =
    "w-12 shrink-0 font-display text-2xl text-bone transition-colors outline-none " +
    "hover:bg-ink-soft hover:text-gold focus-visible:ring-1 focus-visible:ring-gold disabled:opacity-25";
  return (
    <div>
      <div className="flex items-stretch border hairline">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, duration - 1))}
          disabled={duration <= 1}
          aria-label="Restar una hora"
          className={btnCls}
        >
          −
        </button>
        <span role="status" className="flex flex-1 items-center justify-center border-x hairline py-2.5 font-display text-2xl text-bone">
          {duration}h
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(maxDuration, duration + 1))}
          disabled={duration >= maxDuration}
          aria-label="Sumar una hora"
          className={btnCls}
        >
          +
        </button>
      </div>
      {volumeDiscounts.length > 0 && (
        <p className="label-sm mt-2.5 text-bone-mute">
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
