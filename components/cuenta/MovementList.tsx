import Link from "next/link";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { fmtDate } from "@/components/admin/format";
import type { PointsMovement } from "@/src/application/ports/customers";
import { fmtPtsSigned } from "./format";

/**
 * Historial de puntos como filas de una línea: fecha · movimiento · puntos con
 * signo. Cabe en 375px sin scroll lateral (la tabla medía 480px en 335px). La
 * fila que viene de una reserva es entera el enlace a su estado.
 */
export default function MovementList({ label, rows }: { label: string; rows: PointsMovement[] }) {
  return (
    <ul aria-label={label} className="border hairline">
      {rows.map((m) => (
        <li
          key={m.id}
          className={`flex items-center gap-3 border-b hairline px-4 py-3 last:border-0 ${
            m.orderId ? "group relative transition-colors focus-within:bg-ink-soft hover:bg-ink-soft" : ""
          }`}
        >
          <span className="w-24 shrink-0 font-mono text-sm text-bone-dim">{fmtDate(m.createdAt)}</span>
          <StatusPill status={m.kind} />
          <span className={`ml-auto font-mono text-sm ${m.amount > 0 ? "text-gold" : "text-bone-dim"}`}>
            {fmtPtsSigned(m.amount)}
          </span>
          {m.orderId && (
            <Link
              href={`/reserva/estado?b=${m.orderId}`}
              aria-label={`Ver reserva — ${fmtDate(m.createdAt)}`}
              className="inline-flex text-bone-quiet outline-none transition-colors after:absolute after:inset-0 group-hover:text-gold focus-visible:after:border focus-visible:after:border-gold"
            >
              →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
