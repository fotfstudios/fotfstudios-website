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
npm run test:integration  # vitest *.itest.ts contra la DB local (requiere db:start; no corre en CI)

# Plataforma de reservas — base de datos local (Supabase CLI, requiere Docker)
npm run db:start # supabase start  (stack local; aplica migraciones de supabase/migrations)
npm run db:reset # re-aplica migraciones + seed desde cero
npm run db:types # regenera src/infrastructure/db/database.types.ts desde la DB local
npm run db:stop  # detiene el stack
```

Always restart `npm run dev` after a `npm run build` — the build rewrites `.next` and can leave
a running dev server in a broken state.

**Supabase local:** este repo usa puertos **544xx** (API 54421, DB 54422, Studio 54423,
Mailpit 54424) para no chocar con otro proyecto Supabase local. Las migraciones en
`supabase/migrations/` son la **fuente de verdad** del esquema; el proyecto remoto se crea recién
al desplegar. Flujo: editar/crear migración → `db:reset` → `db:types` → tests.

## Where things live

- `lib/site.ts` — site data: contact (WhatsApp), STEPS, GEAR, room lists. Single source for copy/data.
- `lib/pricing.ts` — **pricing engine (single source of truth)**: tiers, volume discounts,
  add-ons, `quote()`, `bookingMessage()` (WhatsApp text), formatters. Pure/testable, no UI.
- `lib/photos.ts` — photo manifest. `PLACEMENT` decides which file goes to hero/sala/cierre/
  equipo so the gallery never repeats images. Drop files in `public/photos/` (prefix-named:
  `hero-*`, `cabina-*`, `equipo-xdj/djm/vm70-*`) and rebuild — auto-discovered.
- `components/` — sections in `components/sections/`; shared (`Logo`, `BrandImage`, `Nav`,
  `Footer`, motion: `MaskText`/`CustomCursor`/`Magnetic`/`Ticker`/`ParallaxImage`).
- `app/` — `layout.tsx` (metadata), `page.tsx` (composition + JSON-LD), and metadata routes:
  `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `twitter-image.tsx`, `apple-icon.tsx`,
  `manifest.ts`, `icon.svg`. OG fonts live in `app/_fonts/` (Big Shoulders, JetBrains Mono).
- `public/photos/` (real photos), `public/logo/` (brand SVGs, transparent).

## Brand guardrails (Manual de Marca)

- **Palette:** Ink `#0a0a0a` · Bone `#f5f2ec` · Gold `#e8c94a` · Sirena `#ff4d1d`.
  Gold is the everyday color on Ink. **Sirena is for urgency only — never decorative.**
- **Type:** Big Shoulders (display, headlines), JetBrains Mono (labels/`.label`, tracked
  uppercase), Fraunces Italic (one editorial line per section).
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

Before pushing, verify locally: **`npx eslint .` and `npm run build` must both pass (exit 0).**
CI (`.github/workflows/ci.yml`) re-runs these on every PR.

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
