# /reservar Calendar + Conversion Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native `<input type="date">` in the `/reservar` booking widget with a two-pane month-grid calendar + time-slot panel (loading/empty/closed states, per-day availability, subtle urgency), and restructure the page for conversion (single screen, progressive-disclosure contact fields, sticky CTA).

**Architecture:** Pure domain functions (month grid, day classification) → application service method (`getMonthAvailability`) → thin route (`/api/availability/month`) → presentational React components (`Calendar`, `TimeSlots`, `Spinner`) orchestrated by a refactored `BookingWidget`. Hexagonal layering already in the repo is preserved; the calendar status reuses the existing `availableStartMinutes` at 1-hour granularity.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, Luxon, Vitest.

## Global Constraints

- Next.js 15 App Router + React 19; client components marked `"use client"`.
- Tailwind v4 **tokens only** — `ink`, `ink-soft`, `ink-line`(via `hairline`), `bone`, `bone-dim`, `bone-mute`, `gold`, `gold-deep`, `sirena`, `graphite`; utilities `.label`, `.label-sm`, `.font-display`, `.grain`, `.rise`, `.hairline`. No new colors.
- **No new dependencies** — Luxon (`^3.7.2`) is the only date lib; no calendar/picker libraries.
- Time zone is the resource's (`America/Santiago`); all date strings are `YYYY-MM-DD` local, month strings `YYYY-MM`. UTC conversions go through `src/domain/scheduling/time.ts`.
- Spanish (Chile) copy. Selected day/slot use `bg-gold text-ink`; Sirena only for urgency ("últimos cupos") and errors.
- `npx eslint .` and `npm run build` must both pass (exit 0). Unit tests via `npm test` (vitest).
- Brand palette: Ink `#0a0a0a` · Bone `#f5f2ec` · Gold `#e8c94a` · Sirena `#ff4d1d`.
- Work on a branch `feat/reservar-calendar` (main is protected; PR + squash-merge). Commit per task.

---

## File Structure

- **Create** `src/domain/scheduling/month-availability.ts` — `DayStatus`, `classifyDay()`, `DayCell`, `monthGrid()` (pure).
- **Modify** `src/domain/scheduling/time.ts` — add `monthDates()`, `monthBoundsUtc()`.
- **Create** `src/domain/scheduling/month-availability.test.ts` — domain tests.
- **Modify** `src/application/availability/availability-service.ts` — add `MonthAvailability`, `getMonthAvailability()`.
- **Create** `src/application/availability/availability-service.test.ts` — service test with a fake repo.
- **Create** `app/api/availability/month/route.ts` — `GET` endpoint.
- **Create** `components/booking/format.ts` — `hhmm()`.
- **Create** `components/booking/Spinner.tsx`, `components/booking/TimeSlots.tsx`, `components/booking/Calendar.tsx`.
- **Modify** `components/booking/BookingWidget.tsx` — orchestrator refactor.

No change needed to `src/infrastructure/db/scheduling-repository.ts`: `getReservationsForDate(resourceId, startUtc, endUtc)` is already a range query and is reused for the month bounds.

---

## Task 1: Domain — month grid + day classification (pure, TDD)

**Files:**
- Create: `src/domain/scheduling/month-availability.ts`
- Modify: `src/domain/scheduling/time.ts`
- Test: `src/domain/scheduling/month-availability.test.ts`

**Interfaces:**
- Consumes: `availableStartMinutes`, `Interval` from `./availability`; `DateTime` from `luxon`.
- Produces:
  - `type DayStatus = "closed" | "full" | "low" | "open"`
  - `classifyDay(openMinute: number, closeMinute: number, booked: Interval[]): DayStatus`
  - `interface DayCell { date: string; inMonth: boolean }`
  - `monthGrid(month: string): DayCell[][]`  (6 rows × 7, Sunday-first)
  - `monthDates(month: string): string[]`  (in `time.ts`)
  - `monthBoundsUtc(month: string, tz: string): { startUtc: string; endUtc: string }`  (in `time.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/domain/scheduling/month-availability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyDay, monthGrid } from "./month-availability";
import { monthBoundsUtc, monthDates } from "./time";

describe("classifyDay", () => {
  it("closed cuando no hay horario (cierre <= apertura)", () => {
    expect(classifyDay(540, 540, [])).toBe("closed");
    expect(classifyDay(720, 540, [])).toBe("closed");
  });
  it("open con 3+ inicios libres", () => {
    expect(classifyDay(540, 720, [])).toBe("open"); // 9–12 → 9,10,11
  });
  it("low con 1–2 inicios libres", () => {
    expect(classifyDay(540, 660, [])).toBe("low"); // 9–11 → 9,10
    expect(classifyDay(540, 720, [{ start: 540, end: 660 }])).toBe("low"); // queda 11
  });
  it("full con 0 inicios libres", () => {
    expect(classifyDay(540, 720, [{ start: 540, end: 720 }])).toBe("full");
  });
});

describe("monthGrid", () => {
  it("6 semanas de 7 días, empezando en domingo, con relleno de meses vecinos", () => {
    const g = monthGrid("2026-06"); // 1 jun 2026 = lunes
    expect(g).toHaveLength(6);
    expect(g.flat()).toHaveLength(42);
    expect(g[0][0]).toEqual({ date: "2026-05-31", inMonth: false }); // domingo previo
    expect(g[0][1]).toEqual({ date: "2026-06-01", inMonth: true });
  });
});

describe("monthDates", () => {
  it("lista todas las fechas del mes", () => {
    expect(monthDates("2026-06")).toHaveLength(30);
    expect(monthDates("2024-02")).toHaveLength(29); // bisiesto
    expect(monthDates("2026-06")[0]).toBe("2026-06-01");
  });
});

describe("monthBoundsUtc", () => {
  it("límites UTC del mes local (junio = -04 en Santiago)", () => {
    expect(monthBoundsUtc("2026-06", "America/Santiago")).toEqual({
      startUtc: "2026-06-01T04:00:00.000Z",
      endUtc: "2026-07-01T04:00:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/scheduling/month-availability.test.ts`
Expected: FAIL — `classifyDay`/`monthGrid`/`monthDates`/`monthBoundsUtc` not exported.

- [ ] **Step 3: Add the two time helpers**

Append to `src/domain/scheduling/time.ts`:

```ts
/** Todas las fechas locales "YYYY-MM-DD" del mes "YYYY-MM". */
export function monthDates(month: string): string[] {
  const first = DateTime.fromISO(`${month}-01`);
  const n = first.daysInMonth!;
  return Array.from({ length: n }, (_, i) => first.plus({ days: i }).toFormat("yyyy-MM-dd"));
}

/** Límites UTC [inicio, fin) del mes local "YYYY-MM" en `tz`. */
export function monthBoundsUtc(month: string, tz: string): { startUtc: string; endUtc: string } {
  const start = DateTime.fromISO(`${month}-01`, { zone: tz }).startOf("month");
  return { startUtc: start.toUTC().toISO()!, endUtc: start.plus({ months: 1 }).toUTC().toISO()! };
}
```

- [ ] **Step 4: Create the month-availability domain module**

Create `src/domain/scheduling/month-availability.ts`:

```ts
/**
 * Estado de disponibilidad por día (para pintar el calendario) y generación de
 * la grilla mensual. Puro: la conversión de tz vive en `time.ts`.
 */
import { DateTime } from "luxon";
import { availableStartMinutes, type Interval } from "./availability";

export type DayStatus = "closed" | "full" | "low" | "open";

/** Clasifica un día por nº de inicios de 1h libres: 0→full, 1–2→low, ≥3→open. */
export function classifyDay(openMinute: number, closeMinute: number, booked: Interval[]): DayStatus {
  if (closeMinute <= openMinute) return "closed";
  const free = availableStartMinutes(openMinute, closeMinute, 1, booked).length;
  if (free === 0) return "full";
  if (free <= 2) return "low";
  return "open";
}

export interface DayCell {
  date: string; // "YYYY-MM-DD"
  inMonth: boolean; // false = relleno de un mes vecino
}

/** Grilla de 6 semanas (42 celdas), empezando en domingo, para el mes "YYYY-MM". */
export function monthGrid(month: string): DayCell[][] {
  const first = DateTime.fromISO(`${month}-01`);
  const gridStart = first.minus({ days: first.weekday % 7 }); // Luxon: 1=Lun..7=Dom → Dom=0
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = gridStart.plus({ days: w * 7 + d });
      row.push({ date: dt.toFormat("yyyy-MM-dd"), inMonth: dt.month === first.month });
    }
    weeks.push(row);
  }
  return weeks;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/domain/scheduling/month-availability.test.ts`
Expected: PASS (all 4 describe blocks green).

- [ ] **Step 6: Commit**

```bash
git add src/domain/scheduling/month-availability.ts src/domain/scheduling/month-availability.test.ts src/domain/scheduling/time.ts
git commit -m "feat(reservar): month grid + day classification domain helpers"
```

---

## Task 2: Application — getMonthAvailability service method (TDD)

**Files:**
- Modify: `src/application/availability/availability-service.ts`
- Test: `src/application/availability/availability-service.test.ts`

**Interfaces:**
- Consumes: `SchedulingRepository` (`getResourceCalendar`, `getReservationsForDate`), `weekdayFor`, `dayBoundsUtc`, `toLocalMinutesInterval`, `monthBoundsUtc`, `monthDates`, `classifyDay`, `DayStatus`, `Result`/`ok`/`err`.
- Produces:
  - `interface MonthAvailability { month: string; days: Record<string, DayStatus> }`
  - `AvailabilityService.getMonthAvailability(resourceId: string, month: string): Promise<Result<MonthAvailability, string>>`

- [ ] **Step 1: Write the failing test**

Create `src/application/availability/availability-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BookedRange, ResourceCalendar, SchedulingRepository } from "@/src/application/ports/scheduling";
import { AvailabilityService } from "./availability-service";

function fakeRepo(cal: ResourceCalendar | null, reservations: BookedRange[]): SchedulingRepository {
  return {
    async getResourceCalendar() {
      return cal;
    },
    async getReservationsForDate() {
      return reservations; // el servicio filtra por día; el fake devuelve todo
    },
  };
}

// Lun–Sáb 09:00–12:00 (3 cupos de 1h); domingo cerrado (sin clave 0).
const CAL: ResourceCalendar = {
  timezone: "America/Santiago",
  openingHours: { 1: [540, 720], 2: [540, 720], 3: [540, 720], 4: [540, 720], 5: [540, 720], 6: [540, 720] },
};

describe("AvailabilityService.getMonthAvailability", () => {
  it("error si el recurso no existe", async () => {
    const svc = new AvailabilityService(fakeRepo(null, []));
    const r = await svc.getMonthAvailability("x", "2026-06");
    expect(r.ok).toBe(false);
  });

  it("clasifica closed/full/low/open por día", async () => {
    const reservations: BookedRange[] = [
      // 2 jun (mar) 09:00–12:00 local (-04) = 13:00–16:00Z → full
      { startsAt: "2026-06-02T13:00:00.000Z", endsAt: "2026-06-02T16:00:00.000Z" },
      // 3 jun (mié) 09:00–11:00 local = 13:00–15:00Z → queda 11:00 → low
      { startsAt: "2026-06-03T13:00:00.000Z", endsAt: "2026-06-03T15:00:00.000Z" },
    ];
    const svc = new AvailabilityService(fakeRepo(CAL, reservations));
    const r = await svc.getMonthAvailability("res", "2026-06");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.days["2026-06-07"]).toBe("closed"); // domingo
    expect(r.value.days["2026-06-02"]).toBe("full");
    expect(r.value.days["2026-06-03"]).toBe("low");
    expect(r.value.days["2026-06-04"]).toBe("open"); // jueves sin reservas
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/application/availability/availability-service.test.ts`
Expected: FAIL — `getMonthAvailability` is not a function.

- [ ] **Step 3: Implement the service method**

In `src/application/availability/availability-service.ts`:

Update the imports line at the top to add the four helpers:

```ts
import { dayBoundsUtc, monthBoundsUtc, monthDates, toLocalMinutesInterval, weekdayFor } from "@/src/domain/scheduling/time";
import { classifyDay, type DayStatus } from "@/src/domain/scheduling/month-availability";
```

Add the type after the `DayAvailability` interface:

```ts
export interface MonthAvailability {
  month: string;
  days: Record<string, DayStatus>;
}
```

Add the method inside the `AvailabilityService` class (after `getDayAvailability`):

```ts
  /** Estado por día del mes "YYYY-MM" para pintar el calendario (granularidad 1h). */
  async getMonthAvailability(resourceId: string, month: string): Promise<Result<MonthAvailability, string>> {
    const cal = await this.repo.getResourceCalendar(resourceId);
    if (!cal) return err("recurso no encontrado");

    const { startUtc, endUtc } = monthBoundsUtc(month, cal.timezone);
    const reservations = await this.repo.getReservationsForDate(resourceId, startUtc, endUtc);

    const days: Record<string, DayStatus> = {};
    for (const date of monthDates(month)) {
      const hours = cal.openingHours[weekdayFor(date, cal.timezone)];
      if (!hours) {
        days[date] = "closed";
        continue;
      }
      const { startUtc: ds, endUtc: de } = dayBoundsUtc(date, cal.timezone);
      const booked = reservations
        .filter((r) => r.startsAt < de && r.endsAt > ds)
        .map((r) => toLocalMinutesInterval(date, cal.timezone, r.startsAt, r.endsAt));
      days[date] = classifyDay(hours[0], hours[1], booked);
    }
    return ok({ month, days });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/application/availability/availability-service.test.ts`
Expected: PASS (both tests green).

- [ ] **Step 5: Commit**

```bash
git add src/application/availability/availability-service.ts src/application/availability/availability-service.test.ts
git commit -m "feat(reservar): getMonthAvailability service method"
```

---

## Task 3: API route — GET /api/availability/month

**Files:**
- Create: `app/api/availability/month/route.ts`

**Interfaces:**
- Consumes: `availabilityService()` from `@/src/composition` → `getMonthAvailability`.
- Produces: `GET /api/availability/month?resource=<id>&month=YYYY-MM` → `{ month, days }` (200) | `{ error }` (400/404/503).

- [ ] **Step 1: Create the route**

Create `app/api/availability/month/route.ts`:

```ts
import { availabilityService } from "@/src/composition";

export const dynamic = "force-dynamic";

/** GET /api/availability/month?resource=<id>&month=YYYY-MM → estado por día. */
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const resource = params.get("resource");
  const month = params.get("month");
  if (!resource || !month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "parámetros inválidos" }, { status: 400 });
  }
  try {
    const r = await availabilityService().getMonthAvailability(resource, month);
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    return Response.json(r.value);
  } catch (e) {
    console.error("[availability/month]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Verify against the local stack**

Ensure the local stack is seeded and running (`npm run db:reset` then `npm run dev`). Get the resource id and curl the endpoint:

```bash
RES=$(docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -t -A -c "select id from resources limit 1")
curl -s "http://localhost:3000/api/availability/month?resource=$RES&month=2026-06" | head -c 600
```
Expected: JSON like `{"month":"2026-06","days":{"2026-06-01":"open",…}}` with at least one `"full"`/`"low"` from the seeded demo bookings, and Sundays `"closed"` if no Sunday hours exist (seed has all 7 days open → expect `open`/`low`/`full` only). Also verify `month=bad` → `{"error":"parámetros inválidos"}` with HTTP 400:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/availability/month?resource=$RES&month=bad"
```
Expected: `400`.

- [ ] **Step 3: Commit**

```bash
git add app/api/availability/month/route.ts
git commit -m "feat(reservar): month availability API route"
```

---

## Task 4: UI primitives — format, Spinner, TimeSlots

**Files:**
- Create: `components/booking/format.ts`
- Create: `components/booking/Spinner.tsx`
- Create: `components/booking/TimeSlots.tsx`

**Interfaces:**
- Produces:
  - `hhmm(m: number): string`
  - `Spinner` (default export, no props)
  - `TimeSlots` (default export) props: `{ hasDate: boolean; loading: boolean; closed: boolean; durationHours: number; slots: number[]; selected: number | null; onSelect: (m: number) => void }`

- [ ] **Step 1: Create the format helper**

Create `components/booking/format.ts`:

```ts
/** Minutos del día → "HH:MM". */
export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
```

- [ ] **Step 2: Create the Spinner**

Create `components/booking/Spinner.tsx`:

```tsx
/** Spinner anillo dorado; bajo prefers-reduced-motion queda solo el texto. */
export default function Spinner() {
  return (
    <div role="status" className="flex min-h-[12rem] items-center justify-center gap-2 text-bone-mute">
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-graphite border-t-gold motion-reduce:hidden"
      />
      <span className="label-sm">Cargando disponibilidad…</span>
    </div>
  );
}
```

- [ ] **Step 3: Create the TimeSlots panel**

Create `components/booking/TimeSlots.tsx`:

```tsx
import Spinner from "./Spinner";
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
  if (loading) return <Spinner />;
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
```

- [ ] **Step 4: Lint the new files**

Run: `npx eslint components/booking/format.ts components/booking/Spinner.tsx components/booking/TimeSlots.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/booking/format.ts components/booking/Spinner.tsx components/booking/TimeSlots.tsx
git commit -m "feat(reservar): TimeSlots panel with loading/empty/closed states"
```

---

## Task 5: UI — Calendar component

**Files:**
- Create: `components/booking/Calendar.tsx`

**Interfaces:**
- Consumes: `monthGrid`, `DayStatus` from `@/src/domain/scheduling/month-availability`; `DateTime` from `luxon`.
- Produces: `Calendar` (default export) props: `{ month: string; today: string; maxDate: string; selected: string | null; dayStatus: Record<string, DayStatus>; onSelect: (date: string) => void; onMonth: (month: string) => void }`.

- [ ] **Step 1: Create the Calendar**

Create `components/booking/Calendar.tsx`:

```tsx
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
              aria-label={cell.date}
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
```

- [ ] **Step 2: Lint the new file**

Run: `npx eslint components/booking/Calendar.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/booking/Calendar.tsx
git commit -m "feat(reservar): month-grid Calendar with availability + urgency cue"
```

---

## Task 6: Orchestrator — refactor BookingWidget

**Files:**
- Modify: `components/booking/BookingWidget.tsx` (replace whole file)

**Interfaces:**
- Consumes: `Calendar`, `TimeSlots`, `hhmm`, `DayStatus`, `availableStartMinutes`, `formatCLP`, `DateTime`.
- Produces: same default export `BookingWidget({ resourceId }: { resourceId: string })`.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `components/booking/BookingWidget.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import { formatCLP } from "@/src/domain/money/money";
import { availableStartMinutes, type Interval } from "@/src/domain/scheduling/availability";
import type { DayStatus } from "@/src/domain/scheduling/month-availability";
import Calendar from "./Calendar";
import TimeSlots from "./TimeSlots";
import { hhmm } from "./format";

type Rec = "none" | "audio" | "audioVideo";

interface DayAvailability {
  closed: boolean;
  openMinute: number;
  closeMinute: number;
  booked: Interval[];
}

interface QuoteResult {
  total: number;
  tierLines: { key: string; hours: number; rate: number; subtotal: number }[];
  addonLines: { key: string; name: string; amount: number }[];
  discount: number;
}

const todayInSantiago = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

export default function BookingWidget({ resourceId }: { resourceId: string }) {
  const today = todayInSantiago();
  const maxDate = DateTime.fromISO(today).plus({ days: 90 }).toFormat("yyyy-MM-dd");

  const [month, setMonth] = useState(today.slice(0, 7));
  const [dayStatus, setDayStatus] = useState<Record<string, DayStatus>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [avail, setAvail] = useState<DayAvailability | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(1);
  const [rec, setRec] = useState<Rec>("none");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disponibilidad del mes visible (pinta el calendario). Degrada a {} si falla.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const d = await (await fetch(`/api/availability/month?resource=${resourceId}&month=${month}`)).json();
        if (active) setDayStatus(d?.days ?? {});
      } catch {
        if (active) setDayStatus({});
      }
    })();
    return () => {
      active = false;
    };
  }, [resourceId, month]);

  // Disponibilidad del día al elegir fecha.
  useEffect(() => {
    if (selected === null) {
      setAvail(null);
      return;
    }
    let active = true;
    void (async () => {
      setLoadingAvail(true);
      setStart(null);
      setQuote(null);
      try {
        const d = await (await fetch(`/api/availability?resource=${resourceId}&date=${selected}`)).json();
        if (active) setAvail(d?.error ? null : d);
      } catch {
        if (active) setAvail(null);
      } finally {
        if (active) setLoadingAvail(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [resourceId, selected]);

  const starts =
    avail && !avail.closed
      ? availableStartMinutes(avail.openMinute, avail.closeMinute, duration, avail.booked)
      : [];
  const selectedStart = start !== null && starts.includes(start) ? start : null;
  const maxDuration =
    avail && !avail.closed && selectedStart !== null ? (avail.closeMinute - selectedStart) / 60 : 8;

  // Cotización al tener inicio válido.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (selected === null || selectedStart === null) {
        if (active) setQuote(null);
        return;
      }
      const keys = rec === "none" ? [] : [rec];
      const qs = new URLSearchParams({
        resource: resourceId,
        date: selected,
        start: String(selectedStart),
        duration: String(duration),
        addons: keys.join(","),
      });
      try {
        const d = await (await fetch(`/api/pricing/quote?${qs}`)).json();
        if (active) setQuote(d?.error ? null : d);
      } catch {
        if (active) setQuote(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [resourceId, selected, selectedStart, duration, rec]);

  const submit = useCallback(async () => {
    if (selected === null || selectedStart === null || !email) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId,
          date: selected,
          startMinute: selectedStart,
          durationHours: duration,
          addonKeys: rec === "none" ? [] : [rec],
          customer: { name, email, phone },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error === "slot_taken"
            ? "Ese horario se acaba de tomar. Elige otro."
            : "No se pudo crear la reserva.",
        );
        setSubmitting(false);
        return;
      }
      window.location.assign(data.initPoint);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setSubmitting(false);
    }
  }, [resourceId, selected, selectedStart, duration, rec, name, email, phone]);

  const canPay = selectedStart !== null && !!email && !submitting;
  const inputCls =
    "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:pb-0">
      {/* IZQUIERDA: configuración + calendario + datos */}
      <div className="space-y-6">
        {/* Barra de sesión */}
        <div className="grid gap-6 border hairline p-5 sm:grid-cols-2">
          <Field label="Duración">
            <div className="flex items-stretch border hairline">
              <button
                type="button"
                onClick={() => setDuration((d) => Math.max(1, d - 1))}
                disabled={duration <= 1}
                aria-label="Restar"
                className="w-12 shrink-0 font-display text-2xl text-bone transition-colors hover:bg-ink-soft hover:text-gold disabled:opacity-25"
              >
                −
              </button>
              <span className="flex flex-1 items-center justify-center border-x hairline py-3 font-display text-2xl text-bone">
                {duration}h
              </span>
              <button
                type="button"
                onClick={() => setDuration((d) => Math.min(maxDuration, d + 1))}
                disabled={duration >= maxDuration}
                aria-label="Sumar"
                className="w-12 shrink-0 font-display text-2xl text-bone transition-colors hover:bg-ink-soft hover:text-gold disabled:opacity-25"
              >
                +
              </button>
            </div>
          </Field>
          <Field label="Grabación (opcional)">
            <div className="grid grid-cols-3 gap-1.5">
              {(["none", "audio", "audioVideo"] as Rec[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRec(k)}
                  aria-pressed={rec === k}
                  className={`px-2 py-3 label-sm transition-colors ${
                    rec === k ? "bg-gold text-ink" : "border hairline text-bone-dim hover:border-gold hover:text-gold"
                  }`}
                >
                  {k === "none" ? "Ninguna" : k === "audio" ? "Audio" : "Audio + Video"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Calendario + horarios */}
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <Calendar
            month={month}
            today={today}
            maxDate={maxDate}
            selected={selected}
            dayStatus={dayStatus}
            onSelect={setSelected}
            onMonth={setMonth}
          />
          <div className="border hairline p-4 md:min-h-[20rem] md:p-5">
            <span className="label-sm mb-4 block text-bone-mute">Selecciona un horario</span>
            <TimeSlots
              hasDate={selected !== null}
              loading={loadingAvail}
              closed={!!avail?.closed}
              durationHours={duration}
              slots={starts}
              selected={selectedStart}
              onSelect={setStart}
            />
          </div>
        </div>

        {/* Datos (aparecen al elegir horario) */}
        {selectedStart !== null && (
          <div className="rise border hairline p-5">
            <span className="label-sm mb-4 block text-bone-mute">Tus datos</span>
            <div className="space-y-2">
              <input type="text" placeholder="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              <input type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              <input type="tel" placeholder="Teléfono (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </div>
          </div>
        )}
      </div>

      {/* DERECHA: resumen */}
      <div className="grain relative overflow-hidden border hairline bg-ink lg:sticky lg:top-28">
        <div className="relative p-6 md:p-8">
          <span className="label text-bone-mute">Total</span>
          <div className="mt-3 font-display text-bone" style={{ fontSize: "clamp(2.6rem,8vw,4rem)" }}>
            {quote ? formatCLP(quote.total) : "—"}
          </div>
          {selected !== null && selectedStart !== null && (
            <p className="mt-1 label-sm text-gold">
              {selected} · {hhmm(selectedStart)}–{hhmm(selectedStart + duration * 60)} · {duration}h
            </p>
          )}

          {quote && (
            <ul className="mt-6 space-y-2.5 border-t hairline pt-5 text-sm">
              {quote.tierLines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3 text-bone-dim">
                  <span>Sala · {l.hours}h</span>
                  <span className="font-mono text-bone">{formatCLP(l.subtotal)}</span>
                </li>
              ))}
              {quote.addonLines.map((a) => (
                <li key={a.key} className="flex justify-between gap-3 text-bone-dim">
                  <span>{a.name}</span>
                  <span className="font-mono text-bone">{formatCLP(a.amount)}</span>
                </li>
              ))}
              {quote.discount < 0 && (
                <li className="flex justify-between gap-3 text-gold">
                  <span>Descuento</span>
                  <span className="font-mono">{formatCLP(quote.discount)}</span>
                </li>
              )}
            </ul>
          )}

          {error && <p className="mt-4 label-sm text-sirena">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!canPay}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform disabled:opacity-40"
          >
            {submitting ? "Redirigiendo…" : "Ir a pagar"}
            <span>→</span>
          </button>
          <p className="mt-3 text-center label-sm text-bone-mute">IVA incluido · pago seguro con Mercado Pago</p>
        </div>
      </div>

      {/* Barra fija móvil */}
      {selectedStart !== null && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t hairline bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
          <div>
            <div className="label-sm text-bone-mute">Total</div>
            <div className="font-display text-xl text-bone">{quote ? formatCLP(quote.total) : "—"}</div>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!canPay}
            className="inline-flex items-center justify-center gap-2 bg-gold px-6 py-3 label text-ink disabled:opacity-40"
          >
            {submitting ? "…" : "Ir a pagar"}
            <span>→</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-sm mb-3 block text-bone-mute">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck the widget**

Run: `npx eslint components/booking/BookingWidget.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/booking/BookingWidget.tsx
git commit -m "feat(reservar): single-screen two-pane widget with progressive disclosure + sticky CTA"
```

---

## Task 7: Full verification + manual walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: PASS, including the new `month-availability.test.ts` and `availability-service.test.ts`; existing tests still green.

- [ ] **Step 2: Lint + production build**

Run: `npx eslint . && npm run build`
Expected: both exit 0 (build also type-checks).

- [ ] **Step 3: Manual walkthrough against seeded local data**

Restart dev cleanly (the build rewrites `.next`): `npm run dev`. Open `http://localhost:3000/reservar` and confirm:
- Calendar renders the current month; past days and days beyond +90d are non-clickable; seeded `full` days are dimmed and `low` days show the small Sirena dot + the "Últimos cupos" legend.
- Right pane initially shows "Selecciona una fecha para ver horarios".
- Click an available day → spinner ("Cargando disponibilidad…") → slot list as `HH:MM – HH:MM` ranges reflecting the chosen duration.
- Change duration → slot list re-filters; a long duration on a sparse day shows "Sin horarios disponibles para esa duración."
- Pick a slot → "Tus datos" block appears (progressive disclosure); price + session chip show in the summary; the mobile sticky bottom bar appears at narrow widths.
- Enter an email → "Ir a pagar" enables and redirects to Mercado Pago.
- Month nav `‹ ›`: prev disabled in the current month; navigating forward fetches and repaints availability.

- [ ] **Step 4: Final commit (if any polish was needed)**

```bash
git add -A
git commit -m "chore(reservar): verification pass"
```

---

## Self-Review

**Spec coverage:**
- Month-grid calendar → Tasks 1, 5. Per-day availability (closed/full/low/open) → Tasks 1, 2, 3, 5. Loading/empty/closed states → Task 4. Urgency "low" cue → Tasks 1, 5. Progressive-disclosure contact fields → Task 6. Sticky CTA (desktop rail + mobile bar) → Task 6. Single-screen two-pane layout → Task 6. New month endpoint → Task 3. Graceful degradation on month-fetch fail → Task 6 (`setDayStatus({})`). Brand tokens/motion → Tasks 4–6. Tests → Tasks 1, 2, 7. Verification → Task 7. All spec sections map to a task.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has an expected result.

**Type consistency:** `DayStatus` defined in Task 1, consumed identically in Tasks 2, 5, 6. `classifyDay`, `monthGrid`, `monthDates`, `monthBoundsUtc` signatures match across tasks. `MonthAvailability` (`{ month, days }`) returned by Task 2, consumed as `d.days` in Task 6. `TimeSlots`/`Calendar` prop shapes in Tasks 4/5 match the props passed in Task 6. `hhmm` single definition (Task 4) reused in Task 6 (replacing the old inline copy).
