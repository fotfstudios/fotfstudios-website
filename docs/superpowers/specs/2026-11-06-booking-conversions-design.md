# Booking conversions — accurate GA4 + Google Ads + Meta from the paid event

**Status:** proposed · **Date:** 2026-11-06 · **Surface:** `app/(booking)/` + `/api` + analytics

## Intent / why

Today the only "a booking happened" signal that reaches analytics is a **client-side
`purchase`** fired on `/reserva/estado` (`EstadoClient.tsx`), and only when the buyer lands
back there in a `paid`/`fulfilled` state. The public booking flow is MP-redirect + a bank-transfer
fallback that is **confirmed manually, later, off-page**. Result, measured against prod:

- 12 booking-kind orders ever; **a Mercado Pago Checkout Pro preference was created once (July)** —
  every booking since is bank **transfer**.
- Transfer bookings are confirmed by hand after the buyer has left, so `purchase` almost never
  fires for them. MP payers who close the tab / switch device before polling flips status also
  never fire it.
- Server side fires **nothing**: the MP webhook confirms payment and emails, but emits no GA4
  Measurement Protocol / Ads / Meta conversion.

So GA4, Google Ads and Meta all under-count real bookings badly, and ad platforms can't optimize
toward (or report true cost per) a booking. The owner wants accurate conversions in **all three**.

The authoritative "money is real" moment is the server flipping an order to `paid` (MP webhook, or
admin transfer confirmation, or reconcile). Conversions must originate there.

## Goals

1. Every **paid `kind='booking'` order — except those paid 100% with Beatcoins points** — produces
   exactly one conversion in **GA4, Google Ads, and Meta**, fired server-side from the authoritative
   paid event, carrying the **gross booking price** as `value` (CLP; not cash-after-discount), and
   credited to the originating ad click where one exists.
2. Idempotent and deduped: MP webhook re-deliveries never double-count; the server conversion
   dedups against any client-side `purchase`/pixel for the same order.
3. Bank-transfer bookings (today's majority) and off-page MP payers are counted — the whole point.
4. Internal GA4 funnel made honest enough to see **where** people drop: failure/abandonment events,
   a distinct transfer-pending state, and desktop step events.

## Non-goals

- Course / trial / practice conversions. Those lead flows already capture attribution
  (`lib/lead-attribution.ts`, `course_leads`) and are out of scope here. Only `kind='booking'`.
- Any CDP / event-pipeline build. Minimal columns and direct provider calls only.
- Changing how the DB decides truth (status still comes from the webhook/DB, never MP query params).

## Anti-goals (would make this a failure even if it "works")

- **Double-counting.** A booking that shows as 2 conversions anywhere is worse than the status quo.
- **Firing before money is real** (e.g. on `begin_checkout`, on a pending transfer, on MP `?status=`).
- Blocking the existing synchronous booking/webhook response on slow provider calls (conversions
  must be best-effort / out-of-band, never break checkout or webhook ack).

## Constraints (the ground this sits on)

- Next.js 15 App Router, React 19, Vercel, prod domain `fotfstudios.cl`. Prod Supabase
  `pjpjtjxfjffwblcxbsty`; migrations in `supabase/migrations/` are the source of truth and
  **prod migrations are gated behind owner approval** (code using new columns breaks prod until the
  migration is live — split migration-only PRs first).
- GTM container `GTM-WCC3V22R` carries GA4 `G-5K07LY6W3N` and the Meta pixel. GA4/GTM only load in
  production (or `NEXT_PUBLIC_GTM_FORCE`); the whole GA4 funnel is Consent-Mode gated. Vercel
  `<Analytics/>` is always mounted and ungated.
- Consent Mode defaults to **granted** for Chile (post-#312) and **denied** for EEA+UK+CH
  (`lib/consent.ts`).
- Local-first testing is mandatory: stub the provider gateways, verify via logs/Mailpit locally;
  real conversions are smoke-tested only in prod with one small booking.
- Secrets live in Vercel env vars, scoped per environment; never committed.

## Current state / what already exists (reuse this)

- **Lead attribution already solved for leads:** the `CLICK_ID_RE` / `ATTRIBUTION_CAPS` constants
  live in `src/domain/course/attribution.ts` (`lib/lead-attribution.ts` is the browser-side reader),
  mirrored into SQL check constraints (see
  `supabase/migrations/20261020120000_course_leads_origen.sql` adding `gclid`/`fbclid` to
  `course_leads`). We mirror this for orders rather than inventing a new validator.
- **The booking funnel stores NO attribution:** `orders`/`reservations` have no `gclid`/`fbclid`/
  `utm_*`, and nothing anywhere captures the GA4 `client_id` (`_ga` cookie) or Meta `_fbp`/`_fbc`.
  This is the prerequisite gap.
- Client funnel events exist and are clean (`lib/analytics.ts`): `view_item`,
  `booking_slot_selected`, `add_to_cart`, `booking_step` (mobile-wizard only), `login`,
  `begin_checkout`, `checkout_error`, `purchase`. `whatsapp_click` is the known GA4 key event.
- Order→paid transitions happen in: `app/api/webhooks/mercadopago/route.ts` (MP), the admin
  transfer-confirmation action, and reconcile paths. `booking_events` is the per-order ledger.

## The design (decided)

### Workstream A — capture attribution on the order *(prerequisite; PR1 + PR2)*

- **DB (PR1, migration-only):** add nullable columns `gclid, gbraid, wbraid, fbclid, fbc, fbp,
  ga_client_id, ga_session_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  referrer_host, landing_path` to `orders` (child table `order_attribution` keyed by `order_id` is
  acceptable if preferred to keep `orders` narrow — **builder's call**, default: columns on `orders`).
  SQL check constraints mirror `CLICK_ID_RE`/`ATTRIBUTION_CAPS` exactly as `course_leads` does.
- **Client (PR2):** on `/reservar` landing, persist URL click-IDs the way leads already do; at
  submit read `_ga` → `client_id` + `session_id`, read `_fbp`/`_fbc`, and include all of it in the
  `POST /api/bookings` body. Degrade silently if cookies absent (consent-denied / no GTM).
- **Server (PR2):** `app/api/bookings/route.ts` validates (reuse `CLICK_ID_RE`/`ATTRIBUTION_CAPS`
  from `src/domain/course/attribution.ts`) and persists onto the order at creation. **No conversion
  fired here** — not paid yet.

### Workstream B — server-side conversion on paid *(core fix; PR3)*

- One idempotent **`emitBookingConversion(orderId)`** (`src/application/...`) called from every
  paid transition: MP webhook, admin transfer-confirm, reconcile.
- **Idempotency:** guard on a new `booking_events` type `conversion_sent` (preferred — fits the
  ledger) so re-deliveries and multiple call sites emit at most once per order.
- **Out-of-band:** must not block the webhook ack / booking response; best-effort with its own
  error capture (a failed provider call logs + can be retried, never breaks payment confirmation).
- **Eligibility:** `kind='booking'`, status truly `paid`/`fulfilled`, **and not paid 100% with
  Beatcoins points** (loyalty redemptions aren't ad-driven — excluded). `value` = **gross booking
  price in CLP** (the slot's worth, before points/promo discounts), same for all three platforms.
- **Fan-out:**
  1. **GA4** — Measurement Protocol `purchase`: `transaction_id = orderId` (dedups with the client
     `purchase`), `value`, `currency:"CLP"`, items, stored `client_id` (+ `session_id` for session
     stitching). Needs `GA4_MEASUREMENT_ID` + `GA4_API_SECRET`.
  2. **Google Ads** — primary: server **offline conversion import** keyed on stored `gclid`
     (accurate for off-page/transfer). Fallback/also-on: mark GA4 `purchase` a key event and import
     it into Ads. Needs an Ads conversion action + API access (OAuth/dev token) for the offline path.
  3. **Meta** — Conversions API `Purchase`: `event_id = orderId` (dedups with the browser pixel),
     `user_data` = `fbc`/`fbp` + SHA-256 email/phone, `custom_data` = value/currency/content. Needs
     `META_PIXEL_ID` + `META_CAPI_TOKEN`.
- **Consent (decided, owner-confirmed 2026-11-06):** server events bypass browser Consent Mode, and
  the policy is **always fire everything** — GA4 + Ads + Meta, with full user-data, for all eligible
  paid bookings regardless of the browser consent choice. Market is Chile (granted default); EEA/UK/CH
  traffic is negligible. Consequence: **no consent/region column is needed** in PR1/PR2.

### Workstream C — internal diagnostics *(PR4; independent of A–B)*

- **Failure/abandonment events** in `EstadoClient.tsx`: `checkout_failed`, `checkout_refunded`,
  `checkout_expired`, `checkout_pending` in the Failed/Refunded/ExpiredHold/PendingPayment branches
  (today only `whatsapp_click` fires there).
- **Transfer-pending**: `booking_pending_transfer` when the transfer path is chosen; the real
  conversion is Workstream B on confirmation (NOT a page-return `purchase`).
- **Desktop step events**: `booking_step` (`datos`/`pago`) fires on the desktop layout, not only the
  mobile wizard (`BookingWidget.tsx:322-328`).

### Verification

- Stubbed GA4/Ads/Meta gateways; unit tests for attribution capture + validation, the fan-out, and
  idempotency; an itest for paid→`conversion_sent`. Local run uses stubs + logs; prod smoke = one
  small real booking, confirm one conversion per platform and no dupes.

## Sequencing (PRs; respects the prod-migration gate)

1. **PR1** — attribution migration (DB-only). Ship and get prod migration approved/live first.
2. **PR2** — client capture + server persist on order create (depends on PR1 live).
3. **PR3** — `emitBookingConversion` fan-out + idempotency, wired into webhook + transfer-confirm.
4. **PR4** — internal diagnostics (independent; can run in parallel with PR2/PR3).

## Left to the builder

- `order_attribution` child table vs columns on `orders` (default: columns on `orders`).
- Exact module placement of `emitBookingConversion` and the three gateway clients (follow existing
  `src/application` / `src/infrastructure` layering).
- Whether Google Ads is wired via offline `gclid` import now or GA4-import only in PR3, with the
  other as a fast-follow (default: GA4 MP + Meta CAPI + GA4→Ads import in PR3; server offline
  `gclid` upload as PR3b if the Ads API setup lands in time).
- Event-name final spelling for the diagnostics (follow `lib/analytics.ts` conventions).

## Owner-only decisions / config (deploy-time; do not block PR1)

- GA4 Measurement Protocol **API secret** (per data stream).
- Google Ads **conversion action** + whether to grant Ads API access for server offline `gclid`
  upload, or stay on GA4-import only.
- Meta **Pixel ID + CAPI access token**.

(The EEA consent default and the conversion-value rule were decided 2026-11-06 — see Goals and
Workstream B.)

## Builder-check resolutions (2026-11-06)

A fresh-engineer read of this doc raised four points. Two are settled here as the author's call;
two are owner decisions carried into the questions below (and folded back in once answered).

**Settled (author's call):**

- **Cookieless GA4 `client_id`.** GA4 Measurement Protocol drops any event lacking a `client_id`.
  When no `_ga` cookie was captured (consent-denied, GTM not loaded, off-device/off-page payer),
  `emitBookingConversion` **mints a deterministic synthetic `client_id` derived from the order id**
  so the booking still produces exactly one GA4 conversion (unattributed to a GA session). This
  keeps Goal 1 literally true; attribution is best-effort, counting is not.
- **Idempotency schema ships in PR1.** The guard is a new **`orders.conversions_sent_at timestamptz`
  column added in PR1's gated migration** (chosen over a `booking_events.type='conversion_sent'`
  value specifically to avoid the CHECK-constraint drop/re-add that a new event type forces, and to
  keep all gated schema in the single PR1 approval). PR3's fan-out reads/sets it; no second gated
  migration before PR3.
- **Enumerate every paid transition.** PR3 must wire `emitBookingConversion` into **all** sites that
  flip an order to `paid`/`fulfilled` — MP webhook, admin transfer-confirm, the `paidWithPoints`
  synchronous path in `/api/bookings`, the `/reserva/estado` polling flip, and the reconcile cron.
  The builder audits the code to find them all; missing one means those bookings silently never
  convert. (`conversions_sent_at` makes the fan-out safe to call from every one of them.)

**Owner decisions (resolved 2026-11-06, folded into Goals / Workstream B):**

- **Conversion `value` + zero-cash bookings** → gross booking price (CLP, before discounts);
  **100%-Beatcoins bookings are excluded**; cash/partial-points/promo bookings count at gross.
- **Server-side consent / EEA policy** → **always fire everything** (full user-data, all platforms,
  regardless of browser consent). No consent/region column needed in PR1/PR2.
