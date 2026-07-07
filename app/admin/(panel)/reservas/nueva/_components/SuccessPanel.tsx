import Link from "next/link";
import { Icon } from "@/components/admin/ui/icons";
import { btn } from "@/components/admin/ui/styles";

/**
 * Momento de confirmación: reemplaza la consola (sin navegación automática).
 * El CTA principal es la confirmación por WhatsApp cuando hay teléfono válido.
 */
export function SuccessPanel({
  heading = "Reserva creada",
  rows,
  waHref,
  reservationId,
  noPhone,
  onReset,
}: {
  /** Título del panel; "Reserva creada, pendiente de pago" para el método "pendiente". */
  heading?: string;
  rows: { label: string; value: string }[];
  waHref: string | null;
  reservationId: string | null;
  noPhone: boolean;
  onReset: () => void;
}) {
  return (
    <div className="mx-auto mt-8 max-w-xl border hairline bg-ink/40 p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center border border-gold/40 text-gold">
        <Icon name="check" size={22} />
      </span>
      <h2 className="mt-4 font-display text-3xl text-bone">{heading}</h2>

      <dl className="mt-6 flex flex-col gap-2.5 border-t hairline pt-5 text-left">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <dt className="label-sm text-bone-mute">{r.label}</dt>
            <dd className="font-mono text-sm text-bone">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {waHref && (
          <a href={waHref} target="_blank" rel="noopener noreferrer" className={btn("primary")}>
            <Icon name="whatsapp" size={16} />
            Enviar confirmación por WhatsApp
          </a>
        )}
        {reservationId ? (
          <Link href={`/admin/reservas/${reservationId}`} className={btn(waHref ? "secondary" : "primary")}>
            Ver reserva
          </Link>
        ) : (
          <Link href="/admin/reservas" className={btn(waHref ? "secondary" : "primary")}>
            Ver reservas
          </Link>
        )}
        <button type="button" onClick={onReset} className={btn("ghost")}>
          Crear otra
        </button>
      </div>

      {noPhone && <p className="label-sm mt-4 text-bone-mute">Sin teléfono — no hay WhatsApp que enviar.</p>}
    </div>
  );
}
