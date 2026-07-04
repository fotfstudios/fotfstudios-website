import Link from "next/link";
import { Icon } from "@/components/admin/ui/icons";
import {
  agendaHref,
  rangeLabel,
  shiftAnchor,
  type AgendaQuery,
  type AgendaView,
} from "@/src/domain/admin/agenda";

const VIEWS: { key: AgendaView; label: string }[] = [
  { key: "dia", label: "Día" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
];

const UNIT: Record<AgendaView, string> = { dia: "Día", semana: "Semana", mes: "Mes" };

/** Barra del calendario: selector de vista + etiqueta del rango + navegación ‹ Hoy ›. */
export function AgendaHeader({ query, today }: { query: AgendaQuery; today: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <nav aria-label="Vista del calendario" className="flex divide-x divide-ink-line border hairline">
        {VIEWS.map((v) => {
          const active = query.view === v.key;
          return (
            <Link
              key={v.key}
              href={agendaHref(query, { view: v.key }, today)}
              aria-current={active ? "page" : undefined}
              className={`label-sm px-3 py-2.5 transition-colors ${
                active ? "bg-gold text-ink" : "text-bone-dim hover:text-gold"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <span className="label text-bone-mute">{rangeLabel(query)}</span>
        <div className="flex items-center gap-1">
          <NavBtn href={agendaHref(query, { date: shiftAnchor(query, -1) }, today)} aria={`${UNIT[query.view]} anterior`}>
            <Icon name="chevron" size={16} className="rotate-180" />
          </NavBtn>
          <Link
            href={agendaHref(query, { date: today }, today)}
            className="px-3 py-1.5 label-sm text-bone-dim transition-colors hover:text-gold"
          >
            Hoy
          </Link>
          <NavBtn href={agendaHref(query, { date: shiftAnchor(query, 1) }, today)} aria={`${UNIT[query.view]} siguiente`}>
            <Icon name="chevron" size={16} />
          </NavBtn>
        </div>
      </div>
    </div>
  );
}

function NavBtn({ href, aria, children }: { href: string; aria: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={aria}
      className="flex size-8 items-center justify-center border hairline text-bone-dim transition-colors hover:border-gold hover:text-gold"
    >
      {children}
    </Link>
  );
}
