# Services & Pricing Strategy Audit — FOTF Studios

_Date 2026-08-17 · code inventory + live competitor probe (laselvastudio.cl) · read-only, no changes applied · remediation deferred by owner decision_

## Executive summary

The pricing architecture is unusually coherent for a v1 business: time-of-day yield tiers where the reference competitor charges flat, discounts that reward in-booking commitment instead of prepaid lock-in, a paid trial that acts as a creditable deposit, tax-included pricing computed as a residual so `net + IVA = total` holds structurally, and refund/reschedule tiers whose published numbers match the code exactly. The new course line prices its promoted format (dúo) to yield **+14% per cabin-hour** over the individual format — presentation and economics point the same way.

The audit found **four P0 defects** — all customer-facing money or legal exposure, none structural: the 1:1 guided session is quoted at one price by the marketing calculator and charged at a higher one by the server; the public T&C promise "sin costo" reschedules while the code settles price deltas; the home page's JSON-LD advertises a price range (`$14.990 – $24.990`) whose floor contradicts the visible page and whose ceiling corresponds to nothing in the codebase; and the T&C carry unfilled `[RAZÓN SOCIAL]`/`[RUT]` placeholders in production. Two P1 gaps follow (points and course have zero T&C coverage; a "Próximamente: clases" line is now half-false), plus six strategy decisions that are opportunities rather than bugs.

| Severity | Count | Disposition |
|---|---|---|
| P0 | 4 | live customer-facing money/legal exposure; all cheap fixes; **deferred by owner (2026-08-17)** |
| P1 | 2 | documentation/copy gaps |
| Strategy | 6 | decisions, not defects; revisit with utilization data |

## The monetized surface (complete inventory)

| Service | Price | Source of truth |
|---|---|---|
| Sala por hora — valle (L–V apertura→17:00) | $9.990/h | `lib/pricing.ts:34-38` = DB `supabase/migrations/20260625214245_foundations.sql:171-174` |
| Sala — punta semana (L–J 17:00→cierre) | $14.990/h | idem |
| Sala — punta finde (V 17:00→D cierre) | $19.990/h | idem |
| Volume discount (single booking) | 2h −10% · 3h −15% · 4h+ −20% | `lib/pricing.ts:68-72` = DB `foundations.sql:176-177` |
| Sesión 1:1 guiada | **conflicting — see D1** | DB: $14.990/h flat (`20260701000000_guided_addon.sql:5`) |
| Grabación audio (add-on) | $9.990 flat | `lib/pricing.ts:74-81` = DB `foundations.sql:180-181` |
| Audio + video (add-on) | $49.990 flat | idem |
| Curso de Iniciación DJ — dúo | $79.990 p/p ($159.980/cabina) | `app/curso-dj/_content.ts:38-43` · WhatsApp-only, no checkout |
| Curso — individual | $139.990 | idem |
| Sesión de prueba (1h guiada) | $19.990, 100% creditable in 7 days | idem |
| Puntos FOTF | 5% earn on cash · 1 pt = $1 · redeemable to 100% · **no expiry** | `src/domain/points/points.ts:9,48-58`; SQL authority in `customers_points.sql` |
| Refunds | ≥24h 100% · 12–24h 50% · <12h/no-show 0% (on live boleta) | `src/domain/scheduling/cancellation-policy.ts:25-26,43-49,75-79` |
| Reschedule | Free & unlimited ≥12h; price delta settled (refund / pay-to-move, 24h window); blocked on points-paid orders | `cancellation-policy.ts:27-28,62-72` · `reschedule.ts:15-20` · `reschedule-service.ts:17,77` |
| Holds | 10 min web checkout · 72h manual/admin | `payment-service.ts:19` · `src/composition.ts:211-213` |
| Tax | IVA 19% included; residual so `net + tax = total` | `foundations.sql:183` · `src/domain/money/money.ts:18-25` |
| Courtesy bookings | $0, no order/boleta/points; exempt from policy, may sit outside opening hours | `app/admin/(panel)/reservas/nueva/actions.ts:45-76` |

**Not present** (confirmed absent): memberships, packs, subscriptions, gift cards, deposits, no-show/late fees. The only membership signal is marketing copy (see D6).

### Capacity mix

93 open hours/week (`OPENING`, `lib/pricing.ts`): **valle 40h (43%) · punta semana 20h (21.5%) · punta finde 33h (35.5%)**. Nearly half the sellable inventory sits at the floor rate — a defensible acquisition posture for a new studio, and the number to re-examine once utilization data exists (see S6).

## What is solid (keep)

- **Yield-managed tiers vs the market's flat rate** — the reference competitor prices every hour identically at $14.990; FOTF undercuts the floor by 33% and captures +33% at weekend peak.
- **Commitment without lock-in** — volume discounts (−10/15/20%) live inside a single booking. The competitor's equivalent (−15/20/25%) requires $101.932–$269.820 prepaid with 2–3 month expiry.
- **Trial-as-deposit** — the $19.990 trial credits fully against the course within 7 days: a filter and a down payment, not a discount product.
- **Dúo course economics** — $159.980 per cabin for the same 12 hours vs $139.990 individual: **+14% cabin-hour yield** on the format the page visually promotes.
- **Policy honesty where it's implemented** — T&C refund/reschedule numbers match code exactly (24h/12h, 100/50/0), boundaries inclusive in the customer's favor; refunds computed on the live boleta; every refund emits a nota de crédito.
- **Tax integrity** — prices IVA-included, tax defined as residual at every construction site; no surcharges.
- **Gate-on-money principle** — courtesy (money-free) operations bypass customer-protection policy by design, consistently.

## Findings (defects, ranked by exposure)

### [P0] D1 — The 1:1 guided session has two prices; customers see the cheaper one first

**Evidence** — marketing side: `components/PriceCalculator.tsx:68-72` → `lib/pricing.ts:200-208` price coach-hours at the **tier rate** (from $9.990 in valle) and include them in the volume-discount base; the copy promises it (`components/sections/Precio.tsx:65` "aplica también al 1:1", `:77` "misma tarifa/h"). Server side: the DB `guided` add-on is **$14.990/h flat** (`supabase/migrations/20260701000000_guided_addon.sql:5`) and `src/domain/pricing/engine.ts:49-62` **excludes add-ons from the volume discount**. A 2h-valle + 1h-guided booking quotes lower on the home page than it charges at checkout. `app/terminos/page.tsx:110` binds the business to "precios vigentes publicados en el sitio al momento de reservar" — the published (lower) price is the contractual one.

**Decision recorded 2026-08-17:** canonical price = **$14.990/h flat, no volume discount** (server is correct). Fix direction when picked up: bring the calculator and Precio copy **down** to the server's truth — not the server up.

### [P0] D2 — T&C say reschedule is "sin costo"; code charges the price difference

**Evidence** — `app/terminos/page.tsx:121-129` ("sin costo", unlimited, ≥12h) vs `src/domain/scheduling/reschedule.ts:15-20`: moving to a costlier slot creates a **delta order** and the booking does not move until it is paid (`reschedule-service.ts:132-140`, 24h payment window at `:17`). The policy itself is reasonable; the published description of it is wrong. Sharpest policy-vs-copy mismatch in the audit.

### [P0] D3 — Home JSON-LD advertises a fictional price range

**Evidence** — `lib/site.ts:118-121`: `PRICING = { from: "$14.990", priceRange: "$14.990 – $24.990" }`. `priceRange` feeds the `LocalBusiness` JSON-LD (`app/page.tsx:37`), telling search engines the floor is $14.990 while the same page renders "Desde $9.990" (`Precio.tsx:20`). **$24.990 matches no rate, add-on, or combination in the codebase** (only occurrence: this constant). `PRICING.from` is referenced nowhere — dead code. The const's own doc comment orders it kept in sync with `RATES`; it is not.

### [P0] D4 — `[RAZÓN SOCIAL]` and `[RUT]` are unfilled placeholders on the live T&C

**Evidence** — `app/terminos/page.tsx:55-56`. Undermines the enforceability of every clause on the page, including the refund tiers the code implements faithfully. Requires owner data; five-minute fix once supplied.

### [P1] D5 — Points and course carry monetary promises with zero T&C coverage

**Evidence** — the 5% program (`points.ts:9`; customer copy at `app/cuenta/(panel)/page.tsx:55`) has **no expiry, allows negative balances, and is redeemable to 100% of a booking** — an open-ended liability with no published terms: no "1 punto = $1" definition, no forfeiture/claw-back clause (the code does claw back on refunds — pro-rata restore at `points.ts:27-29`), no right-to-modify. The course promises "pago 100% anticipado" (`app/curso-dj/_components/Precios.tsx:73`) at $79.990–$139.990 with **no cancellation/refund/cupo-forfeiture clause anywhere**. First dispute on either has nothing in writing to point at.

### [P1] D6 — "Próximamente: clases y membresías" is half-false

**Evidence** — `components/sections/Precio.tsx:88-90`, add-ons card footer. Las clases exist: `/curso-dj` is live and promoted from the same home page (section 07). "Membresías" remains genuinely future (see S2). One-line copy fix.

## Strategy gaps (decisions, not defects)

- **S1 — Recording ladder hole.** $9.990 raw capture → $49.990 full video, nothing between. The competitor's flagship is mastered audio at $37.990 ("POPULAR"). A "set producido" tier (~$29.990–34.990: mastered + delivered) is the cheapest new-revenue product available; the gear already exists.
- **S2 — No recurrence product.** Points (5%) are the only retention mechanic. Competitor packs (−15/25% prepaid, expiring) validate demand for prepay. A pack with generous/no expiry would monetize commitment without betraying the no-lock-in brand — and the "membresías" teaser has been public since launch.
- **S3 — No course→room bridge.** Graduates are the natural future hourly renters; nothing prices the transition (e.g., an alumni valle pack). The course is a customer factory with no conveyor at the exit.
- **S4 — Course and trial are time-blind; the room is yield-managed.** Course cabin-hour yield ($11.666 individual / $13.332 dúo) sits below punta rates; a Saturday trial at $19.990 sells a slot whose à-la-carte guided price is $34.980 (canonical). Cheap structural fix: schedule course sessions and trials in valle/shoulder windows by default. Only bites if peak actually sells out.
- **S5 — Naming fragmentation.** "Sesión 1:1 guiada" (home) and "sesión guiada de prueba" (course) are near-identical products with different names and, until D1 is fixed, different prices. Unify the language.
- **S6 — Valle-heavy inventory (43%).** Fine as acquisition posture; revisit the floor and tier boundaries when GA4/Vercel utilization data accumulates.

## Competitive reference — La Selva Studio (Santiago, laselvastudio.cl, probed 2026-08-17)

| Their product | Price | Notes |
|---|---|---|
| Práctica DJ | desde $14.990/h flat | No time-of-day tiers; sessions 1–3h |
| Pack 8h / 12h / 24h | $101.932 / $143.904 / $269.820 | −15/−20/−25% → $12.742/$11.992/$11.243 per h; expire in 2–3 months |
| Grabación audio | desde $37.990 (flagship, "POPULAR") | Multitrack, mastering, delivery, support |
| Audio + video | desde $49.990 | Multi-cam, basic edit, lighting |
| Course/classes | **none** | FAQ welcomes beginners but sells no structured product |

Funnel: prices semi-hidden ("desde" + login-gated booking), free-visit lead magnet, "Jungle Energy" loyalty + merch shop, WebPay, 24h cancellation. Strategic read: they package **products** (recording as flagship); FOTF packages **time** (yield tiers). FOTF wins on floor price (−33%), transparency, and frictionless booking; they win on recording monetization and prepaid cash flow. FOTF's course occupies a segment they explicitly attract and don't monetize. Different metro (Santiago vs Viña del Mar) — reference anchor, not a walk-in rival.

## Course ↔ hourly alignment (canonical pricing)

À-la-carte equivalent of the individual course, valle scheduling, **at the canonical guided price** ($14.990/h flat, undiscounted):

| Component | À la carte |
|---|---|
| 4× clase 2h (room 2×$9.990 −10% + coach 2×$14.990) | $191.848 |
| Práctica libre 4h (one block, −20%) | $31.968 |
| Set final audio + video | $49.990 |
| **Total DIY** | **$273.806** |
| **Curso individual** | **$139.990 (−49%)** |

(Under the defective marketing calculator the DIY total is $225.814 / −38% — the earlier "trial ≈ exact valle guided parity" observation was an artifact of D1; canonically the trial is a −20% taster: $19.990 vs $24.980.) Per-cabin-hour yield: individual $11.666 · dúo $13.332 (+14%). Bundle discount (−49%) deeper than the max volume discount (−20%): correct shape for a productized bundle, and a value-stack story the page never tells (see roadmap).

## Recorded decisions (2026-08-17)

1. **1:1 guided canonical price: $14.990/h flat, excluded from volume discounts.** Server/DB stands; marketing calculator + copy are the defect.
2. **Remediation deferred** — owner chose audit-only; no code, pricing, or terms changed. Until D1 is fixed the site actively under-quotes guided sessions relative to checkout, with `/terminos:110` pointing at the published (lower) price.

## Remediation roadmap (for whenever this is picked up)

| Priority | Item | Touches |
|---|---|---|
| P0 | Align calculator + Precio copy to $14.990/h flat guided (D1) | `lib/pricing.ts`, `components/PriceCalculator.tsx`, `components/sections/Precio.tsx` |
| P0 | Rewrite reschedule clause: free to move ≥12h, price difference settled (D2) | `app/terminos/page.tsx` (+ bump `TERMS_VERSION`) |
| P0 | Fix/simplify `PRICING` → real range $9.990–$19.990; delete dead `from` (D3) | `lib/site.ts`, `app/page.tsx` |
| P0 | Fill razón social / RUT (D4 — owner data) | `app/terminos/page.tsx` |
| P1 | Draft points + course terms sections (D5) | `app/terminos/page.tsx` (+ `TERMS_VERSION`) |
| P1 | Update "Próximamente" line → link the live course (D6) | `components/sections/Precio.tsx` |
| P2 | S1–S6: produced-recording tier, pack design, alumni bridge, scheduling windows, naming, floor review | strategy work, data-dependent |

## Amendment — 2026-08-17 (later same day)

Owner-supplied La Selva session pricing (rehearsal 1/2/3h $14.990/$27.990/$39.990; audio
2/3h $37.990/$49.990; A+V 1/2/3h $49.990/$64.990/$79.990) supersedes the scraped "desde"
figures and **revises finding S1**: their recording prices decompose as rehearsal + a flat
deliverable premium (audio **+$10.000**, video **+$35.000–40.000**). Therefore FOTF's
$9.990 audio add-on is at **market parity** (not underpositioned, as originally claimed),
while the $49.990 A+V add-on was **above** market — their entire 1h A+V session equals
that add-on alone. Owner decision (same day): A+V add-on reprices to **$39.990**
(customer-favorable). The restructure that absorbs this and the S-series gaps is specified
in `docs/superpowers/specs/2026-08-17-services-restructure-design.md`.
