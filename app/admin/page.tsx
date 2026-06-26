import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { fmtDateTime } from "@/components/admin/format";
import { adminRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — FOTF Studios", robots: { index: false } };

export default async function AdminHome() {
  const repo = adminRepository();
  const [upcoming, boletas] = await Promise.all([repo.upcomingBookings(20), repo.pendingBoletas()]);

  return (
    <AdminShell>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Próximas sesiones" value={String(upcoming.length)} />
        <Stat label="Boletas pendientes" value={String(boletas.length)} accent />
        <Stat
          label="Ingreso próximo"
          value={formatCLP(upcoming.reduce((s, b) => s + (b.amount ?? 0), 0))}
        />
      </div>

      <h2 className="label mt-10 text-bone-mute">Próximas sesiones</h2>
      {upcoming.length === 0 ? (
        <p className="mt-3 text-bone-mute">No hay sesiones próximas.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {upcoming.map((b) => (
              <tr key={b.id} className="border-b hairline">
                <td className="py-3 font-mono text-bone">{fmtDateTime(b.startsAt)}</td>
                <td className="py-3 text-bone-dim">{b.customerName ?? b.customerEmail ?? "—"}</td>
                <td className="py-3">
                  <Badge status={b.status} />
                </td>
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

      {boletas.length > 0 && (
        <>
          <h2 className="label mt-10 text-bone-mute">Boletas pendientes de emitir</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {boletas.map((d) => (
                <tr key={d.id} className="border-b hairline">
                  <td className="py-3 font-mono text-bone-dim">{d.kind === "boleta" ? "Boleta" : "Nota de crédito"}</td>
                  <td className="py-3 text-bone-dim">
                    Neto {formatCLP(d.neto)} · IVA {formatCLP(d.iva)}
                  </td>
                  <td className="py-3 text-right font-mono text-bone">{formatCLP(d.total)}</td>
                  <td className="py-3 text-right">
                    <Link href={`/admin/reservas/${d.orderId}`} className="label-sm text-gold">
                      pedido →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 label-sm text-bone-mute">
            Emítelas en el portal del SII y registra el folio (acciones en el próximo PR).
          </p>
        </>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border hairline p-5">
      <p className="label-sm text-bone-mute">{label}</p>
      <p className={`font-display mt-2 text-3xl ${accent ? "text-gold" : "text-bone"}`}>{value}</p>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "text-gold",
    held: "text-bone-dim",
    cancelled: "text-sirena",
    expired: "text-bone-mute",
  };
  return <span className={`label-sm ${map[status] ?? "text-bone-dim"}`}>{status}</span>;
}
