import { Card } from "@/components/admin/ui/Card";
import { Icon } from "@/components/admin/ui/icons";
import { Skeleton } from "@/components/admin/ui/Skeleton";
import { btn } from "@/components/admin/ui/styles";
import { tierLabel } from "@/components/booking/format";
import { formatCLP } from "@/src/domain/money/money";
import type { ManualPaymentMethod } from "@/lib/manual-booking";

export interface QuoteView {
  total: number;
  tierLines: { key: string; hours: number; rate: number; subtotal: number }[];
  addonLines: { key: string; name: string; amount: number }[];
  discount: number;
  volumePct: number;
}

const METHODS: { key: ManualPaymentMethod; label: string }[] = [
  { key: "pendiente", label: "Pendiente" },
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transferencia" },
  { key: "cortesia", label: "Cortesía" },
];

/**
 * La caja: TOTAL como ancla, desglose, método de pago y el CTA. Con cortesía
 * el total pasa a "valor cortesía" (informativo, sin cobro ni boleta).
 */
export function CobroCard({
  isCortesia,
  quote,
  quoting,
  quoteError,
  hasSelection,
  selectionLabel,
  duration,
  hourlyKeys,
  method,
  onMethod,
  warning,
  error,
  pending,
  canSubmit,
  onSubmit,
}: {
  isCortesia: boolean;
  quote: QuoteView | null;
  quoting: boolean;
  quoteError: boolean;
  hasSelection: boolean;
  selectionLabel: string | null;
  duration: number;
  hourlyKeys: Set<string>;
  method: ManualPaymentMethod;
  onMethod: (m: ManualPaymentMethod) => void;
  warning: string | null;
  error: string | null;
  pending: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const isPendiente = method === "pendiente";
  return (
    <Card title="Cobro" className="lg:sticky lg:top-8">
      <span className="label text-bone-mute">{isCortesia ? "Valor cortesía" : "Total"}</span>
      {quote ? (
        <div className={`mt-2 font-display text-5xl ${isCortesia ? "text-bone-dim" : "text-bone"}`}>
          {formatCLP(quote.total)}
        </div>
      ) : quoting ? (
        <Skeleton className="mt-3 h-12 w-40" />
      ) : quoteError && hasSelection ? (
        <div className="mt-2 font-display text-5xl text-bone-dim">—</div>
      ) : (
        <p className="mt-3 label-sm text-bone-mute">Selecciona un horario para ver el total.</p>
      )}
      {selectionLabel && <p className="mt-2 label-sm text-gold">{selectionLabel}</p>}
      {quoteError && hasSelection && (
        <p className={`mt-2 label-sm ${isCortesia ? "text-bone-mute" : "text-sirena"}`}>
          {isCortesia ? "Sin tarifa para este horario." : "No se pudo calcular el total."}
        </p>
      )}

      {quoting && (
        <ul className="mt-5 space-y-2.5 border-t hairline pt-4">
          {[0, 1].map((i) => (
            <li key={i} className="flex justify-between gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
            </li>
          ))}
        </ul>
      )}

      {quote && (
        <ul className="mt-5 space-y-2.5 border-t hairline pt-4 text-sm">
          {quote.tierLines.map((l) => (
            <li key={l.key} className="flex justify-between gap-3 text-bone-dim">
              <span>
                {tierLabel(l.key)} · {l.hours}h
              </span>
              <span className="font-mono text-bone">{formatCLP(l.subtotal)}</span>
            </li>
          ))}
          {quote.addonLines.map((a) => (
            <li key={a.key} className="flex justify-between gap-3 text-bone-dim">
              <span>
                {a.name}
                {hourlyKeys.has(a.key) ? ` · ${duration}h` : ""}
              </span>
              <span className="font-mono text-bone">{formatCLP(a.amount)}</span>
            </li>
          ))}
          {quote.discount > 0 && (
            <li className="flex justify-between gap-3 text-gold">
              <span>Descuento{quote.volumePct > 0 ? ` (${Math.round(quote.volumePct * 100)}%)` : ""}</span>
              <span className="font-mono">−{formatCLP(quote.discount)}</span>
            </li>
          )}
        </ul>
      )}

      <div className="mt-6 border-t hairline pt-5">
        <span className="label-sm text-bone-mute">Método de pago</span>
        <div role="radiogroup" aria-label="Método de pago" className="mt-2.5 grid grid-cols-4 border hairline">
          {METHODS.map((m, i) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={method === m.key}
              onClick={() => onMethod(m.key)}
              className={`px-1 py-2.5 text-center font-mono text-[0.625rem] font-medium uppercase tracking-[0.06em] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-gold ${
                i > 0 ? "border-l hairline" : ""
              } ${method === m.key ? "bg-gold text-ink" : "text-bone-dim hover:text-gold"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {warning && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-start gap-2 border border-sirena/40 bg-sirena/10 px-3 py-2.5 label-sm text-sirena"
        >
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 border border-sirena/40 bg-sirena/10 px-3 py-2.5 label-sm text-sirena">
          {error}
        </p>
      )}

      <button type="button" onClick={onSubmit} disabled={!canSubmit} className={`${btn("primary")} mt-5 w-full`}>
        {pending ? (
          <>
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent"
              aria-hidden="true"
            />
            {isCortesia ? "Registrando…" : "Creando…"}
          </>
        ) : (
          <>
            <Icon name="add" size={16} />
            {isCortesia ? "Registrar cortesía" : isPendiente ? "Crear pendiente" : "Crear reserva"}
          </>
        )}
      </button>
      <p className="label-sm mt-3 text-center text-bone-mute">
        {isCortesia
          ? "Sin cobro ni boleta."
          : isPendiente
            ? "Sin cobro ahora · se liquida después (efectivo/transferencia o link de pago)."
            : "IVA incluido · queda pagada · boleta por emitir."}
      </p>
    </Card>
  );
}
