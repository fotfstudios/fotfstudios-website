# /reservar — conversion-optimized booking with month-grid calendar

**Date:** 2026-06-28
**Status:** Design approved, pending spec review
**Scope:** Redesign the public booking flow at `/reservar` for conversion, replacing
the native `<input type="date">` with a two-pane month-grid calendar + time-slot
panel (with loading/empty states), keeping FOTF brand guidelines.

## Context

The current booking widget ([components/booking/BookingWidget.tsx](../../../components/booking/BookingWidget.tsx))
is a single-page form whose date picker is a bare native `<input type="date">`
with start-times as a wrapping row of buttons. It works but is plain, gives no
sense of which days are open, and has no loading/empty affordances. The owner
wants the date picker rebuilt as a month-grid calendar (inspired by a reference
studio site), proper loading + empty states, and the **whole `/reservar` page
optimized for conversion** — i.e. more visitors completing payment.

Decisions made during brainstorming:
- **Structure:** Single screen, two-pane (Approach A). No multi-step wizard — the
  flow has only 4 inputs (duration, recording, date, time); extra steps would add
  drop-off without the product complexity that justifies La Selva's wizard.
- **Calendar smarts:** Show real per-day availability (dim closed/full days) →
  requires a new lightweight month-availability endpoint.
- **Urgency:** Yes — a subtle Sirena "últimos cupos" hint on days with 1–2 slots
  left (used sparingly, honest).
- **Contact fields:** Revealed only after a time slot is picked (progressive
  disclosure → lower upfront friction).

Out of scope: the multi-step wizard, customer accounts, changing pricing/payment
logic, the legacy WhatsApp estimator (`PriceCalculator.tsx`) stays as-is.

## Layout

Single screen. Duration + recording sit **above** the calendar (valid start-times
depend on duration). Two-pane calendar/slots is the centerpiece. Summary is a
sticky right rail (desktop) / sticky bottom bar (mobile).

```
DESKTOP                                         MOBILE (stacked)
┌─────────────────────────────┬────────────┐   Duración · Grabación
│ SESSION BAR  Duración Grab.  │  STICKY    │   Calendar (full width)
├──────────────┬──────────────┤  SUMMARY   │   Time slots
│  CALENDAR    │  TIME SLOTS  │  Total $   │   [contact reveal]
│  (month grid)│  (list+states)│ date·time │   ─ sticky bottom: Total · Pagar
│              │              │  [contact] │
└──────────────┴──────────────┤ [Ir a pagar]│
                              └────────────┘
```

## Components

| File | Status | Responsibility |
|---|---|---|
| `components/booking/Calendar.tsx` | new | Month grid (presentational). Props: `month`, `selectedDate`, `dayStatus`, `onSelectDate`, `onMonthChange`. Builds grid with Luxon, keyboard-accessible. |
| `components/booking/TimeSlots.tsx` | new | Right pane. Renders loading / empty / closed / slot-list. Props: `loading`, `closed`, `slots`, `selected`, `onSelect`. |
| `components/booking/Spinner.tsx` | new (tiny) | Gold ring spinner; text fallback under `prefers-reduced-motion`. |
| `components/booking/BookingWidget.tsx` | refactor | Orchestrator: state, fetching, layout, progressive-disclosure contact fields, sticky summary, submit. |

Each component has one clear purpose and a typed props interface so it can be
understood and tested independently of the orchestrator.

## Calendar behavior

- Week starts Sunday (`Su Mo Tu We Th Fr Sa`). Month label in `font-display`;
  hairline `‹ ›` nav buttons (hover → gold).
- **Day states:** `past` (before today-in-Santiago) and `closed`/`full` → dimmed,
  non-clickable; `open` → clickable; `low` → clickable + subtle Sirena cue
  ("últimos cupos"); `selected` → `bg-gold text-ink`; `today` → subtle gold outline.
- Prev arrow disabled before current month; forward navigation capped at a
  **90-day horizon**.
- **Graceful degradation:** if the month endpoint fails, calendar still works in
  past-only mode (all future days clickable; the slot pane handles closed/empty).

## Data flow + new endpoint

**New `GET /api/availability/month?resource=<id>&month=YYYY-MM`**
→ `{ days: { "2026-06-30": "open" | "low" | "full" | "closed", … } }`

- Backed by a new domain fn `getMonthAvailability(resource, month)` in
  `src/domain/scheduling/` that does **one** DB query for the month's reservations,
  groups them by Santiago-local day (reusing `toLocalMinutesInterval` /
  `dayBoundsUtc` from [time.ts](../../../src/domain/scheduling/time.ts)), and
  classifies each day via the existing `availableStartMinutes()` at 1h granularity:
  - no opening hours that weekday → `closed`
  - open but zero free 1h slots → `full`
  - 1–2 free 1h slots → `low`
  - ≥3 free → `open`
- Wired through the availability service / composition root, mirroring the existing
  per-day `getDayAvailability`.

**Flow:**
1. mount / month-change → fetch month → paint calendar
2. pick day → existing `GET /api/availability?resource&date` → compute slots with
   `availableStartMinutes(open, close, duration, booked)`
3. duration change → re-filter slots client-side from already-fetched day data (no refetch)
4. pick slot → reveal contact fields + fetch `GET /api/pricing/quote`
5. pay → existing `POST /api/bookings` → redirect to Mercado Pago `initPoint`

**Nuance:** calendar status is computed at min (1h) granularity. A day marked
`open` may still show "sin horarios para esa duración" if the visitor later picks a
long duration — the slot pane handles duration-specific filtering; the calendar is
a coarse availability hint, not a per-duration guarantee.

## Conversion levers

- **Progressive disclosure:** contact fields hidden until a slot is selected.
- **Always-visible live price** + selected-session chip (`30 Jun · 18:00–20:00 · 2h`).
- **One** primary gold CTA, sticky on both layouts.
- **Trust line:** "IVA incluido · pago seguro con Mercado Pago."
- **Fewer required fields:** email required; name/phone optional (labeled).
- **Subtle urgency:** Sirena "últimos cupos" on `low` days only.

## Brand fidelity

Reuses existing tokens only — `ink/bone/gold/sirena`, `hairline`, `.label`/
`.label-sm`, `font-display`, `grain`. Selected day and selected slot share the
existing `bg-gold text-ink` language. Heading animates via `MaskText`. All motion
respects `prefers-reduced-motion`. No new UI library (consistent with the
hand-built convention).

## Accessibility

- Calendar: day cells are `<button>`s with `aria-pressed`/`aria-disabled` and
  accessible labels (full date); arrow-key navigation is a nice-to-have.
- Slots: `<button>` with `aria-pressed`.
- Spinner: `role="status"` + visually-hidden text.

## Error handling

- Month fetch fails → past-only calendar fallback + `console.warn`.
- Day fetch fails → empty state with retry copy.
- `slot_taken` at pay → existing inline Sirena message.

## Testing (Vitest)

- Month-grid generation: weekday offsets, weeks count, DST month boundary
  (America/Santiago).
- Day-state classification (past/closed/full/low/open) from a `dayStatus` map.
- `getMonthAvailability` domain fn: given seeded bookings → expected statuses
  (incl. the 1–2-slot `low` threshold).
- Existing per-day availability tests remain green.

## Files touched (summary)

- **New:** `components/booking/Calendar.tsx`, `components/booking/TimeSlots.tsx`,
  `components/booking/Spinner.tsx`, `app/api/availability/month/route.ts`,
  `src/domain/scheduling/month-availability.ts` (+ test).
- **Modified:** `components/booking/BookingWidget.tsx`, availability service +
  `src/composition.ts` (new month method), possibly `app/reservar/page.tsx`
  (heading/intro polish).

## Verification

1. `npm run db:reset` (seeded demo bookings give the calendar real `full`/`low`
   days to render), `npm run dev`, open `/reservar`.
2. Confirm: calendar dims past + closed days, marks `low` days with the Sirena
   cue; picking a day shows the spinner then slots; empty/closed states render;
   contact fields appear only after slot pick; price updates live; sticky CTA on
   desktop + mobile.
3. `npm test` (new unit tests green) and `npx eslint . && npm run build` pass.
