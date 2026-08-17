# Services Restructure Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of the Journey Ladder restructure — recording-session products, WhatsApp-sold packs/blocks/egresado, the A+V reprice, the deferred audit price fixes, and the full terms update — with zero new engine machinery.

**Architecture:** All new prices become constants in `lib/pricing.ts` beside `RATES` (spec rule 7), consumed by marketing surfaces. New `/grabacion` route copies the `/curso-dj` colocation pattern (server page + `_content.ts` + `_components/`, WhatsApp conversion with dataLayer+track events). The only DB change is one UPDATE migration (A+V addon reprice). Terms are rewritten in place with a `TERMS_VERSION` bump.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 (tokens in `app/globals.css`), vitest, Supabase migrations.

**Spec:** `docs/superpowers/specs/2026-08-17-services-restructure-design.md` (read it first; this plan argues from it).

## Global Constraints

- All user-facing copy: Chilean Spanish. Code, comments, commit messages: English.
- Frozen prices (must NOT change): room tiers 9990/14990/19990, volume 0.10/0.15/0.20, course 79990/139990/19990, audio add-on 9990.
- Approved exception: audioVideo add-on 49990 → **39990** (everywhere it appears).
- Guided (1:1) canonical price: **14990/h flat, excluded from volume discounts** (matches DB `addons.guided` = 14990 `per_hour`).
- New SKU prices (exact): packs 8h 67990 · 12h 95990; egresado 5h 39990; guided block 4×1h 54990; recording audio 2h 29990 · 3h 35990; recording A+V 1h 49990 · 2h 59990 · 3h 65990.
- All prices end in 990, IVA included, rendered with `formatCLP` from `lib/pricing.ts`.
- Sirena color: never. No new npm dependencies. No new engine/DB machinery beyond the one reprice migration.
- Before any push: `npx eslint .` and `npm run build` exit 0; `npm test` green.
- Conventional Commits; trunk-based: this work lands as **one PR** from branch `feat/services-restructure-phase1`.
- After running integration tests locally, always `npm run db:reset` (never leave the local DB seed-less).

---

### Task 0: Branch and commit the strategy docs

**Files:**
- Commit (already on disk, untracked): `docs/audits/2026-08-17-services-pricing-audit.md`, `docs/superpowers/specs/2026-08-17-services-restructure-design.md`, `docs/superpowers/plans/2026-08-17-services-restructure-phase1.md`

**Interfaces:**
- Produces: branch `feat/services-restructure-phase1` that every later task commits to.

- [ ] **Step 1: Create the branch.** If PR #109/#113's branch `feat/curso-dj-landing` has been squash-merged, branch from updated main: `git checkout main && git pull && git checkout -b feat/services-restructure-phase1`. If #113 is still open, stack instead: `git checkout feat/curso-dj-landing && git checkout -b feat/services-restructure-phase1` (and note the stack in the PR body later).
- [ ] **Step 2: Commit the docs.**

```bash
git add docs/audits/2026-08-17-services-pricing-audit.md docs/superpowers/specs/2026-08-17-services-restructure-design.md docs/superpowers/plans/2026-08-17-services-restructure-phase1.md
git commit -m "docs: services/pricing audit and restructure spec + phase 1 plan"
```

Do NOT `git add` the two scratch files at repo root (`0_migrate prod db.txt`, `2_integration tests.txt`) — they are the owner's notes.

---

### Task 1: Guided session — flat $14.990/h in the marketing engine (audit D1)

**Files:**
- Create: `lib/pricing.test.ts`
- Modify: `lib/pricing.ts` (quote(), new `GUIDED_RATE`), `components/sections/Precio.tsx:64-77`

**Interfaces:**
- Produces: `export const GUIDED_RATE = 14990` in `lib/pricing.ts`; `quote()` semantics change: `coachSubtotal = coachHours * GUIDED_RATE`, volume discount applies to room only.

- [ ] **Step 1: Write the failing tests** — create `lib/pricing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GUIDED_RATE, quote, bookingMessage } from "./pricing";

describe("guided (1:1) pricing — canonical flat rate", () => {
  it("charges GUIDED_RATE per coach hour regardless of tier", () => {
    // Monday 09:00, valle. 2h room + 1h coach.
    const q = quote({ day: 1, start: 9, hours: 2, coachHours: 1 });
    expect(GUIDED_RATE).toBe(14990);
    expect(q.coachSubtotal).toBe(14990); // NOT 9990 (tier rate)
  });

  it("excludes coach hours from the volume discount", () => {
    const q = quote({ day: 1, start: 9, hours: 2, coachHours: 2 });
    // room 2h valle = 19980, 10% volume on room only = 1998
    expect(q.roomSubtotal).toBe(19980);
    expect(q.discount).toBe(1998);
    // total = 19980 - 1998 + 29980 = 47962 → rounded to 47960
    expect(q.total).toBe(47960);
  });

  it("prints the flat rate in the WhatsApp breakdown", () => {
    const q = quote({ day: 1, start: 9, hours: 2, coachHours: 1 });
    const msg = bookingMessage({ day: 1, start: 9, hours: 2, coachHours: 1 }, q);
    expect(msg).toContain("$14.990");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run lib/pricing.test.ts` — Expected: FAIL (`GUIDED_RATE` not exported; coachSubtotal is 9990).
- [ ] **Step 3: Implement in `lib/pricing.ts`.** Add below `ADDONS` (keep the DB-mirror comment — it is the drift guard):

```ts
/**
 * 1:1 guided session: flat per-hour rate, excluded from volume discounts.
 * Mirrors DB addons.guided (supabase/migrations/20260701000000_guided_addon.sql).
 */
export const GUIDED_RATE = 14990;
```

In `quote()`, replace the coach computation and discount base (currently lines 200-207):

```ts
  const room = sumSlots(day, start, hours);
  const coachSubtotal = coachHours * GUIDED_RATE;

  const pct = volumePct(hours);
  const discountableBase = room.subtotal; // volume discount applies to room time only
  const discount = discountableBase * pct;
```

Then update the two later uses: `total = roundTo(room.subtotal - discount + coachSubtotal + audio)` and return `coachSubtotal` (the `coach.byTier` map is gone; the `addonLines` push for coach uses `coachSubtotal`). In `bookingMessage`, change the coach detail line to include the rate:

```ts
    detalle.push(
      `- 1:1 guiado ${horasCortas(coachHours)} (${money(GUIDED_RATE)}/h): ${money(q.coachSubtotal)}`
    );
```

- [ ] **Step 4: Fix the marketing copy in `components/sections/Precio.tsx`.** Line ~77: `<span className="label-sm text-right text-gold">DJ que te guía · misma tarifa/h</span>` → `<span className="label-sm text-right text-gold">DJ que te guía · {formatCLP(GUIDED_RATE)}/h</span>` (add `GUIDED_RATE` to the existing `@/lib/pricing` import). Line ~65: `Sobre la tarifa de la franja · aplica también al 1:1` → `Sobre la tarifa de la franja`.
- [ ] **Step 5: Run tests.** `npx vitest run lib/pricing.test.ts` → PASS; then full `npm test` → all green (no other unit test exercises `quote()`).
- [ ] **Step 6: Commit.**

```bash
git add lib/pricing.ts lib/pricing.test.ts components/sections/Precio.tsx
git commit -m "fix(precio): guided 1:1 at canonical \$14.990/h flat, outside volume discount"
```

---

### Task 2: Audio+Video add-on reprice 49990 → 39990

**Files:**
- Modify: `lib/pricing.ts:79`, `src/domain/pricing/engine.test.ts:25,99`
- Create: `supabase/migrations/20260817120000_audiovideo_reprice.sql`

**Interfaces:**
- Produces: `ADDONS.audioVideo.price === 39990` (marketing) and DB `addons.audioVideo.amount_clp = 39990` (charged).

- [ ] **Step 1: Failing test first** — append to `lib/pricing.test.ts`:

```ts
import { ADDONS } from "./pricing"; // merge into the existing import line

describe("A+V add-on reprice (spec 2026-08-17)", () => {
  it("is 39990 everywhere the marketing engine sees it", () => {
    expect(ADDONS.audioVideo.price).toBe(39990);
    const q = quote({ day: 1, start: 9, hours: 1, audioVideo: true });
    expect(q.total).toBe(49980); // 9990 room + 39990 A+V, no discount at 1h
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run lib/pricing.test.ts` → FAIL (49990).
- [ ] **Step 3: Implement.** `lib/pricing.ts:79` → `price: 39990,`. Create the migration:

```sql
-- supabase/migrations/20260817120000_audiovideo_reprice.sql
-- A+V add-on reprice: $49.990 → $39.990 (customer-favorable, market-aligned).
-- See docs/superpowers/specs/2026-08-17-services-restructure-design.md.
update addons set amount_clp = 39990 where key = 'audioVideo';
```

Update the server-engine test fixture to mirror reality: `src/domain/pricing/engine.test.ts:25` amount `49990` → `39990`, and the assertion at `:99` `expect(q.addonsTotal).toBe(49990)` → `39990`.

- [ ] **Step 4: Apply and verify locally.** `npm run db:start` (if not running) then `npm run db:reset` (applies the migration) and `npm run db:types` (expect no diff — data-only change). `npm test` → green.
- [ ] **Step 5: Commit.**

```bash
git add lib/pricing.ts lib/pricing.test.ts src/domain/pricing/engine.test.ts supabase/migrations/20260817120000_audiovideo_reprice.sql
git commit -m "feat(precio): reprice audio+video add-on to \$39.990"
```

---

### Task 3: Fix the home JSON-LD price range (audit D3)

**Files:**
- Modify: `lib/site.ts:114-121`
- Create: `lib/site.test.ts`

**Interfaces:**
- Produces: `PRICING.priceRange` derived from `RATES` (no more manual sync); `PRICING.from` deleted (dead).

- [ ] **Step 1: Failing test** — create `lib/site.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PRICING } from "./site";
import { RATES, formatCLP } from "./pricing";

describe("PRICING marketing const", () => {
  it("derives the JSON-LD price range from the real rates", () => {
    expect(PRICING.priceRange).toBe(`${formatCLP(RATES.valle)} – ${formatCLP(RATES.puntaFinde)}`);
    expect(PRICING.priceRange).toBe("$9.990 – $19.990");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run lib/site.test.ts` → FAIL ("$14.990 – $24.990"; no `from` assertion — it's being deleted).
- [ ] **Step 3: Implement in `lib/site.ts`.** Add `import { RATES, formatCLP } from "./pricing";` at top (pricing imports nothing from site — no cycle). Replace the whole `PRICING` block (lines 114-121):

```ts
/**
 * Solo para marketing/SEO (JSON-LD del home). Derivado de RATES — no puede
 * volver a desincronizarse (auditoría 2026-08-17, hallazgo D3).
 */
export const PRICING = {
  priceRange: `${formatCLP(RATES.valle)} – ${formatCLP(RATES.puntaFinde)}`,
} as const;
```

`app/page.tsx` needs no change (it uses only `PRICING.priceRange`). Confirm nothing else imports `PRICING.from`: `grep -rn "PRICING.from" app components lib src` → no matches expected.

- [ ] **Step 4: Run tests + build.** `npx vitest run lib/site.test.ts` → PASS; `npm run build` → exit 0.
- [ ] **Step 5: Commit.**

```bash
git add lib/site.ts lib/site.test.ts
git commit -m "fix(seo): derive JSON-LD priceRange from real rates (was \$14.990–\$24.990)"
```

---

### Task 4: New SKU price constants (spec rule 7)

**Files:**
- Modify: `lib/pricing.ts` (append after `GUIDED_RATE`), `lib/pricing.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 5–8):

```ts
export const PACKS: readonly { hours: number; price: number }[]     // [{8, 67990}, {12, 95990}]
export const PACK_EGRESADO: { hours: 5; price: 39990; windowDays: 90 }
export const GUIDED_BLOCK: { sessions: 4; price: 54990 }
export const RECORDING_SESSIONS: {
  audio: readonly { hours: number; price: number }[];      // [{2, 29990}, {3, 35990}]
  audioVideo: readonly { hours: number; price: number }[]; // [{1, 49990}, {2, 59990}, {3, 65990}]
}
```

- [ ] **Step 1: Failing tests** — append to `lib/pricing.test.ts`:

```ts
import { PACKS, PACK_EGRESADO, GUIDED_BLOCK, RECORDING_SESSIONS } from "./pricing";

describe("phase-1 SKU constants", () => {
  it("match the approved spec prices", () => {
    expect(PACKS).toEqual([{ hours: 8, price: 67990 }, { hours: 12, price: 95990 }]);
    expect(PACK_EGRESADO).toEqual({ hours: 5, price: 39990, windowDays: 90 });
    expect(GUIDED_BLOCK).toEqual({ sessions: 4, price: 54990 });
    expect(RECORDING_SESSIONS.audio).toEqual([{ hours: 2, price: 29990 }, { hours: 3, price: 35990 }]);
    expect(RECORDING_SESSIONS.audioVideo).toEqual([
      { hours: 1, price: 49990 }, { hours: 2, price: 59990 }, { hours: 3, price: 65990 },
    ]);
  });

  it("never undercuts the DIY widget path (no reverse arbitrage, spec §mechanics)", () => {
    for (const s of RECORDING_SESSIONS.audio) {
      const diy = quote({ day: 1, start: 9, hours: s.hours, audio: true });
      expect(s.price).toBeGreaterThanOrEqual(diy.total);
    }
    for (const s of RECORDING_SESSIONS.audioVideo) {
      const diy = quote({ day: 1, start: 9, hours: s.hours, audioVideo: true });
      expect(s.price).toBeGreaterThanOrEqual(diy.total);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement** — append to `lib/pricing.ts` (after `GUIDED_RATE`), with a one-line comment each stating what it is and that WhatsApp/admin is the Phase-1 sale path (English comments):

```ts
/** Prepaid valle-hour packs (Phase 1: sold via WhatsApp, delivered as admin manual bookings). */
export const PACKS = [
  { hours: 8, price: 67990 },
  { hours: 12, price: 95990 },
] as const;

/** Course-graduate pack: one per graduate, within windowDays of finishing. */
export const PACK_EGRESADO = { hours: 5, price: 39990, windowDays: 90 } as const;

/** 4×1h guided block (per-session bookings; 90-day validity — see /terminos). */
export const GUIDED_BLOCK = { sessions: 4, price: 54990 } as const;

/** Closed-price recording sessions (valle scheduling by default; raw capture). */
export const RECORDING_SESSIONS = {
  audio: [
    { hours: 2, price: 29990 },
    { hours: 3, price: 35990 },
  ],
  audioVideo: [
    { hours: 1, price: 49990 },
    { hours: 2, price: 59990 },
    { hours: 3, price: 65990 },
  ],
} as const;
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit.**

```bash
git add lib/pricing.ts lib/pricing.test.ts
git commit -m "feat(precio): phase-1 SKU constants (packs, egresado, 1:1 block, recording sessions)"
```

---

### Task 5: `/grabacion` landing page

**Files:**
- Create: `app/grabacion/_content.ts`, `app/grabacion/page.tsx`, `app/grabacion/_components/WhatsAppCta.tsx`, `app/grabacion/_components/Formatos.tsx`, `app/grabacion/_components/QueIncluye.tsx`, `app/grabacion/_components/CierreGrabacion.tsx`
- Modify: `lib/photos.ts` (PLACEMENT + selector), `app/sitemap.ts`, `components/Footer.tsx`, `components/Nav.tsx:13-21`

**Interfaces:**
- Consumes: `RECORDING_SESSIONS`, `formatCLP` (Task 4); `Section`/`SectionHead`/`Reveal`/`MaskText`/`Magnetic`/`MeterBars`/`BrandImage` from `components/`; `whatsappLink` from `lib/site.ts`.
- Produces: route `/grabacion`, `grabacionPhotos()` in `lib/photos.ts`.

- [ ] **Step 1: Content module** — `app/grabacion/_content.ts`:

```ts
/** Grabación landing — single edit point (mirrors app/curso-dj/_content.ts). */
export const GRABACION = {
  waMessage:
    "Hola *FOTF Studios*. Quiero agendar una *Sesión de Grabación* de mi set.",
  /** Honest-raw deliverable line — no mastering/editing promises (spec constraint). */
  entrega: "Captura directa, tal cual sonó. Entrega digital dentro de 48 horas.",
  diyNote:
    "¿Prefieres armarlo por partes? Reserva horas de sala y agrega la grabación como add-on — sale un poco menos y lo configuras tú. La sesión cerrada llega con todo listo: niveles ajustados y grabación corriendo.",
} as const;
```

- [ ] **Step 2: WhatsAppCta** — `app/grabacion/_components/WhatsAppCta.tsx`: copy `app/curso-dj/_components/WhatsAppCta.tsx` verbatim, change the import to `{ GRABACION } from "../_content"`, `href={whatsappLink(GRABACION.waMessage)}`, and both event payloads to `{ event: "whatsapp_click", source, page: "grabacion" }` / `track("whatsapp_click", { source, page: "grabacion" })`.
- [ ] **Step 3: Sections.** `Formatos.tsx` renders two `hairline` price cards (pattern: `app/curso-dj/_components/Precios.tsx`) from `RECORDING_SESSIONS`: card "Audio" lists `2h — $29.990 · 3h — $35.990` rows (`font-display text-gold` amounts via `formatCLP`), card "Audio + Video" the three rows; below the grid a `label-sm text-bone-mute` line: `Precios en horario valle · en punta se suma la diferencia de tarifa · IVA incluido`. `QueIncluye.tsx`: `SectionHead n="02" kicker="Qué incluye"` + list (cabina completa · niveles ajustados antes de partir · `GRABACION.entrega` · el material es tuyo) + the `GRABACION.diyNote` paragraph in `text-bone-mute` + two `BrandImage` slots from `grabacionPhotos()`. `CierreGrabacion.tsx`: copy `CierreCurso.tsx` structure, headline lines `["Tu set,", <span className="text-gold">grabado de verdad.</span>]`, `WhatsAppCta source="cierre"`.
- [ ] **Step 4: Page** — `app/grabacion/page.tsx` (pattern: `app/curso-dj/page.tsx`): metadata `{ title: "Grabación de Sets", description: "Graba tu DJ set en una cabina real en Viña del Mar: audio desde $29.990, audio + video desde $49.990. Captura directa, entrega en 48 horas.", alternates: { canonical: "/grabacion" } }`; JSON-LD `@type: "Service"` with `offers` array built by mapping `RECORDING_SESSIONS` (5 Offers, `priceCurrency: "CLP"`); minimal header + hero (`MaskText` h1 `["Graba tu set", <span className="text-gold">en una cabina real</span>]`, editorial line `Sales con el archivo, no con el recuerdo.`, `WhatsAppCta source="hero"`), then Formatos (SectionHead `01`), QueIncluye (`02`), CierreGrabacion, `Footer`.
- [ ] **Step 5: Photos + links.** `lib/photos.ts`: add `grabacion: ["cabina-10.JPG", "cabina-11.JPG"],` to `PLACEMENT`, add the reserved entries to `galleryPhotos()`'s set (`...PLACEMENT.grabacion.map((f) => \`/photos/${f}\`)`), and add `grabacionPhotos()` (copy `cursoPhotos` shape, key `grabacion`, fallback slice 2). `app/sitemap.ts`: insert `{ url: \`${SITE_URL}/grabacion\`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 }` after the curso entry. `components/Footer.tsx`: `<li><Link href="/grabacion" …>Graba tu set</Link></li>` after the curso link. `components/Nav.tsx` LINKS array: append `{ href: "/grabacion", label: "Grabación" }` after the Curso entry.
- [ ] **Step 6: Verify.** `npx eslint .` → 0; `npm run build` → `/grabacion` appears as static (○); `npm run dev`, check `/grabacion` at 375px and desktop, click a CTA and confirm `window.dataLayer` receives `{event:"whatsapp_click", page:"grabacion"}`; confirm home gallery unchanged.
- [ ] **Step 7: Commit.**

```bash
git add app/grabacion lib/photos.ts app/sitemap.ts components/Footer.tsx components/Nav.tsx
git commit -m "feat(grabacion): recording-session landing with closed valle pricing"
```

---

### Task 6: Home Precio section — packs on sale, "Próximamente" retired

**Files:**
- Modify: `components/sections/Precio.tsx` (add-ons card, lines ~70-91)

**Interfaces:**
- Consumes: `PACKS`, `formatCLP` (Task 4); `whatsappLink` (`lib/site.ts`).

- [ ] **Step 1: Add packs rows.** In the Add-ons card `<ul>`, after the Audio + Video row, insert (module-local const above the component: `const PACKS_WA = "Hola *FOTF Studios*. Quiero comprar un *Pack de horas valle*.";`):

```tsx
{PACKS.map((p) => (
  <li key={p.hours} className="flex items-baseline justify-between gap-3 border-t hairline px-6 py-5">
    <span className="text-lg text-bone">Pack {p.hours} horas valle</span>
    <span className="font-display text-2xl text-gold">{formatCLP(p.price)}</span>
  </li>
))}
<li className="flex items-baseline justify-between gap-3 border-t hairline px-6 py-5">
  <span className="text-lg text-bone">Perfeccionamiento 1:1 · {GUIDED_BLOCK.sessions} sesiones de 1h</span>
  <span className="font-display text-2xl text-gold">{formatCLP(GUIDED_BLOCK.price)}</span>
</li>
```

(Import `GUIDED_BLOCK` alongside `PACKS`; the WhatsApp footer link covers both — packs and blocks are the same WhatsApp-sale motion.)

- [ ] **Step 2: Replace the footer line** (`Próximamente: clases y membresías`, lines ~88-90) with:

```tsx
<p className="border-t hairline px-6 py-4 label-sm text-bone-mute">
  Packs por{" "}
  <a href={whatsappLink(PACKS_WA)} target="_blank" rel="noopener noreferrer" className="text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold">
    WhatsApp
  </a>{" "}
  · Clases:{" "}
  <Link href="/curso-dj" className="text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold">
    Curso de Iniciación DJ
  </Link>
</p>
```

Add the needed imports (`Link` from `next/link`, `whatsappLink`, `PACKS`). Note: A+V row already shows $39.990 automatically via `ADDONS` (Task 2).

- [ ] **Step 3: Verify + commit.** `npx eslint .`; dev-server glance at `/#precio`.

```bash
git add components/sections/Precio.tsx
git commit -m "feat(precio): valle hour packs on sale via WhatsApp; retire 'Próximamente' line"
```

---

### Task 7: Curso page — Pack Egresado mention

**Files:**
- Modify: `app/curso-dj/_components/Precios.tsx` (footer line, ~line 71-75)

**Interfaces:**
- Consumes: `PACK_EGRESADO`, `formatCLP` from `@/lib/pricing`.

- [ ] **Step 1: Extend the pricing footer.** Replace `Mismo programa en ambos formatos · pago 100% anticipado` with:

```tsx
<p className="mt-6 label-sm text-bone-mute">
  Mismo programa en ambos formatos · pago 100% anticipado · al terminar:
  Pack Egresado — {PACK_EGRESADO.hours} horas valle por {formatCLP(PACK_EGRESADO.price)}
</p>
```

- [ ] **Step 2: Verify + commit.** `npx eslint .`; visual glance at `/curso-dj#precios`.

```bash
git add app/curso-dj/_components/Precios.tsx
git commit -m "feat(curso): announce Pack Egresado in the pricing section"
```

---

### Task 8: Terms rewrite + `TERMS_VERSION` bump

**Files:**
- Modify: `app/terminos/page.tsx`, `lib/site.ts:59` (`TERMS_VERSION`)

**Interfaces:**
- Consumes: nothing new; clause numbers below come from the spec's "Terms & policy changes" section.

- [ ] **Step 1: Ask the owner for razón social + RUT.** If provided, replace the `[RAZÓN SOCIAL]`/`[RUT]` placeholders at `app/terminos/page.tsx:55-56`. If not provided at execution time, leave them and flag in the PR body — do not block the rest of the task.
- [ ] **Step 2: Fix the reschedule clause** (lines ~121-129). Read the file's local `Section` component pattern first, then replace the "sin costo" sentence with:

```
Puedes reprogramar tu reserva sin costo por el cambio, todas las veces que
necesites, con al menos 12 horas de anticipación y sujeto a disponibilidad.
Si el nuevo horario tiene una tarifa mayor, se paga la diferencia antes de
mover la reserva; si es menor, te devolvemos la diferencia.
```

- [ ] **Step 3: Append new sections** (following the file's existing `<Section title="…">` pattern, after the refunds section), with exactly this content:
  - **"Puntos FOTF"**: 1 punto = $1 CLP · se acumula el 5% de lo pagado en dinero (los pagos con puntos no acumulan) · los puntos pagan reservas y add-ons a precio de lista; no compran packs ni cursos · si se reembolsa una reserva, los puntos acumulados por ella se descuentan y los puntos usados se devuelven a prorrata · los puntos no expiran hoy; podemos modificar el programa hacia adelante, nunca sobre puntos ya ganados.
  - **"Packs de horas"**: créditos de horas valle (L–V hasta 17:00), personales, vigencia 90 días (¿se te pasó? escríbenos) · cancelar una reserva de pack con ≥12 horas devuelve la hora al pack · horas no usadas: reembolso proporcional a solicitud dentro de la vigencia · el Pack Egresado sigue estas mismas reglas, es uno por egresado y se activa dentro de 90 días de terminado el curso.
  - **"Curso de Iniciación DJ"**: pago 100% anticipado · reembolso total hasta 7 días antes de la primera sesión · con menos de 7 días: traspaso a la siguiente generación o a un reemplazante que tú nombres · iniciado el curso no hay reembolso en dinero; las sesiones restantes se pueden reagendar dentro de la generación · la sesión de prueba ($19.990) se descuenta del curso si te inscribes dentro de 7 días.
  - **"Sesiones de grabación"**: captura directa sin postproducción · entrega digital dentro de 48 horas · el material grabado es tuyo · los derechos de la música que uses son tu responsabilidad · precios publicados en horario valle; en punta se suma la diferencia de tarifa.
- [ ] **Step 4: Bump the version.** `lib/site.ts:59`: `TERMS_VERSION = "2026-07-06"` → the date this ships, e.g. `"2026-08-17"`. Update the `UPDATED` display const at the top of `app/terminos/page.tsx` to the matching Spanish long date (e.g. `"17 de agosto de 2026"`).
- [ ] **Step 5: Verify + commit.** `npx eslint .`; `npm run build`; read `/terminos` in the dev server end to end once.

```bash
git add app/terminos/page.tsx lib/site.ts
git commit -m "feat(terminos): packs, curso, puntos y grabación terms; fix reschedule clause; bump TERMS_VERSION"
```

---

### Task 9: Full verification and PR

- [ ] **Step 1: Unit + lint + build.** `npx eslint .` → 0 · `npm test` → all green · `npm run build` → 0, `/grabacion` static.
- [ ] **Step 2: Integration tests locally** (the reprice migration touches the DB): `npm run db:reset && npm run test:integration` (MP specs self-skip without token — fine, nothing here touches MP). Then **`npm run db:reset` again** to restore the seed.
- [ ] **Step 3: Visual pass** on the dev server (restart it after the build): `/` (Precio: guided $14.990/h, A+V $39.990, packs rows, new footer links; nav shows Grabación), `/grabacion` mobile + desktop + CTA dataLayer event, `/curso-dj` (egresado line), `/terminos` (new sections, no stray placeholders except possibly RUT).
- [ ] **Step 4: Push and open the PR.**

```bash
git push -u origin feat/services-restructure-phase1
gh pr create --title "feat(precio): services restructure phase 1 — recording sessions, packs, price fixes, terms" --body "Implements docs/superpowers/specs/2026-08-17-services-restructure-design.md (Phase 1). Guided 1:1 now \$14.990/h flat in marketing (matches checkout); A+V add-on repriced to \$39.990 (migration included); JSON-LD range fixed; /grabacion landing; packs/egresado/1:1 block on sale via WhatsApp; full terms update with TERMS_VERSION bump. No engine changes; one data-only migration.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Note in the PR body whether RUT/razón social were filled (Task 8 Step 1) and whether the branch is stacked on #113.
