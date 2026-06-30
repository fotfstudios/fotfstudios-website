import Skeleton from "./Skeleton";
import { hhmm } from "./format";

interface TimeSlotsProps {
  hasDate: boolean;
  loading: boolean;
  closed: boolean;
  durationHours: number;
  slots: number[];
  selected: number | null;
  onSelect: (m: number) => void;
}

/** Panel derecho: estados (vacío/cargando/cerrado/sin cupos) o lista de horarios. */
export default function TimeSlots({
  hasDate,
  loading,
  closed,
  durationHours,
  slots,
  selected,
  onSelect,
}: TimeSlotsProps) {
  if (!hasDate) return <Empty>Selecciona una fecha para ver horarios</Empty>;
  if (loading)
    return (
      <div role="status" aria-label="Cargando disponibilidad" className="flex flex-col gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[2.85rem] w-full" />
        ))}
        <span className="sr-only">Cargando disponibilidad…</span>
      </div>
    );
  if (closed) return <Empty>Cerrado ese día.</Empty>;
  if (slots.length === 0) return <Empty>Sin horarios disponibles para esa duración.</Empty>;

  return (
    <div className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-1">
      {slots.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onSelect(m)}
          aria-pressed={selected === m}
          className={`w-full border px-4 py-3 text-center font-mono text-sm transition-colors ${
            selected === m
              ? "border-gold bg-gold text-ink"
              : "hairline text-bone-dim hover:border-gold hover:text-gold"
          }`}
        >
          {hhmm(m)} – {hhmm(m + durationHours * 60)}
        </button>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center px-6 text-center">
      <p className="label-sm text-bone-mute">{children}</p>
    </div>
  );
}
