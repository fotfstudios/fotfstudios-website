import AdminShell from "@/components/admin/AdminShell";
import { fmtDateTime } from "@/components/admin/format";
import { createBlockAction, deleteBlockAction } from "@/app/admin/actions";
import { adminRepository } from "@/src/composition";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bloqueos — Admin", robots: { index: false } };

const HOURS = Array.from({ length: 14 }, (_, i) => 540 + i * 60);
const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;
const inputCls =
  "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";

export default async function BloqueosPage() {
  const blocks = await adminRepository().upcomingBlocks();
  return (
    <AdminShell>
      <h2 className="font-display text-2xl text-bone">Bloquear horarios</h2>
      <p className="label-sm mt-1 text-bone-mute">Mantención, uso personal o feriados. No se podrán reservar.</p>

      <form action={createBlockAction} className="mt-6 flex max-w-md flex-wrap items-end gap-3">
        <label className="label-sm text-bone-mute">Día
          <input type="date" name="date" required className={inputCls} />
        </label>
        <label className="label-sm text-bone-mute">Inicio
          <select name="startMinute" className={inputCls} defaultValue={540}>
            {HOURS.map((m) => (
              <option key={m} value={m}>{hh(m)}</option>
            ))}
          </select>
        </label>
        <label className="label-sm text-bone-mute">Horas
          <input type="number" name="durationHours" min={1} max={13} defaultValue={1} required className={inputCls} />
        </label>
        <button type="submit" className="inline-flex bg-gold px-5 py-3 label text-ink">Bloquear</button>
      </form>

      <h3 className="label mt-10 text-bone-mute">Bloqueos próximos</h3>
      {blocks.length === 0 ? (
        <p className="mt-3 text-bone-mute">Sin bloqueos.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {blocks.map((b) => (
              <tr key={b.id} className="border-b hairline">
                <td className="py-3 font-mono text-bone">{fmtDateTime(b.startsAt)} → {fmtDateTime(b.endsAt)}</td>
                <td className="py-3 text-right">
                  <form action={deleteBlockAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" className="label-sm text-sirena">eliminar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
