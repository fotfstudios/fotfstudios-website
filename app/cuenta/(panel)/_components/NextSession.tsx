import Link from "next/link";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { fmtDate, fmtTimeRange } from "@/components/admin/format";
import type { CustomerBooking } from "@/src/application/ports/customers";

/**
 * Protagonista del Resumen: la próxima sesión del DJ, en tipografía display, con
 * su estado y el enlace a /reserva/estado (donde están el acceso y la dirección).
 * El bloque entero es el enlace (patrón de enlace estirado); con pago pendiente
 * el enlace dice lo que falta hacer.
 */
export default function NextSession({ booking: b }: { booking: CustomerBooking }) {
  const pending = b.orderStatus === "pending_payment";
  const when = `${fmtDate(b.startsAt)} ${fmtTimeRange(b.startsAt, b.endsAt)}`;
  return (
    <section
      aria-labelledby="proxima-sesion"
      className={`border hairline bg-ink/40 p-5 sm:p-6 ${
        b.orderId ? "group relative transition-colors focus-within:bg-ink-soft hover:bg-ink-soft" : ""
      }`}
    >
      <h2 id="proxima-sesion" className="label text-bone-quiet">
        Tu próxima sesión
      </h2>
      <p className="font-display mt-3 text-3xl text-bone sm:text-4xl">{fmtDate(b.startsAt)}</p>
      <p className="mt-1 font-mono text-sm text-bone-dim">{fmtTimeRange(b.startsAt, b.endsAt)}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <StatusPill status={pending ? "pending_payment" : b.status} />
        {b.orderId && (
          <Link
            href={`/reserva/estado?b=${b.orderId}`}
            aria-label={`${pending ? "Completar pago" : "Ver estado"} — ${when}`}
            className={`label-sm inline-flex items-center outline-none transition-colors after:absolute after:inset-0 focus-visible:after:border focus-visible:after:border-gold ${
              pending ? "text-gold" : "text-bone-dim group-hover:text-gold"
            }`}
          >
            {pending ? "Completar pago →" : "Ver estado →"}
          </Link>
        )}
      </div>
    </section>
  );
}
