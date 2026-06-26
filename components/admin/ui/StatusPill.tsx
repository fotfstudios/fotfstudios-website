type Tone = "gold" | "dim" | "mute" | "sirena";

const MAP: Record<string, { label: string; tone: Tone }> = {
  // Reservas
  held: { label: "En espera", tone: "dim" },
  confirmed: { label: "Confirmada", tone: "gold" },
  cancelled: { label: "Cancelada", tone: "mute" },
  expired: { label: "Expirada", tone: "mute" },
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
