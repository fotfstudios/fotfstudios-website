import { Input, Select } from "@/components/admin/ui/Field";
import { formatCLP } from "@/src/domain/money/money";
import type { DiscountMode } from "@/src/domain/pricing/manual-discount";

/** Una base descontable del quote actual: sala, un add-on, o el total. */
export interface DiscountOption {
  /** "room" · "total" · "addon:<key>" */
  key: string;
  label: string;
  amount: number;
}

const MODES: { key: DiscountMode; label: string }[] = [
  { key: "pct", label: "%" },
  { key: "amount", label: "$" },
];

/**
 * Descuento manual del staff. Se digita la INTENCIÓN (sobre qué, %, o pesos); el
 * monto lo recalcula el servidor contra su propio quote al crear la reserva —
 * acá solo se previsualiza con la misma función pura.
 */
export function DiscountPicker({
  on,
  onToggle,
  options,
  target,
  onTarget,
  mode,
  onMode,
  value,
  onValue,
  reason,
  onReason,
  amount,
  error,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  options: DiscountOption[];
  target: string;
  onTarget: (key: string) => void;
  mode: DiscountMode;
  onMode: (m: DiscountMode) => void;
  value: string;
  onValue: (v: string) => void;
  reason: string;
  onReason: (v: string) => void;
  /** Pesos que se descontarán, ya calculados; null si aún no hay valor válido. */
  amount: number | null;
  error: string | null;
}) {
  return (
    <div className="mt-6 border-t hairline pt-5">
      <label className="flex items-center gap-2.5 text-bone-dim">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-gold"
        />
        <span className="label-sm">Aplicar descuento</span>
      </label>

      {on && (
        <div className="mt-3.5 flex flex-col gap-2.5">
          <Select value={target} onChange={(e) => onTarget(e.target.value)} aria-label="Sobre qué se descuenta">
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label} · {formatCLP(o.amount)}
              </option>
            ))}
          </Select>

          <div className="flex gap-2.5">
            <div role="radiogroup" aria-label="Tipo de descuento" className="grid shrink-0 grid-cols-2 border hairline">
              {MODES.map((m, i) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.key}
                  onClick={() => onMode(m.key)}
                  className={`w-10 py-2.5 text-center font-mono text-xs font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-gold ${
                    i > 0 ? "border-l hairline" : ""
                  } ${mode === m.key ? "bg-gold text-ink" : "text-bone-dim hover:text-gold"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Input
              type="text"
              inputMode="numeric"
              value={value}
              onChange={(e) => onValue(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={mode === "pct" ? "20" : "7994"}
              aria-label={mode === "pct" ? "Porcentaje de descuento" : "Monto del descuento en pesos"}
            />
          </div>

          <Input
            type="text"
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            maxLength={60}
            placeholder="Motivo (aparece en la boleta)"
            aria-label="Motivo del descuento"
          />

          {error ? (
            <p role="alert" className="label-sm text-sirena">
              {error}
            </p>
          ) : (
            amount !== null && (
              <p className="label-sm text-bone-mute">
                Se descontarán <span className="font-mono text-gold">{formatCLP(amount)}</span>.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
