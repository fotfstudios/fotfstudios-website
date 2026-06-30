# Consent Mode v2 + Cookie Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Consent Mode v2 with a hand-rolled, on-brand cookie banner that sets region-scoped default consent before GTM loads and lets visitors accept/reject.

**Architecture:** A pure `lib/consent.ts` (region list, default-script builder, storage helpers) feeds a `beforeInteractive` `<Script>` in the root layout (runs before the existing GTM bootstrap) and a client `<ConsentBanner>`. A small `<ConsentReopenLink>` in the footer reopens the banner via a `window` event.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4, `next/script`, Vitest.

## Global Constraints

- Next.js 15 App Router + React 19. Client components marked `"use client"`.
- **No new dependencies.** Tailwind v4 **brand tokens only** — `ink`, `bone`, `bone-dim`, `bone-mute`, `gold`, utilities `.label-sm`, `.hairline`. No new colors.
- **Consent Mode v2 signals:** `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`. Ad signals are tied to the analytics choice for now.
- **Region-scoped defaults:** global default `analytics_storage:'granted'` (ads denied); EEA+UK+CH (`region:` array) all denied; both with `wait_for_update:500`. The default script must run **before** the GTM bootstrap (`beforeInteractive`, only valid in the root layout).
- **Storage:** `localStorage` key exactly `fotf-consent`, value `{ analytics: 'granted'|'denied', ts: number }`.
- Spanish (Chile) copy. Banner links to `/privacidad` (route does NOT exist yet — link will 404 until a separate content task adds it; do not create it here).
- `npx eslint .` and `npm run build` must pass (exit 0). Unit tests via `npm test` (Vitest).
- Existing GTM (`GTM-WCC3V22R`) and Vercel Analytics/Speed Insights stay untouched.
- Work on branch `feat/consent-mode` (main is protected; PR + squash-merge).

---

## File Structure

- **Create** `lib/consent.ts` — region list, `buildConsentDefaultScript()`, `consentUpdateSignals()`, `serializeConsent()`/`parseConsent()`, `STORAGE_KEY`. Pure.
- **Create** `lib/consent.test.ts` — unit tests.
- **Create** `components/ConsentBanner.tsx` — client banner (Accept/Reject, persists, listens for `open-consent`).
- **Create** `components/ConsentReopenLink.tsx` — tiny client button dispatching `open-consent`.
- **Modify** `app/layout.tsx` — add `beforeInteractive` consent-default Script before GTM; render `<ConsentBanner/>`.
- **Modify** `components/Footer.tsx` — add `<ConsentReopenLink/>` in the bottom bar.

---

## Task 1: Consent config + helpers (pure, TDD)

**Files:**
- Create: `lib/consent.ts`
- Test: `lib/consent.test.ts`

**Interfaces:**
- Produces:
  - `const STORAGE_KEY = "fotf-consent"`
  - `const CONSENT_REGIONS_DENIED: readonly string[]`
  - `type ConsentValue = "granted" | "denied"`
  - `interface StoredConsent { analytics: ConsentValue; ts: number }`
  - `buildConsentDefaultScript(): string`
  - `consentUpdateSignals(analytics: ConsentValue): { analytics_storage: ConsentValue; ad_storage: ConsentValue; ad_user_data: ConsentValue; ad_personalization: ConsentValue }`
  - `serializeConsent(analytics: ConsentValue, ts: number): string`
  - `parseConsent(raw: string | null): StoredConsent | null`

- [ ] **Step 1: Write the failing test**

Create `lib/consent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildConsentDefaultScript,
  CONSENT_REGIONS_DENIED,
  consentUpdateSignals,
  parseConsent,
  serializeConsent,
  STORAGE_KEY,
} from "./consent";

describe("CONSENT_REGIONS_DENIED", () => {
  it("incluye EEA + UK + CH y excluye Chile/US", () => {
    for (const c of ["ES", "DE", "FR", "IT", "GB", "CH", "NO"]) {
      expect(CONSENT_REGIONS_DENIED).toContain(c);
    }
    expect(CONSENT_REGIONS_DENIED).not.toContain("CL");
    expect(CONSENT_REGIONS_DENIED).not.toContain("US");
  });
});

describe("buildConsentDefaultScript", () => {
  const s = buildConsentDefaultScript();
  it("define el default global (granted) y el de EEA (denied)", () => {
    expect(s).toContain("'default'");
    expect(s).toContain("analytics_storage:'granted'");
    expect(s).toContain("analytics_storage:'denied'");
    expect(s).toContain('region:["AT"');
    expect(s).toContain("wait_for_update:500");
  });
  it("re-aplica la elección guardada desde localStorage", () => {
    expect(s).toContain(`localStorage.getItem('${STORAGE_KEY}')`);
    expect(s).toContain("'update'");
  });
});

describe("serializeConsent / parseConsent", () => {
  it("round-trip de la elección", () => {
    expect(parseConsent(serializeConsent("granted", 123))).toEqual({ analytics: "granted", ts: 123 });
  });
  it("null si ausente o inválido", () => {
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent("no json")).toBeNull();
    expect(parseConsent('{"analytics":"maybe","ts":1}')).toBeNull();
    expect(parseConsent('{"analytics":"granted"}')).toBeNull();
  });
});

describe("consentUpdateSignals", () => {
  it("liga las señales de ads a analytics", () => {
    expect(consentUpdateSignals("granted")).toEqual({
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
    expect(consentUpdateSignals("denied").ad_storage).toBe("denied");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/consent.test.ts`
Expected: FAIL — module `./consent` / its exports not found.

- [ ] **Step 3: Implement `lib/consent.ts`**

Create `lib/consent.ts`:

```ts
/**
 * Google Consent Mode v2 — config puro y helpers. Sin estado ni efectos: el
 * script inline (layout) y el banner (cliente) consumen estas piezas.
 */
export const STORAGE_KEY = "fotf-consent";

/** EEA + Reino Unido + Suiza → denegado por defecto hasta opt-in. */
export const CONSENT_REGIONS_DENIED = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
] as const;

export type ConsentValue = "granted" | "denied";

export interface StoredConsent {
  analytics: ConsentValue;
  ts: number;
}

/** Script inline de Consent Mode v2: defaults por región + re-aplica la elección guardada. */
export function buildConsentDefaultScript(): string {
  const region = JSON.stringify([...CONSENT_REGIONS_DENIED]);
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
gtag('consent','default',{region:${region},analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
try{var s=localStorage.getItem('${STORAGE_KEY}');if(s){var c=JSON.parse(s);gtag('consent','update',{analytics_storage:c.analytics,ad_storage:c.analytics,ad_user_data:c.analytics,ad_personalization:c.analytics});}}catch(e){}`;
}

/** Señales gtag para una elección (ads ligadas a analytics por ahora). */
export function consentUpdateSignals(analytics: ConsentValue) {
  return {
    analytics_storage: analytics,
    ad_storage: analytics,
    ad_user_data: analytics,
    ad_personalization: analytics,
  };
}

/** Serializa la elección para localStorage. */
export function serializeConsent(analytics: ConsentValue, ts: number): string {
  return JSON.stringify({ analytics, ts } satisfies StoredConsent);
}

/** Parsea la elección guardada; null si ausente o inválida. */
export function parseConsent(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredConsent>;
    if ((v.analytics === "granted" || v.analytics === "denied") && typeof v.ts === "number") {
      return { analytics: v.analytics, ts: v.ts };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/consent.test.ts`
Expected: PASS (all 4 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/consent.ts lib/consent.test.ts
git commit -m "feat(consent): Consent Mode v2 config + helpers"
```

---

## Task 2: Banner + reopen-link components

**Files:**
- Create: `components/ConsentBanner.tsx`
- Create: `components/ConsentReopenLink.tsx`

**Interfaces:**
- Consumes: `STORAGE_KEY`, `parseConsent`, `serializeConsent`, `consentUpdateSignals`, `ConsentValue` from `@/lib/consent`.
- Produces: `ConsentBanner` (default export, no props), `ConsentReopenLink` (default export, no props). Both rely on a `window` event named `"open-consent"`.

- [ ] **Step 1: Create the banner**

Create `components/ConsentBanner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  consentUpdateSignals,
  type ConsentValue,
  parseConsent,
  serializeConsent,
  STORAGE_KEY,
} from "@/lib/consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Banner de consentimiento (Aceptar/Rechazar). Aparece si no hay elección guardada. */
export default function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!parseConsent(localStorage.getItem(STORAGE_KEY))) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener("open-consent", reopen);
    return () => window.removeEventListener("open-consent", reopen);
  }, []);

  const choose = (analytics: ConsentValue) => {
    // gtag global lo define el script consent-default (beforeInteractive).
    window.gtag?.("consent", "update", consentUpdateSignals(analytics));
    localStorage.setItem(STORAGE_KEY, serializeConsent(analytics, Date.now()));
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t hairline bg-ink/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-10">
        <p className="max-w-2xl text-sm text-bone-dim">
          Usamos cookies para medir el tráfico del sitio y mejorar tu experiencia.{" "}
          <a href="/privacidad" className="text-gold underline-offset-4 hover:underline">
            Más información
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="border hairline px-5 py-2.5 label-sm text-bone-dim transition-colors hover:border-gold hover:text-gold"
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="bg-gold px-5 py-2.5 label-sm text-ink transition-transform"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the reopen link**

Create `components/ConsentReopenLink.tsx`:

```tsx
"use client";

/** Reabre el banner de consentimiento (para cambiar de opinión desde el footer). */
export default function ConsentReopenLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("open-consent"))}
      className="label-sm text-bone-mute transition-colors hover:text-gold"
    >
      Preferencias de cookies
    </button>
  );
}
```

- [ ] **Step 3: Lint the new files**

Run: `npx eslint components/ConsentBanner.tsx components/ConsentReopenLink.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ConsentBanner.tsx components/ConsentReopenLink.tsx
git commit -m "feat(consent): on-brand cookie banner + reopen link"
```

---

## Task 3: Wire into layout + footer

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/Footer.tsx`

**Interfaces:**
- Consumes: `buildConsentDefaultScript` from `@/lib/consent`; `ConsentBanner` from `@/components/ConsentBanner`; `ConsentReopenLink` from `@/components/ConsentReopenLink`.

- [ ] **Step 1: Add the consent-default Script + banner to the layout**

In `app/layout.tsx`, add two imports after the existing `import ... from "@/components/CustomCursor";` group (place near the other component imports):

```tsx
import ConsentBanner from "@/components/ConsentBanner";
import { buildConsentDefaultScript } from "@/lib/consent";
```

Then, inside `<body>`, insert the consent-default Script as the FIRST child, before the `{/* Google Tag Manager (noscript) */}` block. Replace this opening:

```tsx
      <body>
        {/* Google Tag Manager (noscript) */}
```

with:

```tsx
      <body>
        {/* Google Consent Mode v2 — defaults antes de GTM */}
        <Script id="consent-default" strategy="beforeInteractive">
          {buildConsentDefaultScript()}
        </Script>
        {/* Google Tag Manager (noscript) */}
```

And render the banner: replace the closing of `<body>`:

```tsx
        <Analytics />
        <SpeedInsights />
      </body>
```

with:

```tsx
        <Analytics />
        <SpeedInsights />
        <ConsentBanner />
      </body>
```

(`Script` is already imported in this file from the GTM work.)

- [ ] **Step 2: Add the reopen link to the footer**

In `components/Footer.tsx`, add the import at the top (after the existing imports):

```tsx
import ConsentReopenLink from "./ConsentReopenLink";
```

Then add the link to the bottom bar. Replace:

```tsx
          <span className="label-sm text-bone-mute">
            © {year} {SITE.name} · {SITE.full}
          </span>
        </div>
```

with:

```tsx
          <div className="flex items-center gap-4">
            <ConsentReopenLink />
            <span className="label-sm text-bone-mute">
              © {year} {SITE.name} · {SITE.full}
            </span>
          </div>
        </div>
```

- [ ] **Step 3: Lint both files**

Run: `npx eslint app/layout.tsx components/Footer.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx components/Footer.tsx
git commit -m "feat(consent): set region-scoped defaults before GTM + mount banner"
```

---

## Task 4: Full verification + browser walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Unit suite**

Run: `npm test`
Expected: PASS, including the new `lib/consent.test.ts`; existing tests still green.

- [ ] **Step 2: Lint + build**

Run: `npx eslint . && npm run build`
Expected: both exit 0.

- [ ] **Step 3: Browser walkthrough**

Restart dev cleanly (build rewrites `.next`): `npm run dev`. Open `http://localhost:3000` and confirm:
- The cookie banner appears on first load (no stored choice).
- DevTools → Console: `window.dataLayer` contains two `["consent","default",…]` entries (one with the `region` array), present **before** the GTM `gtm.js` request fires.
- Click **Aceptar** → a `["consent","update",{analytics_storage:"granted",…}]` entry is pushed; `localStorage["fotf-consent"]` = `{"analytics":"granted","ts":…}`; banner disappears. Reload → banner stays gone and the stored choice re-applies (an `update` appears before GTM).
- Click the footer **Preferencias de cookies** → banner reopens; click **Rechazar** → `update` with `analytics_storage:"denied"`, storage updated.
- (Optional) GTM **Tag Assistant** shows the consent default → update transition; collect requests carry `gcs`/`gcd` params.

- [ ] **Step 4: Final commit (if any polish was needed)**

```bash
git add -A
git commit -m "chore(consent): verification pass"
```

---

## Self-Review

**Spec coverage:** Region-scoped defaults → Task 1 (`buildConsentDefaultScript`) + Task 3 (beforeInteractive wiring). Banner UX (Accept/Reject, Spanish, on-brand, `/privacidad` link) → Task 2. Persistence (`localStorage` `fotf-consent`) → Tasks 1–2. Reopen link in footer → Tasks 2–3. Default-before-GTM ordering → Task 3 (`beforeInteractive`). Ads tied to analytics → Task 1 (`consentUpdateSignals`). Unit tests → Task 1. Verification → Task 4. Known gap (`/privacidad` 404) documented in Global Constraints. All spec sections map to a task.

**Placeholder scan:** No TBD/TODO; every code step is complete; every command has an expected result.

**Type consistency:** `ConsentValue`, `StoredConsent`, `STORAGE_KEY`, `CONSENT_REGIONS_DENIED`, `buildConsentDefaultScript`, `consentUpdateSignals`, `serializeConsent`, `parseConsent` are defined in Task 1 and consumed with identical names/shapes in Tasks 2–3. The `window.gtag`/`dataLayer` global augmentation lives in `ConsentBanner.tsx` (Task 2); the global `gtag` it calls is the one defined by `buildConsentDefaultScript()`'s inline script (Task 1), which assigns `function gtag(){…}` at script scope (global). Event name `"open-consent"` matches between `ConsentBanner` (listener) and `ConsentReopenLink` (dispatcher).
