# CLAUDE.md — FOTF Studios website

Guidance for Claude Code and developers working in this repo. Read before making changes.

## Project

Marketing site for **FOTF Studios** — a by-the-hour DJ rehearsal room in Viña del Mar, Chile.
Single-page Next.js site. Built with **Next.js 15 (App Router)** + **React 19** + **Tailwind
CSS v4**, deployed on **Vercel**, production domain **https://fotfstudios.cl**.

## Commands

```bash
npm run dev      # local dev (http://localhost:3000)
npm run build    # production build (also type-checks)
npm run lint     # eslint .  (flat config, eslint.config.mjs)
npm test         # vitest run (unit tests; also runs in CI lint & build job)
npm run test:integration  # vitest *.itest.ts contra la DB local (requiere db:start). En CI corre contra Supabase en contenedor; specs MP se omiten sin token

# Plataforma de reservas — base de datos local (Supabase CLI, requiere Docker)
npm run db:start # supabase start  (stack local; aplica migraciones de supabase/migrations)
npm run db:reset # re-aplica migraciones + seed desde cero
npm run db:types # regenera src/infrastructure/db/database.types.ts desde la DB local
npm run db:stop  # detiene el stack
```

Always restart `npm run dev` after a `npm run build` — the build rewrites `.next` and can leave
a running dev server in a broken state.

**Supabase local:** este repo usa puertos **544xx** (API 54421, DB 54422, Studio 54423,
Mailpit 54424 web / 54325 SMTP) para no chocar con otro proyecto Supabase local. **Todos los
correos locales** (códigos de login vía el Send Email Hook y los transaccionales) llegan a Mailpit
con `SMTP_URL=smtp://127.0.0.1:54325` en `.env.local` (SmtpMailer; sin ella, solo `[email:noop]`
en el log del dev server). Las migraciones en
`supabase/migrations/` son la **fuente de verdad** del esquema; el proyecto remoto se crea recién
al desplegar. Flujo: editar/crear migración → `db:reset` → `db:types` → tests.

## Local-first testing (regla)

**Todo se prueba y depura LOCAL antes de ir a producción.** Nunca depurar contra el deployment
en vivo ni la base Supabase remota real.

- Loop estándar: **Supabase local** (`npm run db:start`) → `npm run dev` → reproducir → leer logs
  → corregir → verificar local → recién entonces PR/deploy.
- **Webhooks/pagos** (p. ej. Mercado Pago): correr la app local contra el Supabase local y
  exponerla con un **túnel** (ngrok/cloudflared) para que el proveedor alcance `localhost`; agregar
  logging temporal para inspeccionar la request real (firma/headers) y arreglar la causa raíz.
  Nada de pagos de prueba repetidos en prod ni reconciliar datos reales a mano.
  - **Notificaciones MP:** el panel (Tus integraciones → Webhooks) apunta test-mode → túnel
    estático y prod-mode → `https://www.fotfstudios.cl/api/webhooks/mercadopago`; esas llegan
    como `?data.id=&type=` con firma validable (`firma ok (forma=webhooks)` en logs). NO
    setear `notification_url` por-preference salvo vía `MP_NOTIFICATION_URL` (escape hatch dev):
    esa vía tiene prioridad sobre el panel y llega como IPN legacy cuya firma nunca valida.
  - **E2E de pagos local (redirect + confirmación):** setear `NEXT_PUBLIC_SITE_URL` al túnel
    **https** en `.env.local` y reiniciar dev. Con `localhost` MP guarda las `back_urls`
    VACÍAS (verificado vía `GET /checkout/preferences/{id}`) → sin botón de retorno ni
    `auto_return`, y el comprador nunca llega a `/reserva/estado` (que confirma sola vía
    reconcile). Con el túnel: retorno automático + webhook al túnel. El interstitial de ngrok
    free pide un clic ("Visit Site") la primera vez. Revertir a `http://localhost:3000` al
    terminar. Admin siempre por `localhost` (allow-list de magic links).
  - **Reembolsos:** el sandbox de MP **no permite reembolsar por API** con credenciales de
    prueba (401 "Unauthorized use of live credentials") ni **entrega webhooks reales** de pagos
    de prueba a la URL test-mode del panel. Se prueba por capas:
    1. Unit + itests (gateway stub) → lógica y asiento (`mark_refunded`, inbox, NC, puntos).
    2. `node scripts/mp-replay-refund.mjs --payment <id>` (dev server + DB local arriba) →
       la ruta real con firma válida + lectura real del pago en MP + asiento + email +
       idempotencia ante re-entregas. `--list` muestra los pagos sandbox ya reembolsados que
       sirven de fixture. `db:reset` al terminar.
    3. Para generar un reembolso NUEVO en sandbox: pagar como comprador de prueba (túnel) y
       reembolsar desde el panel de MP como vendedor de prueba, con `MP_NOTIFICATION_URL`
       apuntando al túnel (la IPN por-preference sí llega; su firma no valida, es esperado).
    4. El `POST /refunds` iniciado por la app **solo se verifica en prod**: un pago real
       chico + "Cancelar y reembolsar" desde el admin; en los logs de Vercel debe aparecer
       `firma ok (forma=webhooks)` del loopback y UNA sola NC. El camino de aborto (MP
       falla → DB intacta) sí está probado local contra el 401 real.
- A producción **solo** va lo ya verificado localmente. Lo único exclusivo de prod: crear el
  proyecto remoto, env vars de prod, dominio.
- **Tests de integración.** CI los corre contra Supabase en contenedor (job "integration
  tests"), pero los specs que tocan Mercado Pago se auto-omiten sin `MP_ACCESS_TOKEN` — para
  cambios de pagos/MP, corré `npm run test:integration` local con credenciales de sandbox.

## Where things live

- `lib/site.ts` — site data: contact (WhatsApp), STEPS, GEAR, room lists. Single source for copy/data.
- `lib/pricing.ts` — **pricing engine (single source of truth)**: tiers, volume discounts,
  add-ons, `quote()`, `bookingMessage()` (WhatsApp text), formatters. Pure/testable, no UI.
- `lib/photos.ts` — photo manifest. `PLACEMENT` decides which file goes to hero/sala/cierre/
  equipo so the gallery never repeats images. Drop files in `public/photos/` (prefix-named:
  `hero-*`, `cabina-*`, `equipo-xdj/djm/vm70-*`) and rebuild — auto-discovered.
- `components/` — sections in `components/sections/`; shared (`Logo`, `BrandImage`, `Nav`,
  `Footer`, motion: `MaskText`/`Magnetic`/`Ticker`/`ParallaxImage`). `CustomCursor` is
  marketing-only (mounted by `app/(marketing)/layout.tsx`, never by the root).
  `components/PublicChrome.tsx` is the one place that mounts GTM (noscript + `gtm-init`) +
  `ConsentBanner` + Vercel `<Analytics/>`. GTM only when `VERCEL_ENV === "production"` (or
  `NEXT_PUBLIC_GTM_FORCE=true` locally) — see `lib/measurement.ts`.
- `lib/curso-content.ts` — Curso DJ copy/prices (`CURSO`, `PRECIOS`, `FAQ`…). Lives in `lib/`
  because the home section, a guide and `app/admin/(panel)/curso/generaciones` read it too —
  never import across `app/` trees (`@/app/...` from `components/` is a smell).
- `app/` — four **surfaces**, each owning its chrome in exactly one file (route groups never
  change URLs). `lib/chrome-contract.test.ts` pins this; keep it green.
  - `app/layout.tsx` (root): `<html>`/`<body>`, fonts, metadata/viewport, `globals.css`, the
    Consent Mode `consent-default` Script and `<SpeedInsights/>`. **`beforeInteractive` only
    works in this file** — nothing in lint or build enforces it (the @next rule skips `app/`);
    only the contract test does. No other chrome here.
  - `app/(marketing)/`: home `page.tsx` (composition + JSON-LD; it must NOT export a `title` —
    root `title.template` applies to it), `curso-dj/` (+ `pago/`, OG pair), `grabacion/`,
    `unete/`, `privacidad/`, `terminos/` and the nested `(articulos)/` group. `layout.tsx` mounts
    `CustomCursor`, the `.scroll-meter` div (`data-surface="marketing"`, which also scopes smooth
    scroll via `html:has(...)` in `globals.css`) and `PublicChrome`. It returns a fragment and
    never mounts `Nav`/`Footer` — pages and `(articulos)/layout.tsx` own those.
  - `app/(booking)/`: `reservar/`, `reserva/`. `layout.tsx` mounts `PublicChrome` only.
  - `app/cuenta/`: `layout.tsx` mounts `PublicChrome` only, above `login/` and `(panel)/`.
    `/cuenta` keeps GTM by decision (it fires `whatsapp_click`; EEA visitors need the banner).
  - `app/admin/`: **no chrome at all** — no `PublicChrome`, no cursor, no GTM, no banner. Never
    add `app/admin/layout.tsx` or `app/admin/error.tsx` (`app/error.tsx` is `/admin/login`'s boundary).
  Root-only metadata routes stay at `app/`: `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`,
  `twitter-image.tsx`, `apple-icon.tsx`, `manifest.ts`, `icon.svg`. OG fonts live in
  `app/_fonts/` (Big Shoulders, JetBrains Mono), read `process.cwd()`-relative — don't move them.
- `public/photos/` (real photos), `public/logo/` (brand SVGs, transparent), `public/og/`
  (1200×630 crops for the social cards — satori base64-inlines whatever you give it, so a
  4 MB original costs ~5.6 MB of JS per card; `lib/og-assets.test.ts` keeps the cards off
  `public/photos/` and pins the size).
- Colocation: single-use UI lives in the segment's `_components/`; shared admin UI in
  `components/admin/` (design system: `components/admin/ui/`). Server actions are segment-local
  (`<segment>/actions.ts`, `"use server"` + `requirePermission`) — no global actions file.
- Route errors/404: `app/error.tsx` + `app/global-error.tsx` + `app/not-found.tsx` (public,
  brand-styled; both render with the root layout only — no group chrome — so `not-found.tsx`
  mounts `PublicChrome` itself and hard 404s, including unmatched `/admin/*` URLs, keep
  GTM/consent, while `error.tsx` renders un-chromed) and `app/admin/(panel)/error.tsx` +
  `not-found.tsx` (inside the shell). Never render raw `error.message`; show `error.digest` only.

## Brand guardrails (Manual de Marca)

- **Palette:** Ink `#0a0a0a` · Bone `#f5f2ec` · Gold `#e8c94a` · Sirena `#ff4d1d`.
  Gold is the everyday color on Ink. **Sirena is for urgency only — never decorative.**
- **Tool-surface text (admin + cuenta):** secondary text is `bone-quiet` (`#8c8880`, AA on
  Ink); `bone-mute` (3.8:1) is marketing small print / decorative only. Form controls use
  `border-ink-edge` (3.3:1), never the hairline. `lib/admin-a11y-contract.test.ts` enforces
  both, plus native `<dialog>` modals, `th scope`, and persistent error toasts.
- **Type:** Big Shoulders (display, headlines), JetBrains Mono (labels/`.label`, tracked
  uppercase), Fraunces Italic (one editorial line per section — marketing only).
- **Tool-surface type (admin + cuenta):** the shells set `data-surface="tool"`, which steps
  the letra menuda up in `globals.css` (`.label` 12px, `.label-sm` 11px, 0.14em) — never
  edit the base `.label` classes for the admin. Table headers, form labels and KPI labels
  use `.label`; pills/badges `.label-sm`. App headings are fixed rem (`text-3xl sm:text-4xl`),
  never `clamp()`. Enforced by `lib/admin-a11y-contract.test.ts`.
- **Voice:** Spanish (Chile), precise and direct. Exact gear models: 2× Pioneer XDJ-1000MK2,
  Pioneer DJM-450, 2× **Pioneer DJ VM-50**. Say "aislada acústicamente" (not "insonorizada").
- **Photography:** low-key, real black, single light source; every photo over text needs a scrim.

## Git & deployment workflow (trunk-based + PR)

`main` is always deployable. **Every push to `main` auto-deploys to production on Vercel.**

1. Branch per change: `feat/…`, `fix/…`, `chore/…`, `seo/…` (short-lived).
2. Commit in **small, atomic** steps using **Conventional Commits**
   (`fix(precio): show "Audio + Video" in full`).
3. Push → open a PR → review the **Vercel preview deploy** → **squash-merge** to `main` → prod.
4. Delete the branch after merge. Don't let branches live for weeks.

**Preview = build/marketing check only.** Vercel Preview has **no database** (Supabase env is
not set there; `instrumentation.ts` downgrades the env guard from throw→warn under
`VERCEL_ENV=preview`). A preview URL validates that the app *builds* and that static/marketing
pages render — it does **not** exercise booking, admin, or payment flows. Verify DB/admin/payment
behavior **locally** (see *Local-first testing*).

Before pushing, verify locally: **`npx eslint .` and `npm run build` must both pass (exit 0).**
CI (`.github/workflows/ci.yml`) runs eslint + unit tests + build, plus the **integration tests**
against a containerized Supabase, on every PR.

### Commit identity

The repo is **public**, so Vercel deploys commits from any author — no author restriction.
Just keep a consistent identity and use Conventional Commits. This repo's git config:

```bash
git config user.name  "FOTF Studios"
git config user.email "292203776+fotfstudios@users.noreply.github.com"
```

### Secrets

Never commit secrets. Use Vercel **Environment Variables** (scoped per environment).
`.env*.local` is gitignored. If a secret is ever committed, rotate it — history is permanent.

## Branch protection — active

`main` is protected by a ruleset (kept as code in `.github/rulesets/main.json`): **pull request
required**, **squash-merge only**, the **lint & build** status check must pass, **linear
history**, and no force-pushes or branch deletion. Direct pushes to `main` are rejected — every
change goes through a PR. Repo merge settings: only "Allow squash merging" enabled, and
"Automatically delete head branches" on.
