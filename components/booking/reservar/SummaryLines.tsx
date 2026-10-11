import type { SummaryLine } from "@/lib/booking-summary";

/** Lista del desglose (resumen de escritorio y revisión móvil). */
export default function SummaryLines({ lines }: { lines: SummaryLine[] }) {
  return (
    <ul className="flex flex-col gap-2 text-[13px]">
      {lines.map((l) => (
        <li key={l.label} className={`flex justify-between gap-3 ${l.gold ? "text-[var(--gold)]" : "text-[var(--text-secondary)]"}`}>
          <span>{l.label}</span>
          <span className="ds-mono whitespace-nowrap">{l.value}</span>
        </li>
      ))}
    </ul>
  );
}
