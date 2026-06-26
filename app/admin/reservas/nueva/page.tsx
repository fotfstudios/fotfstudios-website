import AdminShell from "@/components/admin/AdminShell";
import { createManualBookingAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserva manual — Admin", robots: { index: false } };

const HOURS = Array.from({ length: 14 }, (_, i) => 540 + i * 60); // 09:00–22:00
const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;

const inputCls =
  "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";

export default function NuevaReserva() {
  return (
    <AdminShell>
      <h2 className="font-display text-2xl text-bone">Reserva manual</h2>
      <p className="label-sm mt-1 text-bone-mute">Walk-in / teléfono / WhatsApp. Ocupa el mismo calendario.</p>

      <form action={createManualBookingAction} className="mt-6 grid max-w-md gap-3">
        <label className="label-sm text-bone-mute">Día
          <input type="date" name="date" required className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label-sm text-bone-mute">Inicio
            <select name="startMinute" className={inputCls} defaultValue={600}>
              {HOURS.map((m) => (
                <option key={m} value={m}>{hh(m)}</option>
              ))}
            </select>
          </label>
          <label className="label-sm text-bone-mute">Horas
            <input type="number" name="durationHours" min={1} max={13} defaultValue={1} required className={inputCls} />
          </label>
        </div>
        <input type="text" name="name" placeholder="Nombre" className={inputCls} />
        <input type="email" name="email" placeholder="Email (opcional)" className={inputCls} />
        <input type="tel" name="phone" placeholder="Teléfono" className={inputCls} />
        <label className="label-sm text-bone-mute">Pago
          <select name="method" className={inputCls} defaultValue="efectivo">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="cortesia">Cortesía</option>
          </select>
        </label>
        <button type="submit" className="mt-2 inline-flex justify-center bg-gold px-6 py-3 label text-ink">
          Crear reserva (pagada)
        </button>
      </form>
    </AdminShell>
  );
}
