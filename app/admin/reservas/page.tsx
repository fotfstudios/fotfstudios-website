import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { fmtDateTime } from "@/components/admin/format";
import { adminRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reservas — Admin", robots: { index: false } };

export default async function ReservasPage() {
  const bookings = await adminRepository().recentBookings(80);
  return (
    <AdminShell>
      <h2 className="label text-bone-mute">Reservas y bloqueos</h2>
      {bookings.length === 0 ? (
        <p className="mt-3 text-bone-mute">Sin reservas todavía.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b hairline">
                <td className="py-3 font-mono text-bone">{fmtDateTime(b.startsAt)}</td>
                <td className="py-3 text-bone-dim">
                  {b.kind === "block" ? "— bloqueo —" : (b.customerName ?? b.customerEmail ?? "—")}
                </td>
                <td className="py-3 label-sm text-bone-mute">{b.status}</td>
                <td className="py-3 text-right font-mono text-bone">{b.amount ? formatCLP(b.amount) : "—"}</td>
                <td className="py-3 text-right">
                  <Link href={`/admin/reservas/${b.id}`} className="label-sm text-gold">
                    ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
