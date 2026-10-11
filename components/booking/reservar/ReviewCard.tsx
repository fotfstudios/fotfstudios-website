import type { ReactNode } from "react";
import type { SummaryLine } from "@/lib/booking-summary";
import SectionHead from "./SectionHead";
import SummaryLines from "./SummaryLines";

/** Paso 3 del wizard móvil: revisa todo antes de pagar, con "Editar" que vuelve al paso. */
export default function ReviewCard({
  session,
  extras,
  contact,
  lines,
  totalLabel,
  promoNote,
  onEditTime,
  onEditData,
}: {
  session: string;
  extras: string;
  contact: string;
  lines: SummaryLine[];
  totalLabel: string;
  promoNote: ReactNode;
  onEditTime: () => void;
  onEditData: () => void;
}) {
  const row = (label: string, value: string, onEdit: () => void, mono = false) => (
    <div className="flex items-start justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <span className={`${mono ? "ds-mono" : ""} truncate text-sm`}>{value}</span>
      </span>
      <button type="button" onClick={onEdit} className="py-1 text-[13px] whitespace-nowrap text-[var(--accent)]" aria-label={`Editar ${label.toLowerCase()}`}>
        Editar
      </button>
    </div>
  );
  return (
    <section className="flex flex-col gap-3.5" aria-labelledby="bk-review-title">
      <SectionHead id="bk-review-title" title="Revisa tu reserva">
        Confirma que todo esté bien antes de pagar. Puedes editar cualquier dato desde aquí.
      </SectionHead>
      <div className="ds-card flex flex-col gap-3.5 p-5">
        {row("Sesión", session, onEditTime, true)}
        {row("Extras", extras, onEditTime)}
        {row("Tus datos", contact, onEditData, true)}
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <SummaryLines lines={lines} />
        </div>
        {promoNote}
        <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] text-[var(--text-secondary)]">Total</span>
            <span className="text-[11px] text-[var(--text-muted)]">IVA incluido</span>
          </span>
          <span className="ds-mono text-[26px]">{totalLabel}</span>
        </div>
      </div>
    </section>
  );
}
