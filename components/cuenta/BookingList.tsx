import Link from "next/link";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { fmtDate, fmtTimeRange } from "@/components/admin/format";
import { formatCLP } from "@/lib/pricing";
import type { CustomerBooking } from "@/src/application/ports/customers";

/**
 * Reservas del cliente como filas, no como tabla: en el teléfono (su pantalla
 * principal) una tabla de cinco columnas dejaba el total y "Ver estado →" fuera
 * de pantalla sin ninguna pista de que se podía arrastrar. Dos líneas por
 * reserva — fecha + estado, horario + total — y, con `withLink`, la fila entera
 * es el enlace al estado (mismo patrón de enlace estirado que el admin).
 */
export default function BookingList({
  label,
  rows,
  withLink,
}: {
  label: string;
  rows: CustomerBooking[];
  withLink?: boolean;
}) {
  return (
    <ul aria-label={label} className="border hairline">
      {rows.map((b) => {
        const total = (b.amountClp ?? 0) + b.pointsRedeemedClp;
        const muted = b.status === "cancelled" || b.status === "expired";
        const linked = withLink && b.orderId;
        const when = `${fmtDate(b.startsAt)} ${fmtTimeRange(b.startsAt, b.endsAt)}`;
        return (
          <li
            key={b.id}
            className={`border-b hairline px-4 py-3 last:border-0 ${muted ? "opacity-60" : ""} ${
              linked ? "group relative transition-colors focus-within:bg-ink-soft hover:bg-ink-soft" : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-sm text-bone">{fmtDate(b.startsAt)}</span>
              <StatusPill status={b.orderStatus === "pending_payment" ? "pending_payment" : b.status} />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 font-mono text-sm text-bone-dim">
              <span>{fmtTimeRange(b.startsAt, b.endsAt)}</span>
              <span>
                {b.orderId ? formatCLP(total) : "—"}
                {b.pointsRedeemedClp > 0 && <span className="label-sm ml-2 text-bone-quiet">con puntos</span>}
              </span>
            </div>
            {linked && (
              <Link
                href={`/reserva/estado?b=${b.orderId}`}
                aria-label={`Ver estado — ${when}`}
                className="label-sm mt-2 inline-flex items-center text-bone-dim outline-none transition-colors after:absolute after:inset-0 group-hover:text-gold focus-visible:after:border focus-visible:after:border-gold"
              >
                Ver estado →
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
