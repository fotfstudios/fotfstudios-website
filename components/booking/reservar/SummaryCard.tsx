import type { ReactNode } from "react";
import Badge from "@/components/ds/Badge";
import Faders from "@/components/ds/Faders";
import type { SummaryLine } from "@/lib/booking-summary";
import Skeleton from "../Skeleton";
import SummaryLines from "./SummaryLines";

/** Resumen fijo de escritorio (sticky): sesión elegida, desglose, total y el CTA de pago. */
export default function SummaryCard({
  title,
  volLabel,
  dateLabel,
  rangeLabel,
  lines,
  quoting,
  totalLabel,
  promoNote,
  cta,
  error,
  under,
}: {
  title: string;
  volLabel: string | null;
  dateLabel: string | null;
  rangeLabel: string | null;
  lines: SummaryLine[];
  quoting: boolean;
  totalLabel: string;
  promoNote: ReactNode;
  cta: ReactNode;
  error: string | null;
  under: string;
}) {
  return (
    <aside aria-label="Resumen de la reserva" className="ds-card sticky top-[88px] flex flex-col gap-4 p-6 max-[859px]:hidden">
      <div className="flex items-center justify-between">
        <span className="ds-eyebrow text-[var(--text-muted)]">{title}</span>
        {volLabel && <Badge variant="gold">{volLabel}</Badge>}
      </div>
      {dateLabel && rangeLabel ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="ds-mono text-sm">{dateLabel}</span>
            <span className="ds-mono text-xl text-[var(--accent)]">{rangeLabel}</span>
          </div>
          <div className="border-t border-[var(--border-subtle)] pt-3.5">
            {quoting ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <SummaryLines lines={lines} />
            )}
          </div>
          {promoNote}
        </>
      ) : (
        <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
          <Faders size={30} color="var(--grey-700)" />
          Selecciona un horario para ver el total.
        </div>
      )}
      <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] text-[var(--text-secondary)]">Total</span>
          <span className="text-[11px] text-[var(--text-muted)]">IVA incluido</span>
        </span>
        <span className="ds-mono text-[26px]">{totalLabel}</span>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}
      {cta}
      <span className="text-center text-xs text-[var(--text-muted)]">{under}</span>
    </aside>
  );
}
