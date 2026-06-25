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
```

Always restart `npm run dev` after a `npm run build` — the build rewrites `.next` and can leave
a running dev server in a broken state.

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

### Commit identity — REQUIRED

The repo is private and the Vercel project is on the **Hobby** plan, which only deploys commits
authored by the owner account. **All commits must be authored as the `fotfstudios` account** or
the deploy is blocked ("commit author could not be matched / no contributing access").

This repo's git config is already set to:

```bash
git config user.name  "FOTF Studios"
git config user.email "292203776+fotfstudios@users.noreply.github.com"
```

If commits ever get authored with another email, re-author and force-push:
`git rebase --root --exec 'git commit --amend --no-edit --reset-author'` then
`git push --force-with-lease`.

### Secrets

Never commit secrets. Use Vercel **Environment Variables** (scoped per environment).
`.env*.local` is gitignored. If a secret is ever committed, rotate it — history is permanent.

## Branch protection (admin: the `fotfstudios` account)

Enforced in GitHub repo settings (collaborators can't set this):

- Settings → General → Pull Requests: enable **only** "Allow squash merging"; enable
  "Automatically delete head branches".
- Branch ruleset on `main`: require a pull request, require the **CI** status check, require
  linear history.
