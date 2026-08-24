import Link from "next/link";
import { hhmm } from "@/components/booking/format";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { overlaps } from "@/src/domain/scheduling/availability";
import type { OccupancyEntry } from "../types";

/**
 * "Cinta del día": el día como grilla de horas (beat grid) — reservas llenas,
 * bloqueos atenuados y la selección en curso en oro. Es visualización (aria-hidden);
 * la lista accesible con nombres va debajo y es la misma data.
 */
import { isRoomBlock } from "@/src/domain/scheduling/reservation-kind";
export function DayStrip({
  open,
  close,
  occupancy,
  selection,
}: {
  open: number;
  close: number;
  occupancy: OccupancyEntry[];
  selection: { start: number; end: number } | null;
}) {
  const hours: number[] = [];
  for (let m = open; m + 60 <= close; m += 60) hours.push(m);

  const cellCls = (m: number): string => {
    const hour = { start: m, end: m + 60 };
    if (selection && overlaps(hour, selection)) return "bg-gold/15 border-l-2 border-gold";
    const hit = occupancy.find((o) => overlaps(hour, o));
    if (hit && isRoomBlock(hit.kind)) return "bg-ink-soft border-l-2 border-bone-mute/40 opacity-70";
    if (hit) return "bg-bone-dim/15 border-l-2 border-bone-dim";
    return "";
  };

  const cols = { gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` };
  const sorted = [...occupancy].sort((a, b) => a.start - b.start);

  return (
    <div>
      {hours.length > 0 && (
        <div aria-hidden>
          <div className="grid gap-px border hairline bg-ink-line" style={cols}>
            {hours.map((m) => (
              <div key={m} className={`h-9 bg-ink transition-colors ${cellCls(m)}`} />
            ))}
          </div>
          <div className="mt-1 grid gap-px" style={cols}>
            {hours.map((m) => (
              <span key={m} className="label-sm text-center text-bone-mute">
                {String(Math.floor(m / 60)).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="label-sm mt-4 text-bone-mute">Día libre. Sin reservas.</p>
      ) : (
        <ul className="mt-3">
          {sorted.map((o) => (
            <li key={o.id} className="border-b hairline last:border-0">
              <Link
                href={`/admin/reservas/${o.id}`}
                className="flex items-center justify-between gap-3 px-1 py-3 transition-colors hover:bg-ink-soft"
              >
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="shrink-0 font-mono text-xs text-bone">
                    {hhmm(o.start)}–{hhmm(o.end)}
                  </span>
                  <span className="truncate text-xs text-bone-dim">
                    {o.kind === "curso" ? "Curso" : o.kind === "block" ? "Bloqueo" : (o.name ?? "Sin nombre")}
                  </span>
                </span>
                <StatusPill status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
