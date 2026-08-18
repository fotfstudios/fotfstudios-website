# GTM/GA4 Analytics Audit — FOTF Studios

_Date 2026-08-18 · full code sweep + published-container fetch + live beacon verification · read-only except the `GTM_ID` guard comment shipped alongside this doc_

## Executive summary

The measurement **baseline is live and was verified end-to-end**: GA4 `G-5K07LY6W3N` is served through GTM container `GTM-WCC3V22R` (single loader, Consent Mode v2 gated), pageviews flow — including SPA route changes — and `whatsapp_click` (params `source`, `page`) arrives and is marked as a key event. Verification was empirical: live `/g/collect` beacons with HTTP 204 and the GA4 Realtime key-event card populating on a test click.

What the baseline *covers*, however, is a sliver of the business. **Only 2 of ~16 public WhatsApp CTAs are instrumented** (the `/curso-dj` and `/grabacion` components), so `whatsapp_click` undercounts and is structurally biased toward those two pages. **The online booking funnel — the only self-serve revenue path — emits zero events**: no checkout start, no purchase, across all three payment paths (classic MP redirect, Wallet Brick, 100%-points). And **staff/admin traffic is measured as if it were customers**, since GTM fires on `/admin/*` and `/cuenta/*` under Chile's granted-by-default consent.

One genuinely good security finding: **magic-link auth codes can never leak into GA4** — `/auth/callback` is a Route Handler that renders no HTML, so GTM never loads there; the PKCE `?code=` param dies in the redirect (`app/auth/callback/route.ts`).

| Severity | Count | Theme |
|---|---|---|
| P0 | 3 | money paths invisible to measurement (funnel, primary CTA, WhatsApp coverage) |
| P1 | 5 | data-quality pollution (admin traffic, URL params, event double-count, stale key events, /unete lead) |
| P2 | 4 | hygiene & watch items (consent law 2026, GSC link, UTM discipline, naming collision) |

None of these are site bugs — the site works. They are measurement blind spots and noise sources that make GA4 answer business questions wrongly or not at all.

## Verified-working baseline

| Piece | State | Evidence |
|---|---|---|
| GA4 config tag | Google Tag `G-5K07LY6W3N` (alias `GT-KD7KF83H`), trigger Initialization – All Pages, published | public `gtm.js` fetch; live `page_view` beacon HTTP 204 |
| `whatsapp_click` | GTM trigger `CE - whatsapp_click` + GA4 event tag with `DLV - Source`/`DLV - page`; **key event**, once-per-event, no value | beacon `en=whatsapp_click&ep.source=hero&ep.page=curso-dj`; Realtime key-event card |
| Consent Mode v2 | defaults `beforeInteractive`: analytics granted (rest of world incl. CL), denied in EEA/UK/CH; ads signals denied everywhere; choice persisted in `localStorage["fotf-consent"]` | `lib/consent.ts:22-38`, `app/layout.tsx:91-93` |
| SPA pageviews | Enhanced Measurement history events | `page_view` beacon on client-side route change |
| Auth token safety | `/auth/callback` is a Route Handler → no GTM, `?code=` never in a `page_view`; PKCE flow, no `#access_token` anywhere | `app/auth/callback/route.ts:16-45` |
| Vercel Analytics / Speed Insights | separate, automatic pageviews + vitals; only two custom `track()` calls (same two WhatsApp CTAs) | `app/layout.tsx:116-117` |

## P0 — money paths invisible

### A1 · Booking funnel emits zero events

No `dataLayer`, `track()`, or `gtag` anywhere in `components/booking/*`, `app/reservar/*`, `app/reserva/*`. GA4 cannot answer: how many people start checkout, how many pay, revenue by channel, funnel drop-off.

- **`begin_checkout`** belongs at `components/booking/BookingWidget.tsx:259-307` (`createBookingAndGetPreference()` success — `POST /api/bookings` returns `{orderId, preferenceId, …}`), value = payable CLP.
- **`purchase`** belongs in `components/booking/EstadoClient.tsx` at the poll transition to `paid` (L57). Three constraints discovered in code:
  1. **Three payment paths** must all land there: classic redirect (`submit()` L311), Wallet Brick (`MpWalletButton`, `redirectMode:"self"`), and **100%-points (`pointsSubmit()` L329) which skips Mercado Pago entirely** — keying anything off MP return params would miss it.
  2. **Value source**: `view.total` in the confirmation view is a `formatCLP` **string** (`lib/confirmation.ts:70-71`); the numeric source is the poll endpoint — `GET /api/orders/[id]/status` returns `{status, amount: amount_clp, currency}` (`route.ts:52`). `transaction_id` = order UUID.
  3. **De-dupe**: the page polls every 3 s and is revisitable. Guard: fire only on a non-terminal→`paid` transition observed in-session (the `TERMINAL.has(status)` early-return at L51 identifies returning visitors), plus GA4's own `transaction_id` dedupe as backstop.
- Do **not** trust MP's `?status=`/`?collection_status=` return params — `app/reserva/estado/page.tsx:28-35` already documents them as falsifiable messaging hints.

### A2 · The primary CTA is uninstrumented in both branches

`components/BookingCta.tsx` renders in Nav (desktop + mobile), Hero, CierreCTA and PriceCalculator. When `NEXT_PUBLIC_BOOKING_ENABLED=true` it links to `/reservar`; otherwise it falls back to `wa.me` — **neither branch pushes any event** (L51). The single most important click on the site is invisible. (`/reservar` is also `robots: {index:false}` + dynamic, so a landing on it is a strong intent signal worth counting.)

### A3 · 11 untracked public WhatsApp links (of ~16 total)

Tracked today: only the `WhatsAppCta` components on `/curso-dj` (3 placements) and `/grabacion` (2 placements). Untracked, by impact:

| # | Location | Why it matters |
|---|---|---|
| 1 | `components/Footer.tsx:25` | **sitewide** — highest volume untracked link |
| 2 | `components/sections/Precio.tsx:145` | "Compra por WhatsApp" for hour-packs — **a real revenue path with no measurement** |
| 3 | `components/BookingCta.tsx:51` | wa.me fallback branch (see A2) |
| 4 | `components/Hero.tsx:130` | home hero "¿Dudas?" link |
| 5–7 | `components/booking/EstadoClient.tsx:160,205,235` | confirmed / failed / refunded states — the *failed* one is a recovery signal |
| 8–9 | `app/terminos/page.tsx:157,330` | low volume |
| 10 | `app/cuenta/(panel)/reservas/page.tsx:53` | logged-in customers |
| 11 | `components/ClosureBanner.tsx:20` | dormant (`CLOSURE.active:false`) but will go live untracked next closure |

Net effect: `whatsapp_click` per page/source comparisons are biased — `/curso-dj` looks artificially dominant because it's one of only two measured surfaces.

## P1 — data-quality pollution

- **B1 · Admin/staff traffic measured as customers.** GTM fires on all of `/admin/*` (11 routes) and `/cuenta/*` (4 routes); Chile default consent is granted, so the owner's daily panel use inflates users/pageviews. `/admin/reservas/[id]` puts a booking UUID in the path → one GA4 page row per booking. Admin pages render customer name/email/phone on screen — safe today (`page_view` sends URLs, not DOM), but any future form/engagement tag in the container would capture PII there. **Fix is GTM-only, no deploy**: a blocking exception trigger (Page Path matches `^/(admin|cuenta)`) on all tags; optionally a GA4 internal-traffic IP filter for the studio.
- **B2 · Transaction identifiers in `page_location`.** `/reserva/estado?b=<orderUUID>` plus MP's appended `?status=…&collection_status=…` fragment landing-page reports and put a customer-linkable key in GA4 URLs. Mitigate in GTM (clean the page-path variable) and pass the UUID deliberately as `transaction_id` on `purchase` instead.
- **B3 · Double-counting WhatsApp clicks.** Enhanced Measurement's outbound `click` event fires on every `wa.me` link *in addition to* the custom `whatsapp_click` (both were visible in Realtime: `click: 4`). Treat `whatsapp_click` as canonical; optionally disable EM outbound clicks in the data stream.
- **B4 · Stale auto key events.** `close_convert_lead` and `qualify_lead` are marked key (property-creation defaults) and never fire — unmark to keep conversion reporting clean. `purchase` is present unmarked; mark it when A1 ships.
- **B5 · `/unete` submissions invisible.** `ApplicationForm.tsx` swaps to a success panel with **no route/URL change** (L102-134), so no GTM trigger can catch it — a `generate_lead` push at the success branch (L102) is the only clean option. Caution: `sentEmail` holds a raw email — never push it.

## P2 — hygiene & watch items

- **C1 · Consent posture vs Ley 21.719.** Chile's data-protection law enters into force Dec 2026. Today's granted-by-default for Chilean visitors is common practice now, but revisit before then (may require consent-first like the EEA branch, which the code already supports via the region list in `lib/consent.ts:8-12`). Also remember: ads signals (`ad_storage` etc.) are **denied everywhere until Accept** — relevant the day Google Ads remarketing is added.
- **C2 · No GSC ↔ GA4 link.** Search Console exists for the domain; linking it (GA4 Admin → Product links) brings query-level SEO data into GA4 — directly relevant to the `/curso-dj` SEO investment.
- **C3 · UTM discipline.** Realtime showed first-source "(no data)" = direct. Instagram-bio/social links should carry `utm_source`/`utm_medium` or all social traffic reads as Direct and the channel comparison is fiction.
- **C4 · Naming collision (docs note).** The repo's internal `analitica`/`analytics` domain (`app/admin/(panel)/analitica`, `src/domain/analytics/*`, RBAC `analytics.view`) is business metrics from the DB — unrelated to GA4. Don't conflate when grepping.

## Remediation plan (phased)

| Phase | Scope | Where | Effort |
|---|---|---|---|
| **0** | B1 blocking trigger `^/(admin\|cuenta)` on all tags · B4 unmark stale key events · C2 link GSC · (opt.) internal-IP filter | GTM + GA4 UI only — **no deploy** | ~30 min |
| **1** | A3 + A2: promote `WhatsAppCta` to a shared `components/` component (dedupe the two copies), apply to the 11 links; instrument `BookingCta` both branches (`booking_cta_click`, params `mode: online\|whatsapp`, `placement`) | one small PR | ~1–2 h |
| **2** | A1 + B5: `begin_checkout` (BookingWidget), `purchase` (EstadoClient, all 3 payment paths, numeric value from `/api/orders/[id]/status`, de-dupe guards), `generate_lead` (/unete). Then mark `purchase` key event in GA4. **Local-first with MP sandbox tunnel per CLAUDE.md** | PR + GA4 UI | ~half day incl. E2E |
| **3** | B2 URL cleanup in GTM · B3 decide EM outbound clicks · C3 UTM convention for social links · Ads linking when campaigns start | GTM/GA4 UI + ops habit | opportunistic |

## Method

Code sweep of every `wa.me`/`dataLayer`/`track`/`gtag` occurrence and the full booking/auth/forms surface; fetch of the published public container (`gtm.js?id=GTM-WCC3V22R`) to confirm shipped tags; live-site network verification of `page_view` and `whatsapp_click` beacons (HTTP 204, consent `gcs=G101`); GA4 Realtime cross-check. GA4 property: "FOTF Studios", id 543630438.
