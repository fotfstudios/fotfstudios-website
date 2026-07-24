type Tone = "gold" | "dim" | "mute" | "sirena";

const MAP: Record<string, { label: string; tone: Tone }> = {
  // Reservas
  held: { label: "En espera", tone: "dim" },
  confirmed: { label: "Confirmada", tone: "gold" },
  cancelled: { label: "Cancelada", tone: "mute" },
  expired: { label: "Expirada", tone: "mute" },
  block: { label: "Bloqueo", tone: "mute" },
  // Pedidos
  paid: { label: "Pagada", tone: "gold" },
  pending_payment: { label: "Pago pendiente", tone: "dim" },
  fulfilled: { label: "Cumplida", tone: "gold" },
  refunded: { label: "Reembolsada", tone: "mute" },
  // Miembros
  active: { label: "Activo", tone: "gold" },
  disabled: { label: "Inactivo", tone: "mute" },
  invited: { label: "Invitado", tone: "dim" },
  // Boleta
  pendiente: { label: "Pendiente", tone: "dim" },
  emitida: { label: "Emitida", tone: "gold" },
  // Ledger de puntos (points_entry_kind)
  earn: { label: "Ganados", tone: "gold" },
  earn_revoke: { label: "Descontados", tone: "mute" },
  redeem: { label: "Canjeados", tone: "dim" },
  redeem_release: { label: "Devueltos", tone: "dim" },
  redeem_restore: { label: "Devueltos", tone: "dim" },
  adjust: { label: "Ajuste", tone: "mute" },
  // Postulaciones de DJ
  nueva: { label: "Nueva", tone: "gold" },
  contactada: { label: "Contactada", tone: "dim" },
  descartada: { label: "Descartada", tone: "mute" },
};

const TONE: Record<Tone, string> = {
  gold: "text-gold",
  dim: "text-bone-dim",
  mute: "text-bone-mute",
  sirena: "text-sirena",
};
const DOT: Record<Tone, string> = {
  gold: "bg-gold",
  dim: "bg-bone-dim",
  mute: "bg-bone-mute",
  sirena: "bg-sirena",
};

/** Pastilla de estado: punto + etiqueta mono. Sirena solo para estados urgentes. */
export function StatusPill({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, tone: "dim" as Tone };
  return (
    <span className={`inline-flex items-center gap-1.5 border hairline px-2 py-0.5 label-sm ${TONE[s.tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.tone]}`} />
      {s.label}
    </span>
  );
}
