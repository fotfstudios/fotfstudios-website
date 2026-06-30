# Google Consent Mode v2 + cookie banner (region-scoped)

**Date:** 2026-06-29
**Status:** Design approved, pending spec review
**Scope:** Add Google Consent Mode v2 with a hand-rolled, on-brand cookie banner that
gates the existing GTM container (`GTM-WCC3V22R`) by region.

## Context

GTM was just installed site-wide ([app/layout.tsx](../../../app/layout.tsx)) via
`next/script` (`afterInteractive`) + a `<noscript>` iframe. It currently fires for
everyone with no consent gating. We want **Consent Mode v2**: set default consent
signals *before* GTM loads and let visitors change them via a banner.

Brainstorming decisions:
- **Hand-rolled banner** (no third-party CMP), on-brand (Ink/Bone/Gold).
- **Region-scoped posture:** EEA + UK + Switzerland → all signals **denied** by
  default (opt-in gate); everywhere else (incl. Chile, the primary audience) →
  `analytics_storage` **granted** by default, banner shown as a dismissible notice.
  Consent Mode resolves the visitor's region itself via the `region:` array, so **no
  server-side geo detection is needed**.
- **Simple Accept/Reject** (the site only runs analytics today); granular per-category
  toggles are out of scope.
- Banner links to **`/privacidad`** (see "Known gap" — that route does not exist yet).

Out of scope: a third-party CMP, granular category toggles, writing the
`/privacidad` policy page content, and any Google Ads tags.

## Architecture

| Unit | File | Responsibility |
|---|---|---|
| Consent config + helpers | `lib/consent.ts` *(new, pure)* | EEA/UK/CH country codes, signal keys, `buildConsentDefaultScript()` (returns the inline JS string), `STORAGE_KEY`, `parse`/`serialize` of the stored choice. Single source of truth; unit-tested. |
| Default signal | `<Script id="consent-default" strategy="beforeInteractive">` in `app/layout.tsx` | Runs **before** the GTM bootstrap; sets region-scoped defaults and re-applies any stored choice synchronously (no banner flash for returning visitors). |
| Banner UI | `components/ConsentBanner.tsx` *(new, client)* | Renders the bottom banner for first-time visitors; on Accept/Reject calls `gtag('consent','update',…)`, persists the choice, hides. Listens for an `open-consent` event to reopen. |
| Reopen link | `components/Footer.tsx` *(modify)* | A "Preferencias de cookies" button in the footer bottom bar that dispatches `window` event `open-consent`. |

`beforeInteractive` scripts are only allowed in the root layout (where this lives)
and always execute before `afterInteractive` (GTM), so the default is set before GTM
reads consent — regardless of JSX order.

## Consent signals

Built by `buildConsentDefaultScript()` and rendered inline before GTM:

```js
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
// Global default (outside EEA, incl. Chile): analytics on, ad signals off (no ad tags).
gtag('consent','default',{
  analytics_storage:'granted', ad_storage:'denied',
  ad_user_data:'denied', ad_personalization:'denied', wait_for_update:500,
});
// EEA + UK + CH: deny everything until opt-in.
gtag('consent','default',{
  region:['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
    'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH'],
  analytics_storage:'denied', ad_storage:'denied',
  ad_user_data:'denied', ad_personalization:'denied', wait_for_update:500,
});
// Re-apply a previously stored choice (returning visitor) so it persists pre-GTM.
try {
  var s = localStorage.getItem('fotf-consent');
  if (s) { var c = JSON.parse(s);
    gtag('consent','update',{
      analytics_storage:c.analytics, ad_storage:c.analytics,
      ad_user_data:c.analytics, ad_personalization:c.analytics });
  }
} catch (e) {}
```

- **Accept** → `gtag('consent','update',{ analytics_storage:'granted', ad_storage:'granted', ad_user_data:'granted', ad_personalization:'granted' })`
- **Reject** → same shape, all `'denied'`.
- (Ad signals are toggled together with analytics for now since there are no ad tags;
  this keeps the stored shape simple and future-proofs a later Ads tag.)

## Banner UX & persistence

- **Visibility:** rendered only when no choice is stored (`localStorage['fotf-consent']`
  absent). Shown to all first-time visitors — a gate in EEA, a notice elsewhere.
- **Content (Spanish, on-brand):** short copy ("Usamos cookies para medir el tráfico…"),
  **Aceptar** (Gold) / **Rechazar** (hairline) buttons, link "Más información" →
  `/privacidad`. Fixed bottom, Ink panel, Bone text, `.label`/`.label-sm` type,
  `hairline` border, `grain` optional; respects `prefers-reduced-motion`.
- **On choice:** write `{ analytics: 'granted'|'denied', ts }` to `localStorage`,
  call the `gtag` update, hide. ~13-month implicit lifetime (localStorage; cleared
  only by the user) — re-prompt logic not in scope.
- **Reopen:** the footer button dispatches `window.dispatchEvent(new Event('open-consent'))`;
  the banner listens and re-renders so anyone can change their mind.

## Known gap

`/privacidad` does **not** exist yet. The banner link will 404 until a privacy/cookies
policy page is added (separate content task). Flag to the user; do not block on it.

## Testing

- **Unit (Vitest)** on `lib/consent.ts`:
  - region list contains representative EEA codes (`'ES'`,`'DE'`,`'FR'`), `'GB'`, `'CH'`, and excludes `'CL'`/`'US'`;
  - `buildConsentDefaultScript()` output contains both `consent','default'` calls, the `region:` array, `analytics_storage:'granted'` (global) and `'denied'` (EEA), and the stored-choice re-apply block;
  - `serialize`/`parse` round-trip a `{ analytics, ts }` choice and `parse` tolerates malformed input (returns null).
- **Browser / manual:** load the site → banner shows; Accept → `gcs`/`gcd` params on
  the `googletagmanager.com` requests reflect granted, `dataLayer` shows the update,
  choice persists across reload (banner gone). GTM **Tag Assistant** consent view
  shows default → update. Reject path mirrors with denied.
- eslint + build green.

## Files

- **New:** `lib/consent.ts`, `lib/consent.test.ts`, `components/ConsentBanner.tsx`.
- **Modify:** `app/layout.tsx` (add the `beforeInteractive` consent-default Script
  before the GTM Script; render `<ConsentBanner/>` in `<body>`), `components/Footer.tsx`
  (reopen link).

## Verification

1. `npm run dev`; first load shows the banner. DevTools → `dataLayer` has the two
   `consent default` entries; no `analytics_storage:'granted'` update yet in EEA
   emulation.
2. Click **Aceptar** → an `update` with `analytics_storage:'granted'` appears; the
   `gtm.js`/collect requests carry updated `gcs` (e.g. `G111`); reload → banner gone,
   consent re-applied from storage before GTM.
3. Click the footer **Preferencias de cookies** → banner reopens; **Rechazar** →
   `analytics_storage:'denied'`.
4. `npm test` (consent unit tests green), `npx eslint .` and `npm run build` pass.
5. Ship via the git strategy: branch `feat/consent-mode` → PR → CI + Vercel preview →
   squash-merge.
