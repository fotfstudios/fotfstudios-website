import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelBookingAction, markAccessAction, recordBoletaAction } from "@/app/admin/actions";
import AdminShell from "@/components/admin/AdminShell";
import { fmtDateTime } from "@/components/admin/format";
import { adminRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserva — Admin", robots: { index: false } };

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await adminRepository().getBooking(id);
  if (!b) notFound();

  const waDigits = (b.customerPhone ?? "").replace(/\D/g, "");

  return (
    <AdminShell>
      <Link href="/admin/reservas" className="label-sm text-bone-mute transition-colors hover:text-gold">
        ← Reservas
      </Link>

      <h2 className="font-display mt-4 text-bone" style={{ fontSize: "clamp(1.8rem,5vw,2.6rem)" }}>
        {fmtDateTime(b.startsAt)}
      </h2>
      <p className="label-sm mt-1 text-gold">{b.status}{b.kind === "block" ? " · bloqueo" : ""}</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <section className="border hairline p-5">
          <h3 className="label text-bone-mute">Cliente</h3>
          <p className="mt-2 text-bone">{b.customerName ?? "—"}</p>
          <p className="text-bone-dim">{b.customerEmail ?? "—"}</p>
          {b.customerPhone && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex bg-gold px-4 py-2 label-sm text-ink"
            >
              WhatsApp →
            </a>
          )}
        </section>

        <section className="border hairline p-5">
          <h3 className="label text-bone-mute">Pago</h3>
          <p className="mt-2 font-display text-2xl text-bone">{b.amount ? formatCLP(b.amount) : "—"}</p>
          <p className="label-sm text-bone-mute">Pedido: {b.orderStatus ?? "—"}</p>
          <p className="label-sm mt-2 text-bone-mute">
            Boleta: {b.boleta ? `${b.boleta.status}${b.boleta.folio ? ` · folio ${b.boleta.folio}` : ""}` : "—"}
          </p>
        </section>
      </div>

      {b.lines.length > 0 && (
        <section className="mt-6 border hairline p-5">
          <h3 className="label text-bone-mute">Detalle</h3>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {b.lines.map((l, i) => (
                <tr key={i} className="border-b hairline last:border-0">
                  <td className="py-2 text-bone-dim">{l.description}</td>
                  <td className="py-2 text-right font-mono text-bone">{formatCLP(l.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {b.kind !== "block" && (
        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          <form action={markAccessAction} className="border hairline p-5">
            <h3 className="label text-bone-mute">Acceso</h3>
            <input type="hidden" name="reservationId" value={b.id} />
            <input
              name="code"
              defaultValue={b.accessCode ?? ""}
              placeholder="Código / instrucciones"
              className="mt-2 w-full border hairline bg-ink px-3 py-2 font-mono text-sm text-bone outline-none focus-visible:border-gold"
            />
            <button type="submit" className="mt-2 inline-flex bg-gold px-4 py-2 label-sm text-ink">
              Guardar acceso
            </button>
            {b.accessSentAt && <p className="mt-2 label-sm text-bone-mute">Registrado.</p>}
          </form>

          {b.boleta && b.boleta.status === "pendiente" ? (
            <form action={recordBoletaAction} className="border hairline p-5">
              <h3 className="label text-bone-mute">Registrar boleta</h3>
              <input type="hidden" name="docId" value={b.boleta.id} />
              <input type="hidden" name="reservationId" value={b.id} />
              <input
                name="folio"
                placeholder="N° de folio (SII)"
                className="mt-2 w-full border hairline bg-ink px-3 py-2 font-mono text-sm text-bone outline-none focus-visible:border-gold"
              />
              <button type="submit" className="mt-2 inline-flex bg-gold px-4 py-2 label-sm text-ink">
                Marcar emitida
              </button>
            </form>
          ) : (
            <div className="border hairline p-5">
              <h3 className="label text-bone-mute">Boleta</h3>
              <p className="mt-2 text-bone-dim">
                {b.boleta ? `${b.boleta.status}${b.boleta.folio ? ` · folio ${b.boleta.folio}` : ""}` : "—"}
              </p>
            </div>
          )}
        </section>
      )}

      {b.status !== "cancelled" && (
        <form action={cancelBookingAction} className="mt-6">
          <input type="hidden" name="reservationId" value={b.id} />
          <button type="submit" className="label-sm text-sirena">
            Cancelar {b.kind === "block" ? "bloqueo" : "reserva"} (libera el horario)
          </button>
        </form>
      )}
    </AdminShell>
  );
}
