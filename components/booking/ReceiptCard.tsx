import type { ConfirmationView } from "@/lib/confirmation";
import Skeleton from "@/components/booking/Skeleton";

/**
 * Recibo de la reserva — el "ticket" de la sesión. Presentacional y server-safe.
 * Espeja el resumen del checkout (BookingWidget) y el email de confirmación:
 * fecha → sala → líneas → total con "IVA incluido". `skeleton` replica la
 * estructura mientras el pago se confirma.
 */
export default function ReceiptCard({
  view,
  skeleton = false,
}: {
  view: ConfirmationView;
  skeleton?: boolean;
}) {
  if (skeleton) {
    return (
      <div className="border hairline p-6 md:p-8">
        <span className="label-sm text-bone-mute">Tu sesión</span>
        <div className="mt-4 space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <div className="mt-6 space-y-2.5 border-t hairline pt-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="mt-6 flex items-end justify-between border-t hairline pt-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="border hairline p-6 md:p-8">
      <span className="label-sm text-bone-mute">Tu sesión</span>

      {view.when && (
        <div className="mt-4">
          <p className="text-lg text-bone">{view.when}</p>
          {view.timeRange && (
            <p className="mt-1 label-sm text-gold">
              {view.timeRange}
              {view.durationLabel ? ` · ${view.durationLabel}` : ""}
            </p>
          )}
          {view.resourceName && <p className="mt-1 text-sm text-bone-dim">{view.resourceName}</p>}
        </div>
      )}

      {view.lines.length > 0 && (
        <ul className="mt-6 space-y-2.5 border-t hairline pt-5 text-sm">
          {view.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 text-bone-dim">
              <span>{l.description}</span>
              <span className="font-mono text-bone">{l.amount}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-end justify-between gap-3 border-t hairline pt-5">
        <span className="label text-bone-mute">Total</span>
        <div className="text-right">
          <div className="font-display text-bone" style={{ fontSize: "clamp(1.8rem,5vw,2.6rem)" }}>
            {view.total}
          </div>
          <div className="label-sm text-bone-mute">IVA incluido</div>
        </div>
      </div>
    </div>
  );
}
