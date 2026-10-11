import type { ConfirmationView } from "@/lib/confirmation";
import { SITE } from "@/lib/site";
import Skeleton from "../Skeleton";

/**
 * Tarjeta de la sesión (también el comprobante que se imprime): número, fecha, horario,
 * lugar, desglose y total. Sin email ni teléfono: la URL es compartible.
 */
export default function SessionCard({
  view,
  number,
  totalTitle,
  skeleton = false,
  actions,
}: {
  view: ConfirmationView;
  number: string;
  totalTitle: string;
  skeleton?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <section aria-label="Tu sesión" className="ds-card flex flex-col gap-3.5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="ds-eyebrow text-[var(--text-muted)]">Tu sesión</span>
        <span className="ds-mono text-xs tracking-[0.1em] text-[var(--text-muted)]">N° {number}</span>
      </div>
      {view.dateLong ? (
        <div className="flex flex-col gap-1">
          <span className="text-lg">{view.dateLong}</span>
          <span className="ds-mono text-[15px] text-[var(--accent)]">
            {view.timeRange?.replace("–", " – ")}
            {view.durationLabel ? ` · ${view.durationLabel}` : ""}
          </span>
          <span className="text-[13px] text-[var(--text-muted)]">
            {view.resourceName ?? "Sala de ensayo DJ"} · {SITE.address}
          </span>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3.5 text-[13px]">
        {skeleton ? (
          <>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </>
        ) : (
          view.lines.map((l) => (
            <div key={l.description} className="flex justify-between gap-3 text-[var(--text-secondary)]">
              <span>{l.description}</span>
              <span className="ds-mono whitespace-nowrap">{l.amount}</span>
            </div>
          ))
        )}
      </div>
      <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] text-[var(--text-secondary)]">{totalTitle}</span>
          <span className="text-[11px] text-[var(--text-muted)]">IVA incluido</span>
        </span>
        <span className="ds-mono text-[26px]">{skeleton ? "—" : view.total}</span>
      </div>
      {actions && <div className="ds-no-print flex flex-wrap gap-2.5 border-t border-[var(--border-subtle)] pt-3.5">{actions}</div>}
    </section>
  );
}
