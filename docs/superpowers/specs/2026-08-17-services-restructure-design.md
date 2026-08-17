# Services Restructure — Journey Ladder Design

_Date 2026-08-17 · brainstormed and approved section-by-section with the owner · builds on `docs/audits/2026-08-17-services-pricing-audit.md`_

## Context & objective

Primary objective: **revenue per customer** — deepen the product ladder so every customer
always has an obvious next purchase. Constraints fixed by the owner during design:

- **Additive + fix defects**: published room tiers ($9.990/$14.990/$19.990), volume
  discounts, and course prices are frozen. Audit P0 corrections ride along. One approved
  exception: the audio+video add-on **drops** $49.990 → **$39.990** (price decreases carry
  no trust cost; the old price was above market — see competitive data below).
- **Capacity**: teaching hours available (recruited DJs via `/unete`); **no**
  audio-mastering/video-editing capacity → all recording products are honest raw capture.
- **Utilization**: room mostly empty (<25%) → discounts are cheap, cannibalization is
  nearly free, and every new SKU defaults into valle (43% of open hours).

Structure chosen: **A — Journey Ladder** (over B "commitment layer only" and C "formal
Sala/Academia split"; C is explicitly deferred until two profitable course generations).

## Competitive reference (owner-supplied, supersedes scraped data)

La Selva Studio real session pricing:

| | 1h | 2h | 3h | Implied premium over rehearsal |
|---|---|---|---|---|
| Rehearsal | $14.990 | $27.990 | $39.990 | — |
| Audio recording | — | $37.990 | $49.990 | **+$10.000 flat** |
| Audio+Video | $49.990 | $64.990 | $79.990 | **+$35.000–40.000** |

Decode: their "recording services" are rehearsal + a flat deliverable premium. Consequences:
FOTF's $9.990 audio add-on is at **market parity** (amends audit finding S1); FOTF's old
$49.990 A+V add-on was **above** market (their entire 1h A+V session = that add-on alone),
hence the approved drop to $39.990.

## The menu (final)

| Rung | Price | Status |
|---|---|---|
| Sesión de prueba (1h guiada) | $19.990 · creditable 7 días | exists |
| Curso de Iniciación DJ | $79.990 p/p dúo · $139.990 individual | exists, frozen |
| **Pack Egresado** | **$39.990 · 5h valle** ($7.998/h ≈ −20%) · 90-day window post-course · one per graduate | new |
| **Packs de horas (valle)** | **8h $67.990** (≈−15%) · **12h $95.990** (≈−20%) · 90-day validity | new |
| **Perfeccionamiento 1:1** | $14.990/h (canonical) · **block 4×1h $54.990** (≈−8%) · 90-day validity | new framing |
| **Sesión de Grabación · Audio** | **2h $29.990 · 3h $35.990** (valle) | new |
| **Sesión de Grabación · A+V** | **1h $49.990 · 2h $59.990 · 3h $65.990** (valle) | new |
| Add-ons on any booking | audio $9.990 (unchanged) · **A+V $39.990** (was $49.990) | repriced ↓ |

Competitive position of the recording sessions vs La Selva: audio −21%/−28%; A+V parity/−8%/−17%.
Audio has **no 1h format** (a set needs length — copied from their menu structure).
All prices .990, IVA included. Ladder topology: beginners enter via prueba→curso; competent
DJs enter via grabación; both converge on packs / 1:1 / egresado.

## Mechanics (coherence rules)

1. **One discount instrument per booking, never stacked**: volume discount OR pack hours OR
   egresado hours. Standalone recording prices already embed the volume discount in their
   room component — no further discounts apply to them.
2. **Pack hours buy room time only, valle only** (L–V until 17:00). Hour-denominated
   credits, not pesos — no cross-tier exchange accounting. No pay-the-difference-for-peak
   in v1.
3. **Add-ons are always cash, on any booking type** — a pack holder pays $9.990 cash to
   record a pack session.
4. **Points**: all new SKUs earn the standard 5% on cash; points **cannot purchase** packs,
   egresado, or blocks (discounted instruments never meet a second discount instrument).
   Points still redeemable on standard bookings and add-ons.
5. **Valle-by-default scheduling** for everything new: course sessions, trials, 1:1, packs
   (mandatory), recording sessions (default; peak available at the published tier
   difference, shown before paying). This makes audit finding S4 structural.
6. **Expiry as bookkeeping, not weapon**: 90 days everywhere, published with the courtesy
   stance ("¿se te pasó? escríbenos").
7. **Single source of truth for every new price** — pack/recording/block constants live
   beside `RATES` in `lib/pricing.ts`, mirrored to DB where charged, so the D3 class of
   drift bug cannot recur in the new layer.

## Terms & policy changes (`app/terminos/page.tsx`, one `TERMS_VERSION` bump)

- **Packs/Egresado**: hour credits, personal (guests in-session welcome), valle-only,
  90-day validity + courtesy sentence; cancelling a pack booking ≥12h returns the hour to
  the pack (no money movement); **unused hours pro-rata refundable on request** within
  validity (SERNAC-friendly, near-zero cost at current utilization).
- **Course** (closes audit D5-course): 100% refund until 7 días before sesión 1; under
  7 días → transfer to next generación or a named replacement; once started → no cash
  refund, remaining sessions reschedulable within the generación; trial-credit window
  (7 días) stated formally.
- **1:1 blocks**: per-session bookings under normal 12h/24h rules; 90-day validity.
- **Recording sessions**: deliverable = captura directa sin postproducción, entrega
  digital ≤48h, material belongs to the customer, music rights are the customer's
  responsibility.
- **Riding along** (deferred audit P0/P1): reschedule clause rewrite (free move ≥12h,
  price difference settled), points terms (1 punto = $1, 5% on cash, claw-back on refund,
  prospective right to modify), razón social/RUT (owner data required), guided
  $14.990/h flat in marketing copy + calculator, `PRICING` JSON-LD fix
  ($9.990–$19.990), "Próximamente: clases y membresías" replaced by links to the live
  products.

## Implementation surface & phasing

**Phase 1 — zero new machinery (content + terms release):**

- Recording sessions: a "Grabación" marketing surface following the `/curso-dj` page
  pattern (colocated `_content.ts`, WhatsApp conversion, `whatsapp_click`-style events
  with `source`), sold at the closed prices via the WhatsApp→admin-manual motion. The
  DIY path (book hours + add-on in the widget, ~$2.000 cheaper) stays visible and is
  acknowledged on the page — the premium is stated convenience ("llegas y está todo
  configurado"), not information asymmetry. Widget-native recording SKUs are Phase 2.
- 1:1 blocks and Pack Egresado sold via WhatsApp, delivered via **admin manual bookings**
  (the course's existing motion); tracked in admin notes; volumes are single-digit during
  validation.
- A+V add-on reprice ($39.990: `lib/pricing.ts` ADDONS + DB `services` row + course
  included-value copy), guided-price marketing fix, JSON-LD fix, "Próximamente" line,
  full terms update, curso page gains the egresado mention.

**Phase 2 — pack credit ledger (gated on Phase 1 evidence):**

- Self-serve packs: `pack_ledger` modeled on the `points_ledger` pattern (idempotency
  unique index + sign checks, single-writer function), redemption in the booking flow,
  expiry job on the existing reconcile cron. Built **only after ~10 manually-sold packs**
  prove demand.
- Widget-native recording session SKUs (closed prices charged by the engine, ending the
  Phase 1 WhatsApp-only sale path).

## Sequencing & decision gates

Launch order: recording sessions → packs-via-WhatsApp → 1:1 blocks (as instructors
onboard) → egresado (activates when generación 01 graduates).

| Gate | Unlocks |
|---|---|
| ~10 manual pack sales | Phase 2 credit-ledger build |
| Editing/mastering capacity exists | "Set Producido" premium tier above $29.990 |
| Two profitable course generations | Approach C (formal Sala/Academia split) |
| Peak utilization materially rises | Revisit valle-only pack rule and floor pricing |

## Out of scope (explicitly)

Room tier/volume-discount changes, course reprice (gen 01), memberships/subscriptions
(packs are the v1 of that promise), email marketing, any mastered/edited deliverable,
points-program redesign (terms documentation only).
