import { DateTime } from "luxon";
import { monthGrid, type DayStatus } from "@/src/domain/scheduling/month-availability";

interface CalendarProps {
  month: string; // "YYYY-MM" visible
  today: string; // "YYYY-MM-DD" Santiago
  maxDate: string; // horizonte (YYYY-MM-DD)
  selected: string | null;
  dayStatus: Record<string, DayStatus>;
  onSelect: (date: string) => void;
  onMonth: (month: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function Calendar({
  month, today, maxDate, selected, dayStatus, onSelect, onMonth,
}: CalendarProps) {
  const grid = monthGrid(month);
  const [y, m] = month.split("-").map(Number);
  const minMonth = today.slice(0, 7);
  const maxMonth = maxDate.slice(0, 7);
  const shift = (delta: number) =>
    onMonth(DateTime.fromISO(`${month}-01`).plus({ months: delta }).toFormat("yyyy-MM"));

  const navCls =
    "flex size-9 items-center justify-center border hairline text-bone transition-colors hover:border-gold hover:text-gold disabled:opacity-25";

  return (
    <div className="border hairline p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" aria-label="Mes anterior" disabled={month <= minMonth} onClick={() => shift(-1)} className={navCls}>
          ‹
        </button>
        <span className="font-display text-lg text-bone">{MONTHS[m - 1]} {y}</span>
        <button type="button" aria-label="Mes siguiente" disabled={month >= maxMonth} onClick={() => shift(1)} className={navCls}>
          ›
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="label-sm py-1 text-center text-bone-mute">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.flat().map((cell) => {
          const status = dayStatus[cell.date] ?? "open";
          const isPast = cell.date < today;
          const beyond = cell.date > maxDate;
          const blocked = status === "closed" || status === "full";
          const disabled = !cell.inMonth || isPast || beyond || blocked;
          const isSelected = cell.date === selected;
          const isToday = cell.date === today;
          const showLow = cell.inMonth && !disabled && !isSelected && status === "low";

          return (
            <button
              key={cell.date}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={DateTime.fromISO(cell.date).setLocale("es").toFormat("d 'de' MMMM yyyy")}
              onClick={() => onSelect(cell.date)}
              className={[
                "relative flex aspect-square items-center justify-center font-mono text-sm transition-colors",
                !cell.inMonth ? "text-bone-mute/30" : "",
                isSelected ? "bg-gold text-ink" : "",
                !isSelected && disabled && cell.inMonth ? "text-bone-mute/40" : "",
                !isSelected && !disabled ? "text-bone hover:bg-ink-soft hover:text-gold" : "",
                isToday && !isSelected ? "ring-1 ring-inset ring-gold/50" : "",
              ].join(" ")}
            >
              {Number(cell.date.slice(8, 10))}
              {showLow && (
                <span aria-hidden className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-sirena" />
              )}
            </button>
          );
        })}
      </div>

      <p className="label-sm mt-4 flex items-center gap-2 text-bone-mute">
        <span aria-hidden className="size-1 rounded-full bg-sirena" /> Últimos cupos
      </p>
    </div>
  );
}
