# Directorio de clientes — PR2 (identidad por `auth_user_id`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR2 of the customer-directory chain — **code only, no migration** — so the app stops assuming `customers.id === auth.users.id`: one home for contact normalization, a customer-input parser, the widened `CustomerRepository` port over PR1's RPCs, a `CustomerService` that resolves session → customer through `auth_user_id`, and the eight session call sites re-pointed at it.

**Architecture:** Bottom-up through the hexagon. First two pure domain modules (`src/domain/contact/contact.ts`, `src/domain/customers/customer-input.ts`) that absorb four duplicated helpers and own every user-facing string; then the port (`src/application/ports/customers.ts`) gains identity fields and directory methods; then the Supabase adapter implements them over the two PR1 RPCs this PR actually calls (`ensure_customer_for_user`, `update_customer_contact`) and the tables; then `CustomerService` returns a **discriminated result** instead of throwing (the repo's `error.tsx` boundaries never render `error.message`, and a layout is not caught by its own segment's boundary, so a throw could never reach the user with legible copy); finally the eight call sites and the itest fixtures. Each task leaves `eslint + tsc + tests` green, so the branch is reviewable at any commit.

**Tech Stack:** TypeScript 5 / Next.js 15 App Router (RSC + server actions), Supabase JS v2 over the service role, vitest (unit: `src/**/*.test.ts` + `lib/**/*.test.ts`, node env, **no DOM**; integration: `*.itest.ts` against local Supabase on ports 54421/54422), ESLint 9 flat config with layer-boundary rules.

**Spec:** `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` — read it end to end first, especially "Decisiones del dueño", "Invariante central", §"Dominio y aplicación" and the PR2 entry of "Cadena de PRs". This plan argues from it. Background: PR1's plan `docs/superpowers/plans/2026-09-09-directorio-clientes-pr1-expand.md` (format model only — its Task 6 SQL is stale; the file on disk, `supabase/migrations/20260909120000_customer_directory.sql`, is the truth).

## Global Constraints

- **PR1 is merged and its migration is applied in production, staging and locally.** The schema and the six RPCs are live everywhere. **This PR adds NO migration and MUST NOT run `npm run db:types`** — there is no schema change, so `src/infrastructure/db/database.types.ts` must stay byte-identical (CI's "Check generated DB types are in sync" step compares it). If you think you need a migration, you have left PR2's scope.
- **Language:** every user-facing string in Chilean Spanish (precise, direct, no exclamation marks); identifiers, sentinels (`email_taken`, `customer_has_account`, …), file names and commit messages in English. Code comments follow the surrounding file (this repo comments in Spanish).
- **Branch:** `feat/directorio-clientes-identidad`, already created and checked out from `main` at `14ddf46`. Squash-merged via PR; **do not push until a whole-branch review has happened** (Task 9 stops before `git push`).
- **`git` on PATH fails on this machine** with "You have not agreed to the Xcode license agreements". Use **`/opt/homebrew/bin/git`** for every git command (same arguments). `gh` is at `/opt/homebrew/bin/gh`. **`python3` is blocked** — use `node` for any scripting.
- **Conventional Commits**, small and atomic, one per task. Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` passed as a second `-m` (if your session's attribution guidance names a different model, use that line instead — the point is that the trailer is there).
- **No new npm dependencies.** Everything here is stdlib + what is already installed.
- **Local-first (CLAUDE.md):** everything is verified against local Supabase (`npm run db:start`, Docker). Never against prod or the remote DB.
- **Never leave the local DB seed-less.** The integration suite truncates transactional tables; **always finish an integration run with `npm run db:reset`.**
- **Before pushing:** `npx eslint .`, `npm test`, `npm run test:integration` and `npm run build` must all exit 0.
- **Layer boundaries (`eslint.config.mjs`):** `src/domain/**` may not import `@/src/application/*`, `@/src/infrastructure/*`, `@/app/*`, `@/components/*`, nor `next`/`react`/`@supabase/*`. `src/application/**` may not import `@/src/infrastructure/*` nor `next`/`@supabase/*`. `lib/**` and `src/infrastructure/**` may import from `src/domain/**` freely.
- **Never render a raw DB message.** `run()`/`runData` (`components/admin/ui/action.ts`) surface `e.message` verbatim in toasts, and the `error.tsx` boundaries only show `error.digest`. Every error that can reach a person goes through `customerDbErrorMessage` (Task 2).
- **Snapshot invariant (spec §"Invariante central"):** every writer of `customer_id` also rewrites `customer_name/email/phone` from the `customers` row. In PR2 this is enforced entirely inside PR1's SQL: the only writer of contact data this PR calls is `update_customer_contact`, which calls `customer_sync_snapshots` itself — the adapter must go through that RPC and must never `UPDATE customers` directly for contact data.
- **Run one unit test file:** `npx vitest run src/domain/contact/contact.test.ts` (add `-t "<describe or it title>"` for one block). **Run one integration file:** `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customer-repository.itest.ts` (`fileParallelism: false`; `tests/setup.integration.ts` loads `.env.local`).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/domain/contact/contact.ts` | create (Task 1) | The single home for `EMAIL_RE`, `EMAIL_MAX`, `normalizeEmail`, `normalizePhone`, `phoneDigits`, `normalizePhoneCl`. Pure, no IO, mirror of PR1's SQL email gate. |
| `src/domain/contact/contact.test.ts` | create (Task 1) | Email/phone matrix + `normalizePhoneCl` parity with the old `lib/whatsapp` cases. |
| `src/domain/applications/application.ts` | modify (Task 1) | Drops its private `EMAIL_RE`/`normalizePhone` (lines 75–84) and imports them. |
| `src/domain/course/lead.ts` | modify (Task 1) | Same (lines 54–62). |
| `lib/whatsapp.ts` | modify (Task 1) | `normalizePhoneCl` moves to `contact.ts`; this file imports and **re-exports** it so `waLink` and `lib/whatsapp.test.ts` keep working. |
| `lib/profile.ts` | modify (Task 1) | Keeps its permissive "store what was typed" semantics; the digit-range half of the check delegates to `normalizePhone`. |
| `src/domain/customers/customer-input.ts` | create (Task 2) | `CUSTOMER_CAPS`, `SEARCH_MAX`, `parseCustomerInput`, `customerSearchNeedle`, `customerLabel`, `customerDbErrorCode`, `customerDbErrorMessage`, `isEnsureEmailConflict`. Owns every Spanish sentence for customer errors. |
| `src/domain/customers/customer-input.test.ts` | create (Task 2) | Exact strings, caps, contact rule, needle, DB-error mapping incl. the 23505 TOCTOU. |
| `src/application/ports/customers.ts` | modify (Tasks 3, 4, 5, 8) | `CustomerProfile` + `authUserId`/`createdAt`, `EnsureCustomerResult`, and **exactly four** new methods (`ensureForAuthUser`, `findByAuthUser`, `updateContact`, `bookingsForCustomer`); legacy `upsertCustomer`/`updateProfile` removed in Task 8. `search`/`list`/`create`/`findByEmail`/`findByPhoneDigits`/`assignToBooking` (and `CustomerHit`/`CustomerListQuery`) are **not** in PR2 — see the scope decision below. |
| `src/infrastructure/db/customer-repository.ts` | modify (Tasks 3, 4, 5, 8) | Supabase adapter over PR1's tables and RPCs. |
| `src/infrastructure/db/customer-repository.itest.ts` | create (Task 3), append (Tasks 4, 5) | Integration tests **for the adapter itself** — column mapping, the `bookingsForCustomer` OR-fallback, `EnsureCustomerResult` as a value and sentinel translation. PR1's `customers-directory.itest.ts` already proves the SQL; do not re-run it here. |
| `src/application/customers/customer-service.ts` | modify (Tasks 6, 8) | Session → customer through `auth_user_id`; discriminated `ensureCustomer`. |
| `src/application/customers/customer-service.test.ts` | create (Task 6) | Unit tests with hand-rolled `vi.fn()` port fakes. |
| `app/auth/callback/route.ts` | modify (Task 7) | Keeps its `.catch`; logs an email conflict instead of throwing. |
| `app/cuenta/(panel)/layout.tsx` | modify (Task 7) | Renders the email-conflict state (never a throw) and reads the balance from the returned profile. |
| `app/cuenta/(panel)/_components/EmailConflict.tsx` | create (Task 7) | The conflict screen (single-use UI, colocated per CLAUDE.md). |
| `app/cuenta/(panel)/page.tsx` | modify (Task 7) | `profileByUser` + `movementsByUser`. |
| `app/cuenta/(panel)/perfil/page.tsx` | modify (Task 7) | `profileByUser`. |
| `app/cuenta/(panel)/perfil/actions.ts` | modify (Task 7) | `updateProfileByUser`. |
| `app/cuenta/(panel)/reservas/page.tsx` | verify only (Task 7) | Uses `bookings(email)` — unchanged, must keep working. |
| `app/reservar/page.tsx` | modify (Task 7) | Uses the profile returned by `ensureCustomer` (an adopted ficha has `id ≠ userId`). |
| `app/api/bookings/route.ts` | modify (Task 7) | Normalizes the body customer; redeems with `profile.id`, **never** `session.userId`. |
| `src/infrastructure/db/points.itest.ts` | modify (Task 8) | Fixtures gain `auth_user_id`; the `book` helper accepts an explicit `customerId`; retro test uses the returned id; new legacy-adoption cases **and the redemption case for a customer whose id ≠ auth user id** (spec §"Pruebas", PR2 bullet). |
| `src/infrastructure/db/reschedule.itest.ts` | modify (Task 8) | `on conflict (id)` → `on conflict (email)` on lines 423 and 463. |
| `docs/superpowers/plans/2026-09-09-directorio-clientes-pr2-identidad.md` | commit (Task 0) | This plan. |

## What PR1 already gave us (do not re-derive it)

- **RPCs (exact signatures, from `supabase/migrations/20260909120000_customer_directory.sql`):**
  - `ensure_customer_for_user(p_user uuid, p_email text) returns uuid`
  - `update_customer_contact(p_customer uuid, p_name text, p_email text, p_phone text) returns void`
  - `award_retro_points(p_customer uuid) returns int` (pre-existing)
  - `assign_booking_customer(p_reservation uuid, p_customer uuid, p_created_by uuid default null)` — **not called from the app in PR2** (PR7 owns it; see decision 1).
  - `upsert_guest_customer`, `backfill_customers_from_bookings`, `customer_sync_snapshots` — **not called from the app in PR2** (PR3 owns them).
- **Every `raise exception` literal PR2's copy module maps** (the `customer_assign_*` four are copy only — nothing in PR2 can raise them; they are here so PR7 inherits the sentences): `customer_user_required`, `customer_email_required`, `customer_email_owned_by_other_user`, `customer_not_found`, `customer_email_invalid`, `customer_has_account`, `customer_email_in_use`, `customer_assign_not_booking`, `customer_assign_inactive`, `customer_assign_points_order`, `customer_assign_needs_email`.
- **Generated types already in the repo** (`src/infrastructure/db/database.types.ts`): `customers.Row` has `auth_user_id: string | null`, `email: string | null`, `phone_digits: string | null`, `created_at: string`; `orders`/`reservations` have `customer_id: string | null`; `Functions` has the six new entries. Type your RPC calls against these — **no regeneration**.
- **`CustomerProfile.email` is already `string | null`** (widened in PR1's Task 8).

## Carry-forward findings from PR1's reviews — all four are handled here

1. **TOCTOU in `ensure_customer_for_user`.** Its "is this email free?" check is a non-serializable `not exists (…)` inside an UPDATE (migration lines ~187–189). A concurrent insert of the same email surfaces a raw Postgres **`23505`** instead of the `customer_email_owned_by_other_user` literal. PR1 deliberately did not catch it in SQL, so **PR2 treats `23505` on that path as the same condition** — `isEnsureEmailConflict` (Task 2, with its own unit test) and `ensureForAuthUser` (Task 5).
2. **The literal overstates the cause.** `customer_email_owned_by_other_user` also fires when the email belongs to an **unclaimed guest/backfilled ficha** and on the primary-key-conflict re-read path. **User-facing copy must never promise "another account".** The sentences used are "Ese email ya pertenece a otro cliente." (admin) and, in `/cuenta`, "Tu correo ya está registrado en otro cliente nuestro…" — true in all three cases.
3. **`bookingsForCustomer(customerId, email)` takes both** and matches `customer_id = :id OR (customer_id IS NULL AND lower(customer_email) = :email)`. The email branch is reachable in production today: PR1's backfill has **not** run (it lands in PR3) and courtesy bookings bypass the checkout path entirely.
4. **Legacy rows.** Any login through the still-live upsert-by-id (`customer-repository.ts:16`, removed in Task 8) creates a row with `id = <auth user id>` and `auth_user_id = NULL`. `ensure_customer_for_user` step 2 claims exactly those. Task 8 adds an **application-level** integration case proving such a row is adopted (same id, `auth_user_id` set, still exactly one row) instead of duplicated, plus the sibling case where a directory ficha with a **different** id is adopted by email.

## Decisions of this PR (read before Task 1)

1. **Scope cut — the port only grows what PR2's own call sites use.** PR2 adds exactly four methods (`ensureForAuthUser`, `findByAuthUser`, `updateContact`, `bookingsForCustomer`) on top of the four that already exist (`getProfile`, `movements`, `bookingsForEmail`, `awardRetroPoints`). **`create` and `findByEmail` move to PR5, `search` and `list` (with `CustomerHit`/`CustomerListQuery`) to PR6, and `assignToBooking` to PR7** — the PRs the spec's "Cadena de PRs" already assigns them to, and the PRs whose UI is their only consumer. `bookingsForCustomer` stays in PR2 even though its admin consumer is PR6: it carries the orphan-fallback requirement of carry-forward finding 3 and is cheap to prove now.
2. **The adapter itests prove the ADAPTER, not PR1's SQL.** PR1's `src/infrastructure/db/customers-directory.itest.ts` already asserts, at the SQL level, that `ensure_customer_for_user` adopts a ficha preserving its id, is idempotent, claims the legacy row and raises on a taken email, that `update_customer_contact` rewrites snapshots and raises `customer_email_in_use`/`customer_has_account`, and every `assign_booking_customer` refusal. `customer-repository.itest.ts` must **not** repeat any of that: it covers column mapping, `EnsureCustomerResult` coming back as a value instead of a throw, the sentinel translation of a rejection, and the `bookingsForCustomer` OR-fallback. The application-level proof that a legacy row is adopted (carry-forward 4) lives in Task 8, over the service.
3. **The `/cuenta` conflict copy deviates from the spec's sentence, on purpose.** The spec (§"Call sites") suggests "Tu correo cambió y ya existe otro cliente con ese email…". PR2 ships "Tu correo ya está registrado en otro cliente nuestro, así que no pudimos vincularlo a esta sesión. Escríbenos y lo unificamos." — the spec's version asserts the email **cambió**, which is false on two of the three paths that raise `customer_email_owned_by_other_user` (an unclaimed guest/backfilled ficha already owns the email; and the primary-key-conflict re-read path). The plan's sentence is true on all three. Not a spec miss — a deliberate correction.

### Cambios de comportamiento de este PR (aceptados por el dueño, listados para que se vean)

Consolidating four copies of `normalizePhone` into one Chile-aware helper, and re-pointing `/cuenta/perfil` at a narrow `customers`-only write, changes behaviour beyond a pure refactor. All of it is intentional; all of it goes in the PR body (Task 9). **Item 6 was rewritten by the final whole-branch review** — the original plan routed the profile save through `update_customer_contact`, which is destructive until PR3; read item 6 for what actually ships and why every later reference in this document to that routing (Task 6 step 6, the Task 7 smoke script, the Spanish PR-body draft at the end) is superseded by it.

1. **`"56962803298"` typed without a plus now becomes `"+56962803298"`** (11 digits starting with `56` gain the `+`).
2. **Any 9-digit number starting with `9` now gains `+56`** — including a foreign number that happens to have that shape. Accepted: in this business a bare 9-digit number is a Chilean mobile.
3. **`"0012345678"` now becomes `"12345678"`** (the `00` international prefix is stripped; the `+` is only added when the input actually carried one, or when the Chilean branches fire, so `"0056962803298"` → `"+56962803298"` and `"00981234567"` → `"+56981234567"`).
4. **The profile form now rejects phones with 16 to 20 digits.** `validateProfile`'s allow-list accepts 6–20 *characters*, so a 16-digit string used to be stored; E.164 caps at 15 digits, so those are not real numbers.
5. **`/api/bookings` now truncates the customer name to 80 characters** (the `customers_name_len` CHECK), instead of passing an arbitrarily long name into the order snapshot.
6. **The big one — CORRECTED in the final review: saving `/cuenta/perfil` does NOT go through `update_customer_contact`, and the snapshot propagation is deliberately NOT in this PR.** The original decision routed the profile save through that RPC so the customer-facing and admin writers could never drift. It was accepted on a false premise — that PR3 performs the same effects anyway, so the end state would be identical. It does not. `update_customer_contact` writes `name` and `phone` unconditionally and then `customer_sync_snapshots` copies the record's fields — **including NULLs** — onto every order and reservation matching that email. `validateProfile` maps an empty form field to `null` and the form prefills from the record, whose `name` and `phone` are NULL for all three production customers today (while thirteen reservations carry a name and five a phone). So the destructive path was the DEFAULT: the first person to open the profile page, fill one field and save, would blank the other across their own bookings — paid history and confirmed upcoming reservations included — and destroy exactly the rows PR3's backfill reads to populate the directory, leaving the record permanently nameless. PR3 runs the other way (bookings → customers, filling NULLs with `coalesce`) and never rewrites a snapshot; this ran customers → bookings, overwriting. **What ships instead:** the port gains a narrow `updateNamePhone(customerId, { name, phone })` that writes only those two columns on the `customers` row, keyed by the RECORD's id, and `updateProfileByUser` calls that, inside the same error-translated path. `updateContact` stays on the port and adapter unused — it is the correct call for the admin editor in PR5, **once PR3 makes `customer_sync_snapshots` non-destructive (coalesce `name` and `phone`, keep `email` authoritative)**; only then may any writer use it, and only then can the two writers be unified. Consequence for this PR: editing the profile no longer updates the snapshot the staff reads for WhatsApp, no orphan row is adopted, and `award_retro_points` is not triggered from the profile — all three arrive with PR3. It therefore also does NOT add a second trigger for the known, pre-existing `award_retro_points` over-award on reschedule top-up orders (still tracked as its own separate PR). A unit test (`customer-service.test.ts`) pins that the profile save never calls `updateContact`, and an integration test (`customer-repository.itest.ts`) proves against the real database that a save with one field blank leaves the other intact on the customer's reservation and order; both fail if anyone points the profile save back at `updateContact`.
7. **A phone with a leading `00` is only stripped when what remains is itself 8–15 digits** — i.e. `"00123456"` keeps returning `"00123456"`, exactly as today. Without that guard the consolidation would have turned a previously-accepted DJ application / course lead phone into `null` (a rejected submission). This one is a **fix inside this PR**, not an accepted change: it is pinned by a test in Task 1.
8. **An explicit `+` is overridden by the Chilean branch: a 9-digit number starting with `9` gains `+56` even when the caller already marked it international** (`"+912345678"` → `"+56912345678"`, and the same through `"(+91) 2345678"`). Accepted: no country whose calling code starts with `9` has only 9 digits total, so in this studio's forms that shape is always a mis-prefixed Chilean mobile, never a real foreign number — the new result is the more useful one.
9. **The `00` strip also widens acceptance at the long end: a `00`-prefixed 16- or 17-digit input that used to return `null` is now accepted whenever what remains after stripping the `00` is 15 digits or fewer** (`"0012345678912345"` → old `null`, new `"12345678912345"`). Accepted: 15 digits is exactly the E.164 maximum, so the old `null` was the defect, not the rule — this only ever accepts more, never rejects more.

---

### Task 0: Branch and commit the plan

**Files:**
- Commit: `docs/superpowers/plans/2026-09-09-directorio-clientes-pr2-identidad.md` (this file)

**Interfaces:**
- Consumes: `main` at `14ddf46` (PR1 squash-merged, migration applied).
- Produces: branch `feat/directorio-clientes-identidad` that every later task commits to.

- [ ] **Step 1: Confirm the branch (it already exists and is checked out).**

```bash
/opt/homebrew/bin/git branch --show-current
```

Expected: `feat/directorio-clientes-identidad`. If it prints something else, `/opt/homebrew/bin/git switch feat/directorio-clientes-identidad` — the branch exists, so `checkout -b` would abort. Do not rebase or pull.

- [ ] **Step 2: Confirm PR1 is in the history and the migration file is on disk.**

```bash
/opt/homebrew/bin/git log --oneline -1
ls -l supabase/migrations/20260909120000_customer_directory.sql
/opt/homebrew/bin/git status --short
```

Expected: `14ddf46 feat(db): directorio de clientes (expand) (#127)`, the migration present, and a clean tree except this plan.

- [ ] **Step 3: Confirm the local DB already has PR1's schema** (it should — PR1 was verified locally):

**`psql` is NOT installed on this machine** — every SQL check in this plan runs inside the Supabase DB container:

```bash
docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c "\d customers" | grep -E "auth_user_id|phone_digits"
```

Expected: both columns listed. If the container is not running, `npm run db:start` first; if the columns are missing, `npm run db:reset` (the migration is in the repo). **Never** create a new migration here.

- [ ] **Step 4: Commit the plan.**

```bash
/opt/homebrew/bin/git add docs/superpowers/plans/2026-09-09-directorio-clientes-pr2-identidad.md
/opt/homebrew/bin/git commit -m "docs: PR2 plan for the customer directory (identity by auth_user_id)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: `src/domain/contact/contact.ts` — the single home for email and phone

**Files:**
- Create: `src/domain/contact/contact.ts`
- Create: `src/domain/contact/contact.test.ts`
- Modify: `src/domain/applications/application.ts:75-84` (delete the local `EMAIL_RE` + `normalizePhone`, import them)
- Modify: `src/domain/course/lead.ts:54-62` (same)
- Modify: `lib/whatsapp.ts:11-21` (move `normalizePhoneCl` out, re-export it)
- Modify: `lib/profile.ts` (keep semantics, use the shared helper)
- Verify unchanged (their tests must pass untouched): `src/domain/applications/application.test.ts`, `src/domain/course/lead.test.ts`, `lib/whatsapp.test.ts`, `lib/profile.test.ts`

**Interfaces:**
- Consumes: nothing (pure leaf module).
- Produces, imported by Tasks 2, 5, 7 and by `lib/`:
  - `EMAIL_RE: RegExp` — `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`, the TS mirror of PR1's SQL gate.
  - `EMAIL_MAX: 120`
  - `normalizeEmail(raw: string | null | undefined): string | null`
  - `normalizePhone(raw: string | null | undefined): string | null`
  - `phoneDigits(raw: string | null | undefined): string | null`
  - `normalizePhoneCl(raw: string): string | null`

**Two decisions this task locks in — state them in the commit body:**

1. **`normalizePhone` becomes Chile-aware, and that is deliberate.** The spec (§"Módulos puros") defines it as: digits only → strip a leading `00` → 9 digits starting with `9` ⇒ `+56…` → 11 digits starting with `56` ⇒ `+56…` → otherwise 8–15 digits ⇒ `(+)?digits` → otherwise `null`. Every input asserted by the existing suites is byte-identical under this definition (`"(+56) 9-1234-5678"` → `"+56912345678"`, `"(+56) 9-6280 3298"` → `"+56962803298"`, `"12345"`/`"1234567"`/`"+1234567890123456"` → `null`), so **`application.test.ts` and `lead.test.ts` pass untouched**. The inputs whose result changes are ones no test pins: a bare Chilean mobile (`"962803298"` → now `"+56962803298"` instead of `"962803298"`) and a `00`-prefixed international form (`"0056962803298"` → `"+56962803298"`). That canonical form is exactly what `normalizePhoneCl` (and therefore `waLink`) accepts, which is the whole point of having one helper. Pin both new cases in `contact.test.ts`.

   **The `00` strip must be conservative** (verified with `node`): stripping it unconditionally turns `"00123456"` — a perfectly valid 8-digit input that `parseApplication`/`parseCourseLead` accept **today** — into `null`, i.e. a DJ application or course lead that used to submit would start being rejected. So strip the leading `00` **only when the digits that remain are themselves 8–15**: `"00123456"` → `"00123456"` (unchanged, 6 digits left is not a phone), `"0056962803298"` → `"+56962803298"`, `"00981234567"` → `"+56981234567"`. Both are pinned below.
2. **`lib/profile.ts` keeps its permissive semantics.** `/cuenta/perfil` stores the phone **as the person typed it** (`" +56 9 6280 3298 "` → `"+56 9 6280 3298"`, `"(9) 6280-3298"` → `"(9) 6280-3298"`), unlike `parseCustomerInput`, which canonicalizes. So `validateProfile` keeps returning the trimmed typed string and keeps its character allow-list `/^[+0-9 ()-]{6,20}$/` (that 6–20 window is what guarantees the value satisfies PR1's `customers_phone_len` CHECK of 6–40 once Task 7 routes this form through `update_customer_contact`); what it delegates to the shared helper is the **digit-count half** of the decision — `normalizePhone` must also accept it. Net effect on the existing test file: nothing changes (all four cases keep their result). Net effect on untested junk: strings that are punctuation-only or carry fewer than 8 digits (`"((((((", "+1 (2) 3"`) are now rejected instead of stored — a strict improvement, since the DB would take them but nobody could call them.

- [ ] **Step 1: Write the failing test — create `src/domain/contact/contact.test.ts`:**

```ts
import { describe, expect, it } from "vitest";
import { EMAIL_MAX, EMAIL_RE, normalizeEmail, normalizePhone, normalizePhoneCl, phoneDigits } from "./contact";

describe("normalizeEmail", () => {
  it.each([
    ["  Matias.Rojas@Gmail.com ", "matias.rojas@gmail.com"],
    ["a@b.cl", "a@b.cl"],
  ])("normaliza %s → %s", (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });

  it.each(["", "   ", "sin-arroba", "a@b", "a@b.c", "a b@c.cl", "@b.cl", "a@.cl"])("rechaza %s", (raw) => {
    expect(normalizeEmail(raw)).toBeNull();
  });

  it("rechaza sobre el tope de 120 y acepta justo en el tope", () => {
    const local = "x".repeat(EMAIL_MAX - "@gmail.com".length);
    expect(normalizeEmail(`${local}@gmail.com`)).toHaveLength(EMAIL_MAX);
    expect(normalizeEmail(`${local}y@gmail.com`)).toBeNull();
  });

  it("null/undefined → null", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it("EMAIL_RE es el espejo del gate SQL", () => {
    expect(EMAIL_RE.test("matias.rojas@gmail.com")).toBe(true);
    expect(EMAIL_RE.test("con espacio@gmail.com")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+56 9 6280 3298", "+56962803298"],
    ["(+56) 9-1234-5678", "+56912345678"], // paridad con application.test.ts
    ["(+56) 9-6280 3298", "+56962803298"], // paridad con lead.test.ts
    ["962803298", "+56962803298"], // móvil chileno pelado → forma canónica
    ["0056962803298", "+56962803298"], // 00 internacional: al sacarlo quedan 11 dígitos
    ["00981234567", "+56981234567"], // 00 + móvil chileno
    // El 00 se saca SOLO si lo que queda sigue siendo un teléfono (8–15). Acá
    // quedarían 6 dígitos, así que no se toca: es el mismo valor que
    // parseApplication/parseCourseLead aceptan hoy (si volviera null, una
    // postulación que hoy entra empezaría a rebotar).
    ["00123456", "00123456"],
    ["+1 415 555 0100", "+14155550100"], // extranjero: pasa por el rango 8–15
    ["4155550100", "4155550100"], // sin +, no chileno: se conserva tal cual
  ])("normaliza %s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(["", "12345", "1234567", "+1234567890123456", "no-es-fono", null, undefined])(
    "rechaza %s",
    (raw) => {
      expect(normalizePhone(raw)).toBeNull();
    },
  );

  it("el resultado nunca supera los 40 caracteres del CHECK customers_phone_len", () => {
    expect(normalizePhone("+123456789012345")).toHaveLength(16);
  });
});

describe("phoneDigits", () => {
  it("deja solo dígitos y vuelve null si no queda ninguno", () => {
    expect(phoneDigits("+56 9 8123 4567")).toBe("56981234567");
    expect(phoneDigits("(9) 6280-3298")).toBe("962803298");
    expect(phoneDigits("sin números")).toBeNull();
    expect(phoneDigits(null)).toBeNull();
  });
});

// Paridad exacta con lib/whatsapp.test.ts: normalizePhoneCl se movió acá.
describe("normalizePhoneCl", () => {
  it.each([
    ["+56 9 6280 3298", "56962803298"],
    ["56962803298", "56962803298"],
    ["962803298", "56962803298"],
    ["9 6280 3298", "56962803298"],
    ["0056962803298", "56962803298"],
  ])("normaliza %s → %s", (raw, expected) => {
    expect(normalizePhoneCl(raw)).toBe(expected);
  });

  it.each(["", "12345", "812803298", "5696280329", "569628032988"])("rechaza %s", (raw) => {
    expect(normalizePhoneCl(raw)).toBeNull();
  });

  it("acepta la salida de normalizePhone (el teléfono guardado alimenta waLink)", () => {
    expect(normalizePhoneCl(normalizePhone("962803298") as string)).toBe("56962803298");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/domain/contact/contact.test.ts`
Expected: FAIL — `Failed to resolve import "./contact"`.

- [ ] **Step 3: Write the implementation — create `src/domain/contact/contact.ts`:**

```ts
/**
 * Contacto — único hogar de la normalización de email y teléfono del dominio.
 * Puro, sin IO. `EMAIL_RE` y el tope de 120 son el ESPEJO exacto del gate SQL de
 * `upsert_guest_customer` / `update_customer_contact` / el backfill
 * (`20260909120000_customer_directory.sql`): si divergen, la app aceptaría datos
 * que la DB rechaza (23514/`customer_email_invalid`) o al revés.
 */

/** Forma de email aceptada. Espejo de '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' en SQL. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Tope de largo del email (mismo que el gate SQL y la columna). */
export const EMAIL_MAX = 120;

/** trim + minúsculas + forma + tope; null si no pasa (nunca lanza). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX) return null;
  return EMAIL_RE.test(email) ? email : null;
}

/** Solo los dígitos (sin `+`), o null si no queda ninguno. Espejo de `phone_digits`. */
export function phoneDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits || null;
}

/**
 * Canoniza a `"+"(opcional) + dígitos`. Chile primero: quita el 00 internacional;
 * 9 dígitos que parten en 9 y 11 que parten en 56 → `+56…` (la forma que
 * `normalizePhoneCl`/`waLink` aceptan); el resto pasa si cae en 8–15 dígitos.
 * null si no. Máximo 16 caracteres → siempre cabe en customers_phone_len (6–40).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const s = raw ?? "";
  // "+" internacional si aparece antes del primer dígito (tolera "(+56)").
  const plus = /^[^\d]*\+/.test(s);
  let digits = s.replace(/\D/g, "");
  // El 00 es prefijo internacional, pero se saca SOLO si lo que queda sigue
  // siendo un teléfono (8–15 dígitos): "00123456" es un número válido de 8
  // dígitos que /unete y /curso-dj ya aceptan, y sacarle el 00 lo volvería null.
  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    if (rest.length >= 8 && rest.length <= 15) digits = rest;
  }
  if (digits.length === 9 && digits.startsWith("9")) return `+56${digits}`;
  if (digits.length === 11 && digits.startsWith("56")) return `+${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

/**
 * Dígitos internacionales (sin `+`) de un teléfono chileno, o null si no se
 * reconoce: "+56 9 6280 3298" → "56962803298"; "962803298" → "56962803298".
 * `lib/whatsapp.ts` lo re-exporta (waLink lo usa).
 */
export function normalizePhoneCl(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("56")) return digits;
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  return null;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/domain/contact/contact.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 5: Re-point `src/domain/applications/application.ts`.** Delete lines 75–84 (the `EMAIL_RE` const and the whole `normalizePhone` function with its doc comment) and add the import as the **first statement after the file's doc comment** — this file has no imports today, so there is nothing to sit next to:

```ts
import { EMAIL_RE, normalizePhone } from "@/src/domain/contact/contact";
```

Nothing else changes: `parseApplication` keeps calling `EMAIL_RE.test(email)` and `normalizePhone(phoneRaw)` exactly as before.

- [ ] **Step 6: Re-point `src/domain/course/lead.ts`.** Delete lines 54–62 (same two symbols) and add the same import at the top:

```ts
import { EMAIL_RE, normalizePhone } from "@/src/domain/contact/contact";
```

- [ ] **Step 7: Re-point `lib/whatsapp.ts`.** Replace lines 11–21 (the doc comment plus the `normalizePhoneCl` function) with an import + re-export, keeping `waLink` and everything below untouched:

```ts
import { normalizePhoneCl } from "@/src/domain/contact/contact";

// Se re-exporta: `waLink` y los callers/tests de lib/whatsapp lo siguen importando
// desde acá, pero la implementación vive en el dominio (un solo hogar).
export { normalizePhoneCl };
```

(The `import { normalizePhoneCl }` line goes with the other imports at the top of the file, above the module doc's neighbours; keep the file's existing header comment as the first thing in the file.)

- [ ] **Step 8: Re-point `lib/profile.ts`.** Replace the whole file with:

```ts
/** Validación pura del formulario de perfil del cliente (en lib/ para vitest). */
import { normalizePhone } from "@/src/domain/contact/contact";

// El perfil guarda el teléfono TAL COMO se tipeó (con espacios/paréntesis), a
// diferencia de parseCustomerInput que canoniza. Este allow-list conserva esa
// semántica permisiva y su ventana 6–20 garantiza el CHECK customers_phone_len
// (6–40) cuando /cuenta/perfil pasa por update_customer_contact.
const PHONE_CHARS_RE = /^[+0-9 ()-]{6,20}$/;

export function validateProfile(input: { name: string; phone: string }): {
  name: string | null;
  phone: string | null;
} {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (name.length > 80) throw new Error("El nombre no puede superar los 80 caracteres.");
  // Los caracteres los decide el allow-list; el rango de dígitos (8–15), el
  // helper compartido: así "((((((" o "+1 (2) 3" dejan de pasar.
  if (phone && (!PHONE_CHARS_RE.test(phone) || !normalizePhone(phone))) {
    throw new Error("Teléfono no válido. Usa dígitos, +, espacios o guiones.");
  }
  return { name: name || null, phone: phone || null };
}
```

- [ ] **Step 9: Prove the four existing suites still pass, untouched**

Run: `npx vitest run src/domain/applications/application.test.ts src/domain/course/lead.test.ts lib/whatsapp.test.ts lib/profile.test.ts`
Expected: PASS, 4 files, zero edits to any of them. If `application.test.ts` or `lead.test.ts` fails on a phone case, do **not** edit the test — re-read `normalizePhone` against Decision 1 above.

- [ ] **Step 10: Full unit suite + lint**

Run: `npm test && npx eslint .`
Expected: both exit 0. (`eslint` also proves the layer rules: `src/domain/**` importing only `@/src/domain/*` is fine; `lib/**` importing the domain is fine.)

- [ ] **Step 11: Commit**

```bash
/opt/homebrew/bin/git add src/domain/contact lib/whatsapp.ts lib/profile.ts src/domain/applications/application.ts src/domain/course/lead.ts
/opt/homebrew/bin/git commit -m "refactor(contact): single home for email and phone normalization" -m "normalizePhone gains the Chilean canonical form (+56 for bare 9-digit mobiles and 00-prefixed numbers); every input pinned by the existing application/lead/whatsapp/profile suites keeps its exact result. validateProfile keeps storing the phone as typed and only delegates the digit-range check." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `src/domain/customers/customer-input.ts` — parsing, search needle and DB-error copy

**Files:**
- Create: `src/domain/customers/customer-input.ts`
- Create: `src/domain/customers/customer-input.test.ts`

**Interfaces:**
- Consumes: `escapeIlike` from `src/domain/admin/reservas-list.ts:73` (`escapeIlike(raw: string): string`); `EMAIL_MAX`, `normalizeEmail`, `normalizePhone`, `phoneDigits` from Task 1; `Result`/`ok`/`err` from `src/domain/shared/result.ts` (`type Result<T, E = string> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }`).
- Produces, used by Tasks 5, 6, 7 (and by PR5–PR7 later):
  - `CUSTOMER_CAPS: { readonly name: 80; readonly email: 120; readonly phone: 40 }`
  - `SEARCH_MAX: 80` — tope de caracteres de la aguja antes de escapar. Se exporta junto a `customerSearchNeedle` (ambos los consumen el picker de PR5 y la lista de PR6; en PR2 quedan sin caller, como `CUSTOMER_CAPS` y `customerLabel`).
  - `interface CustomerInput { name: string; email: string | null; phone: string | null }`
  - `parseCustomerInput(raw: unknown): Result<CustomerInput, string>`
  - `customerSearchNeedle(q: string): { text: string; digits: string | null }`
  - `customerLabel(c: { name?: string | null; email?: string | null; phone?: string | null }): string`
  - `customerDbErrorCode(code: string | null | undefined, constraint: string | null | undefined, message?: string | null): string` — stable sentinel (`"email_taken"`, `"customer_has_account"`, `"customers_name_len"`, …, or `"unknown"`).
  - `customerDbErrorMessage(code: string | null | undefined, constraint: string | null | undefined, message?: string | null): string | null` — the Chilean-Spanish full sentence, or `null` when nothing matches. Passing a bare sentinel as `message` with `code = null` also resolves (that is how a rethrown `Error` gets translated).
  - `isEnsureEmailConflict(e: { code?: string | null; message?: string | null }): boolean`

**Why three arguments instead of the spec's `(code, constraint)`:** `PostgrestError` (supabase-js) carries `{ code, message, details, hint }` and **no `constraint` field** — the constraint name only appears inside `message` (`… violates unique constraint "customers_email_key"`), and a plpgsql `raise exception 'customer_has_account'` arrives as `code: "P0001"` with the literal **as** the message. The third parameter is what makes the function work against a real `PostgrestError`; the `constraint` parameter stays for `pg`-client errors (the itests), which do have it.

- [ ] **Step 1: Write the failing test — create `src/domain/customers/customer-input.test.ts`:**

```ts
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CAPS,
  customerDbErrorCode,
  customerDbErrorMessage,
  customerLabel,
  customerSearchNeedle,
  isEnsureEmailConflict,
  parseCustomerInput,
} from "./customer-input";

describe("parseCustomerInput", () => {
  it("acepta nombre + email y canoniza el email", () => {
    const r = parseCustomerInput({ name: "  Matías Rojas ", email: " Matias.Rojas@Gmail.com ", phone: "" });
    expect(r).toEqual({ ok: true, value: { name: "Matías Rojas", email: "matias.rojas@gmail.com", phone: null } });
  });

  it("acepta nombre + teléfono sin email y canoniza el teléfono", () => {
    const r = parseCustomerInput({ name: "Pía Contreras", phone: "9 1234 5678" });
    expect(r).toEqual({ ok: true, value: { name: "Pía Contreras", email: null, phone: "+56912345678" } });
  });

  it.each([
    [{ name: "", email: "a@b.cl" }, "El nombre es obligatorio."],
    [{ name: "x".repeat(81), email: "a@b.cl" }, "El nombre no puede superar los 80 caracteres."],
    [{ name: "Ana", email: "sin-arroba" }, "Email no válido."],
    [{ name: "Ana", phone: "123" }, "Teléfono no válido. Usa 8 a 15 dígitos, con o sin +."],
    [{ name: "Ana" }, "Ingresa un email o un teléfono."],
    [{ name: "Ana", email: "", phone: "  " }, "Ingresa un email o un teléfono."],
  ])("rechaza %o con la frase exacta", (raw, error) => {
    expect(parseCustomerInput(raw)).toEqual({ ok: false, error });
  });

  it("acepta el nombre justo en el tope y valores no-string se leen como vacíos", () => {
    expect(parseCustomerInput({ name: "x".repeat(CUSTOMER_CAPS.name), phone: "+56912345678" }).ok).toBe(true);
    expect(parseCustomerInput({ name: 123, email: {}, phone: null })).toEqual({
      ok: false,
      error: "El nombre es obligatorio.",
    });
    expect(parseCustomerInput(null)).toEqual({ ok: false, error: "El nombre es obligatorio." });
  });

  it("el email sobre el tope de 120 cae en 'Email no válido.'", () => {
    const long = `${"x".repeat(CUSTOMER_CAPS.email)}@gmail.com`;
    expect(parseCustomerInput({ name: "Ana", email: long })).toEqual({ ok: false, error: "Email no válido." });
  });
});

describe("customerSearchNeedle", () => {
  it("escapa los comodines de ILIKE y recorta a 80", () => {
    expect(customerSearchNeedle("100%_off").text).toBe("100\\%\\_off");
    expect(customerSearchNeedle(`a,b(c)"d*e`).text).toBe("a b c  d e");
    expect(customerSearchNeedle("x".repeat(200)).text).toHaveLength(80);
  });

  it("extrae dígitos solo con 3 o más", () => {
    expect(customerSearchNeedle("9988").digits).toBe("9988");
    expect(customerSearchNeedle("+56 9 6280 3298").digits).toBe("56962803298");
    expect(customerSearchNeedle("ma").digits).toBeNull();
    expect(customerSearchNeedle("a1b2").digits).toBeNull();
  });
});

describe("customerLabel", () => {
  it("cae de nombre a email a teléfono", () => {
    expect(customerLabel({ name: "Camila", email: "c@x.cl", phone: "+569" })).toBe("Camila");
    expect(customerLabel({ name: null, email: "c@x.cl" })).toBe("c@x.cl");
    expect(customerLabel({ name: "  ", email: null, phone: "+56912345678" })).toBe("+56912345678");
    expect(customerLabel({})).toBe("Cliente sin nombre");
  });
});

describe("customerDbErrorCode / customerDbErrorMessage", () => {
  it("23505 sobre customers_email_key → email_taken (con constraint o dentro del mensaje)", () => {
    expect(customerDbErrorCode("23505", "customers_email_key")).toBe("email_taken");
    expect(
      customerDbErrorCode("23505", null, 'duplicate key value violates unique constraint "customers_email_key"'),
    ).toBe("email_taken");
    expect(customerDbErrorMessage("23505", "customers_email_key")).toBe("Ese email ya pertenece a otro cliente.");
  });

  it("23514 mapea cada CHECK a la misma frase que parseCustomerInput", () => {
    expect(customerDbErrorMessage("23514", "customers_contact_required")).toBe("Ingresa un email o un teléfono.");
    expect(customerDbErrorMessage("23514", "customers_name_len")).toBe(
      "El nombre no puede superar los 80 caracteres.",
    );
    expect(customerDbErrorMessage("23514", "customers_phone_len")).toBe(
      "Teléfono no válido. Usa 8 a 15 dígitos, con o sin +.",
    );
  });

  it.each([
    ["customer_not_found", "El cliente ya no existe. Vuelve a seleccionarlo."],
    ["customer_email_invalid", "Email no válido."],
    [
      "customer_has_account",
      "Este cliente tiene cuenta: su email es su acceso y no se puede cambiar desde el panel.",
    ],
    [
      "customer_email_in_use",
      "Este cliente tiene puntos o reservas con ese email: no puede quedarse sin email.",
    ],
    ["customer_email_owned_by_other_user", "Ese email ya pertenece a otro cliente."],
    ["customer_assign_not_booking", "Solo se puede cambiar el cliente de una reserva de sala."],
    ["customer_assign_inactive", "Solo se puede cambiar el cliente de una reserva vigente."],
    [
      "customer_assign_points_order",
      "Esta reserva usó Puntos FOTF y no se puede reasignar; cancélala y vuelve a crearla.",
    ],
    [
      "customer_assign_needs_email",
      "Ese cliente no tiene email; agrégalo antes de reasignar una reserva pagada.",
    ],
  ])("traduce el literal %s de la RPC", (literal, sentence) => {
    expect(customerDbErrorMessage("P0001", null, literal)).toBe(sentence);
    // Un Error relanzado por el adaptador llega sin code: el literal basta.
    expect(customerDbErrorMessage(null, null, literal)).toBe(sentence);
  });

  it("la copia de customer_email_owned_by_other_user NO promete 'otra cuenta'", () => {
    // El literal también salta con una ficha de invitado sin reclamar y en la
    // carrera por PK: prometer "otra cuenta" sería falso en dos de los tres casos.
    const s = customerDbErrorMessage(null, null, "customer_email_owned_by_other_user") as string;
    expect(s).not.toMatch(/cuenta/i);
  });

  it("lo desconocido devuelve null / 'unknown' (nunca inventa copy)", () => {
    expect(customerDbErrorMessage("08006", null, "connection failure")).toBeNull();
    expect(customerDbErrorCode("08006", null, "connection failure")).toBe("unknown");
  });
});

describe("isEnsureEmailConflict", () => {
  it("reconoce el literal de ensure_customer_for_user", () => {
    expect(isEnsureEmailConflict({ code: "P0001", message: "customer_email_owned_by_other_user" })).toBe(true);
  });

  // TOCTOU de PR1: el chequeo de "email libre" no es serializable, así que una
  // inserción concurrente del mismo email aflora como 23505 crudo. Misma condición.
  it("trata el 23505 crudo del camino ensure como el MISMO conflicto", () => {
    expect(
      isEnsureEmailConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "customers_email_key"',
      }),
    ).toBe(true);
  });

  // El OTRO unique de la tabla: dos logins concurrentes del mismo usuario pueden
  // chocar en customers_auth_user_id_key. Eso es `auth_user_taken`, no un email
  // ocupado: mostrar la pantalla de conflicto de email sería mentirle a la persona.
  it("no trata el 23505 de customers_auth_user_id_key como conflicto de email", () => {
    expect(
      isEnsureEmailConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "customers_auth_user_id_key"',
      }),
    ).toBe(false);
  });

  it("no confunde otros errores", () => {
    expect(isEnsureEmailConflict({ code: "P0001", message: "customer_email_required" })).toBe(false);
    expect(isEnsureEmailConflict({ code: "08006", message: "connection failure" })).toBe(false);
    expect(isEnsureEmailConflict({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/domain/customers/customer-input.test.ts`
Expected: FAIL — `Failed to resolve import "./customer-input"`.

- [ ] **Step 3: Write the implementation — create `src/domain/customers/customer-input.ts`:**

```ts
/**
 * Entrada de cliente (staff e invitado) — parseo puro y COPY de los errores de
 * la DB. Único lugar donde viven las frases del directorio: `run()`/`runData`
 * muestran `e.message` tal cual en un toast, así que nada crudo de Postgres
 * puede llegar a una persona. La forma del email es la de `contact.ts`, que a
 * su vez es el espejo del gate SQL de PR1.
 */
import { escapeIlike } from "@/src/domain/admin/reservas-list";
import { EMAIL_MAX, normalizeEmail, normalizePhone, phoneDigits } from "@/src/domain/contact/contact";
import { err, ok, type Result } from "@/src/domain/shared/result";

/** Topes de las columnas de `customers` (name/email/phone). */
export const CUSTOMER_CAPS = { name: 80, email: EMAIL_MAX, phone: 40 } as const;

/** Aguja de búsqueda: tope de caracteres antes de escapar. */
export const SEARCH_MAX = 80;

/** Mínimo de dígitos para buscar por teléfono (menos que eso matchea todo). */
const MIN_SEARCH_DIGITS = 3;

export interface CustomerInput {
  name: string;
  email: string | null;
  phone: string | null;
}

/** Lee una clave como string recortado; cualquier no-string se vuelve "". */
function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Identidad mínima (decisión 3 del dueño): nombre + al menos uno de email o
 * teléfono. El email queda en minúsculas y con forma válida; el teléfono, en
 * `(+)?dígitos`. Devuelve Result — el dominio no lanza.
 */
export function parseCustomerInput(raw: unknown): Result<CustomerInput, string> {
  const obj = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  const name = str(obj, "name");
  if (!name) return err("El nombre es obligatorio.");
  if (name.length > CUSTOMER_CAPS.name) return err("El nombre no puede superar los 80 caracteres.");

  const emailRaw = str(obj, "email");
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  if (emailRaw && !email) return err("Email no válido.");

  const phoneRaw = str(obj, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return err("Teléfono no válido. Usa 8 a 15 dígitos, con o sin +.");

  if (!email && !phone) return err("Ingresa un email o un teléfono.");
  return ok({ name, email, phone });
}

/**
 * Aguja para el `.or()` de PostgREST: `text` ya escapado (comodines de ILIKE y
 * los delimitadores de la gramática) y `digits` solo cuando hay suficientes
 * para que buscar por teléfono discrimine.
 */
export function customerSearchNeedle(q: string): { text: string; digits: string | null } {
  const raw = (q ?? "").trim().slice(0, SEARCH_MAX);
  const digits = phoneDigits(raw);
  return {
    text: escapeIlike(raw).slice(0, SEARCH_MAX),
    digits: digits && digits.length >= MIN_SEARCH_DIGITS ? digits : null,
  };
}

/** Cómo se nombra a un cliente en la UI cuando falta el nombre. */
export function customerLabel(c: { name?: string | null; email?: string | null; phone?: string | null }): string {
  return c.name?.trim() || c.email || c.phone || "Cliente sin nombre";
}

/** Frases (una por sentinela). Chileno, directo, oración completa. */
const CUSTOMER_DB_MESSAGES: Readonly<Record<string, string>> = {
  email_taken: "Ese email ya pertenece a otro cliente.",
  auth_user_taken: "Esa cuenta ya está vinculada a otro cliente.",
  customers_contact_required: "Ingresa un email o un teléfono.",
  customers_name_len: "El nombre no puede superar los 80 caracteres.",
  customers_phone_len: "Teléfono no válido. Usa 8 a 15 dígitos, con o sin +.",
  customers_email_lower: "Email no válido.",
  customer_not_found: "El cliente ya no existe. Vuelve a seleccionarlo.",
  customer_email_invalid: "Email no válido.",
  customer_has_account: "Este cliente tiene cuenta: su email es su acceso y no se puede cambiar desde el panel.",
  customer_email_in_use: "Este cliente tiene puntos o reservas con ese email: no puede quedarse sin email.",
  // OJO: el literal exagera la causa — también salta con una ficha de invitado
  // sin reclamar y en la carrera por PK. La frase habla de "otro cliente"
  // (una ficha del directorio), nunca de "otra cuenta".
  customer_email_owned_by_other_user: "Ese email ya pertenece a otro cliente.",
  customer_email_required: "Falta el email de la cuenta.",
  customer_user_required: "Falta la cuenta que vincular.",
  customer_assign_not_booking: "Solo se puede cambiar el cliente de una reserva de sala.",
  customer_assign_inactive: "Solo se puede cambiar el cliente de una reserva vigente.",
  customer_assign_points_order: "Esta reserva usó Puntos FOTF y no se puede reasignar; cancélala y vuelve a crearla.",
  customer_assign_needs_email: "Ese cliente no tiene email; agrégalo antes de reasignar una reserva pagada.",
};

/** Nombre del constraint dentro del mensaje de Postgres (PostgrestError no trae `constraint`). */
function constraintFromMessage(message: string | null | undefined): string | null {
  return /constraint "([a-zA-Z0-9_]+)"/.exec(message ?? "")?.[1] ?? null;
}

/**
 * Sentinela estable del error de DB: `email_taken`, el nombre del CHECK, el
 * literal de la RPC — o `"unknown"`. El adaptador relanza con esta cadena para
 * que la capa de aplicación pueda ramificar sin conocer códigos de Postgres.
 */
export function customerDbErrorCode(
  code: string | null | undefined,
  constraint: string | null | undefined,
  message: string | null | undefined = null,
): string {
  if (code === "23505" || code === "23514") {
    const name = constraint ?? constraintFromMessage(message);
    if (name === "customers_email_key") return "email_taken";
    if (name === "customers_auth_user_id_key") return "auth_user_taken";
    if (name && name in CUSTOMER_DB_MESSAGES) return name;
    return "unknown";
  }
  const literal = (message ?? "").trim();
  return literal in CUSTOMER_DB_MESSAGES ? literal : "unknown";
}

/**
 * Frase para una persona, o null si no reconocemos el error (el caller decide:
 * jamás mostrar el texto crudo de Postgres).
 */
export function customerDbErrorMessage(
  code: string | null | undefined,
  constraint: string | null | undefined,
  message: string | null | undefined = null,
): string | null {
  return CUSTOMER_DB_MESSAGES[customerDbErrorCode(code, constraint, message)] ?? null;
}

/**
 * ¿El fallo de `ensure_customer_for_user` es "ese email ya es de otra ficha"?
 * El chequeo de email libre de la RPC no es serializable (PR1 lo dejó así a
 * propósito): una inserción concurrente del mismo email aflora como 23505 crudo
 * en vez del literal. Para el usuario es exactamente la misma condición.
 *
 * OJO: `customers` tiene DOS unique. El 23505 de `customers_auth_user_id_key`
 * (dos logins concurrentes del mismo usuario) es `auth_user_taken`, otra cosa:
 * se excluye para no mostrarle la pantalla de conflicto de email a alguien cuyo
 * email está perfecto. Ese caso sale por `throwDbError` como sentinela traducible.
 */
export function isEnsureEmailConflict(e: { code?: string | null; message?: string | null }): boolean {
  const message = e.message ?? "";
  if (message.includes("customer_email_owned_by_other_user")) return true;
  return e.code === "23505" && !message.includes("customers_auth_user_id_key");
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/domain/customers/customer-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Full unit suite + lint**

Run: `npm test && npx eslint .`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
/opt/homebrew/bin/git add src/domain/customers
/opt/homebrew/bin/git commit -m "feat(customers): pure customer input parser and DB error copy" -m "Maps 23505/23514 and every RPC literal from the PR1 migration to full Chilean-Spanish sentences, and treats a raw 23505 on the ensure_customer_for_user path as the same email conflict as the literal (that check is not serializable)." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Port — `CustomerProfile` gets its own identity (`authUserId`, `createdAt`)

**Files:**
- Modify: `src/application/ports/customers.ts:3-9` (widen `CustomerProfile`; add `EnsureCustomerResult`)
- Modify: `src/infrastructure/db/customer-repository.ts:26-35` (`getProfile` selects and maps the two new columns)
- Create: `src/infrastructure/db/customer-repository.itest.ts` (scaffolding + the first describe)

**Interfaces:**
- Consumes: `Database["public"]["Tables"]["customers"]["Row"]` from `src/infrastructure/db/database.types.ts` — `{ auth_user_id: string | null; created_at: string; email: string | null; id: string; name: string | null; phone: string | null; phone_digits: string | null; points_balance: number; updated_at: string }`.
- Produces (Tasks 4–8 rely on these exact names):
  ```ts
  export interface CustomerProfile {
    id: string;                // customers.id — ya NO es auth.users.id
    authUserId: string | null; // cuenta de auth vinculada; null = ficha del directorio
    email: string | null;
    name: string | null;
    phone: string | null;
    pointsBalance: number;
    createdAt: string;
  }
  export type EnsureCustomerResult = { kind: "ok"; id: string } | { kind: "email_conflict" };
  ```
- Note: `CustomerHit` and `CustomerListQuery` are **not** added here. Their only consumers are `search`/`list`/`findByPhoneDigits`, which the scope cut moves to PR5/PR6 (see "Decisions of this PR", decision 1); they land with their methods.

- [ ] **Step 1: Write the failing test — create `src/infrastructure/db/customer-repository.itest.ts`.** The scaffolding below defines a helper (`booking`, with its `slot` counter) and a constant (`U2`) that **this task does not use yet** — Task 4 does. `@typescript-eslint/no-unused-vars` is a **warning** in this repo (`eslint-config-next/typescript`), and `tsconfig.json` sets no `noUnusedLocals`, so those warnings are expected between Task 3 and Task 4 and **`npx eslint .` still exits 0**. Do not delete the helpers to silence them.

```ts
/**
 * Adaptador Supabase del directorio (SupabaseCustomerRepository): lo que agrega
 * el ADAPTADOR sobre las RPC/tablas de PR1 — mapeo de columnas, el OR de
 * `bookingsForCustomer`, `EnsureCustomerResult` como valor y la traducción de
 * rechazos a sentinelas. La semántica SQL (adopción, idempotencia, cada
 * `raise exception`) ya la prueba `customers-directory.itest.ts` de PR1: no se
 * repite acá. Fixtures por `pg` (como el seed); el adaptador, por supabase-js.
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SupabaseCustomerRepository } from "./customer-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseCustomerRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

// Usuarios auth propios de este archivo (ids distintos a points/reschedule/directory).
const U1 = "e0000000-0000-4000-a000-000000000201";
const U2 = "e0000000-0000-4000-a000-000000000202"; // lo usa Task 4 (findByAuthUser sin ficha)

const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, booking_events, points_ledger, customers cascade";

const insertAuthUser = (id: string, email: string) =>
  pg.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
       $2, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
     ) on conflict (id) do nothing`,
    [id, email],
  );

/** Ficha insertada directo (fixture), sin pasar por las RPC. Devuelve el id. */
async function customer(c: {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  authUserId?: string | null;
}): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `insert into customers (id, name, email, phone, auth_user_id)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5) returning id`,
    [c.id ?? null, c.name ?? null, c.email ?? null, c.phone ?? null, c.authUserId ?? null],
  );
  return r.rows[0].id;
}

let slot = 0;
/** Reserva 'booking' + pedido pending_payment directo; cada llamada usa otro horario (GiST). */
async function booking(c: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customerId?: string | null;
  amount?: number;
  status?: "held" | "confirmed" | "cancelled";
}): Promise<{ orderId: string; reservationId: string }> {
  slot += 1;
  const starts = new Date(Date.now() + (24 * 14 + slot) * 3_600_000);
  const ends = new Date(starts.getTime() + 3_600_000);
  const amount = c.amount ?? 9990;
  const net = Math.round(amount / 1.19);
  const status = c.status ?? "held";
  const o = await pg.query<{ id: string }>(
    `insert into orders (status, amount_clp, net_clp, tax_clp, customer_name, customer_email, customer_phone, customer_id)
       values ('pending_payment', $1, $2, $3, $4, $5, $6, $7) returning id`,
    [amount, net, amount - net, c.name ?? null, c.email ?? null, c.phone ?? null, c.customerId ?? null],
  );
  const r = await pg.query<{ id: string }>(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at, order_id,
                               customer_name, customer_email, customer_phone, customer_id)
       values ($1, 'booking', $2::reservation_status, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [
      resourceId,
      status,
      starts.toISOString(),
      ends.toISOString(),
      status === "held" ? new Date(Date.now() + 1_800_000).toISOString() : null,
      o.rows[0].id,
      c.name ?? null,
      c.email ?? null,
      c.phone ?? null,
      c.customerId ?? null,
    ],
  );
  return { orderId: o.rows[0].id, reservationId: r.rows[0].id };
}

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await insertAuthUser(U1, "u1@repo.cl");
  await insertAuthUser(U2, "u2@repo.cl");
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe("getProfile: identidad propia", () => {
  it("mapea authUserId y createdAt; una ficha del directorio no tiene cuenta", async () => {
    const linked = await customer({ id: U1, email: "linked@repo.cl", name: "Titular", authUserId: U1 });
    const guest = await customer({ name: "Pía", phone: "+56912345678" });

    const a = await repo.getProfile(linked);
    expect(a).toMatchObject({ id: U1, authUserId: U1, email: "linked@repo.cl", name: "Titular", pointsBalance: 0 });
    expect(typeof a?.createdAt).toBe("string");

    const b = await repo.getProfile(guest);
    expect(b).toMatchObject({ authUserId: null, email: null, phone: "+56912345678" });
    expect(b?.id).not.toBe(U1); // ficha del directorio: id propio

    expect(await repo.getProfile("e0000000-0000-4000-a000-0000000002ff")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customer-repository.itest.ts`
Expected: FAIL — `authUserId`/`createdAt` are `undefined` in the returned profile (the current mapper at `customer-repository.ts:34` returns only `id/email/name/phone/pointsBalance`).

- [ ] **Step 3: Widen the port.** In `src/application/ports/customers.ts`, replace the `CustomerProfile` interface (lines 3–9) with the block below and add `EnsureCustomerResult` right after it (leave `PointsMovement`, `CustomerBooking` and `CustomerRepository` untouched for now):

```ts
export interface CustomerProfile {
  id: string; // customers.id — ya NO es auth.users.id (una ficha adoptada tiene id propio)
  authUserId: string | null; // cuenta de auth vinculada; null = ficha del directorio (invitado/backfill)
  email: string | null; // null = ficha solo-teléfono (nunca para titulares de cuenta)
  name: string | null;
  phone: string | null;
  pointsBalance: number;
  createdAt: string;
}

/** Resultado de `ensure_customer_for_user`: nunca lanza para un conflicto de email. */
export type EnsureCustomerResult = { kind: "ok"; id: string } | { kind: "email_conflict" };
```

- [ ] **Step 4: Map the new columns in the adapter.** In `src/infrastructure/db/customer-repository.ts`, add a shared mapper above the class and rewrite `getProfile` (lines 26–35):

```ts
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

/** Columnas del perfil completo (una sola fuente para todas las consultas). */
const PROFILE_COLS = "id, auth_user_id, email, name, phone, points_balance, created_at";

function toProfile(r: Pick<CustomerRow, "id" | "auth_user_id" | "email" | "name" | "phone" | "points_balance" | "created_at">): CustomerProfile {
  return {
    id: r.id,
    authUserId: r.auth_user_id,
    email: r.email,
    name: r.name,
    phone: r.phone,
    pointsBalance: r.points_balance,
    createdAt: r.created_at,
  };
}
```

and

```ts
  async getProfile(id: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db.from("customers").select(PROFILE_COLS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProfile(data) : null;
  }
```

- [ ] **Step 5: Run the test and see it pass**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customer-repository.itest.ts`
Expected: PASS. Then **`npm run db:reset`** (the file truncated the seed).

- [ ] **Step 6: Prove the rest of the repo still compiles and lints**

Run: `npx tsc --noEmit && npx eslint . && npm test`
Expected: all exit 0. (Nothing else constructs a `CustomerProfile`; `/cuenta` and `/reservar` only read `pointsBalance`/`name`/`phone`.)

- [ ] **Step 7: Commit**

```bash
/opt/homebrew/bin/git add src/application/ports/customers.ts src/infrastructure/db/customer-repository.ts src/infrastructure/db/customer-repository.itest.ts
/opt/homebrew/bin/git commit -m "feat(customers): CustomerProfile carries its own identity (authUserId, createdAt)" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Adapter — the two reads PR2 actually consumes

**Files:**
- Modify: `src/application/ports/customers.ts` (add the two read methods to `CustomerRepository`)
- Modify: `src/infrastructure/db/customer-repository.ts` (implement them)
- Modify: `src/infrastructure/db/customer-repository.itest.ts` (append one describe)

**Scope (decision 1):** `findByEmail`, `findByPhoneDigits`, `search` and `list` are **not** in PR2 — nothing in this PR calls them (`findByEmail` and the picker land in PR5, the directory list in PR6). Do not add them "while we are here": they would arrive untested-by-a-caller and with types (`CustomerHit`, `CustomerListQuery`) that PR2 has no use for.

**Interfaces:**
- Consumes: `CustomerProfile`, `CustomerBooking` (port, Task 3); `escapeIlike` (`src/domain/admin/reservas-list.ts`); `PROFILE_COLS`/`toProfile` (Task 3).
- Produces, added to `CustomerRepository` and implemented:
  ```ts
  findByAuthUser(userId: string): Promise<CustomerProfile | null>;
  bookingsForCustomer(customerId: string, email: string | null): Promise<CustomerBooking[]>;
  ```
- Also produces (adapter-internal): `BOOKING_COLS`, `toBooking(row)`.

- [ ] **Step 1: Write the failing tests — append to `src/infrastructure/db/customer-repository.itest.ts`:**

```ts
describe("lecturas del directorio", () => {
  it("findByAuthUser resuelve por la cuenta, no por el id (ficha adoptada)", async () => {
    const adopted = await customer({ email: "adoptada@repo.cl", name: "Adoptada", authUserId: U1 });
    expect(adopted).not.toBe(U1);

    const p = await repo.findByAuthUser(U1);
    expect(p?.id).toBe(adopted);
    expect(p?.authUserId).toBe(U1);
    expect(await repo.findByAuthUser(U2)).toBeNull();
  });

  it("bookingsForCustomer suma las vinculadas Y las huérfanas de su email", async () => {
    const id = await customer({ email: "duena@repo.cl", name: "Dueña" });
    await booking({ email: "duena@repo.cl", customerId: id }); // vinculada
    await booking({ email: "DUENA@repo.cl" }); // huérfana (cortesía / pre-backfill)
    await booking({ email: "ajena@repo.cl" }); // de otra persona
    await booking({ email: "duena@repo.cl", customerId: await customer({ email: "otra@repo.cl" }) }); // vinculada a otra

    const rows = await repo.bookingsForCustomer(id, "duena@repo.cl");
    expect(rows).toHaveLength(2);
    expect(rows.every((b) => b.status === "held")).toBe(true);

    // Sin email (ficha solo-teléfono): solo las vinculadas por FK.
    expect(await repo.bookingsForCustomer(id, null)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customer-repository.itest.ts -t "lecturas del directorio"`
Expected: FAIL — `repo.findByAuthUser is not a function` (and the rest likewise).

- [ ] **Step 3: Declare the two methods in the port.** In `src/application/ports/customers.ts`, inside `interface CustomerRepository`, add (keep every existing member):

```ts
  /** Ficha de una cuenta de auth (índice único `auth_user_id`). NUNCA asumir id = userId. */
  findByAuthUser(userId: string): Promise<CustomerProfile | null>;
  /**
   * Reservas de un cliente: `customer_id = id` OR (sin vincular AND el email
   * coincide). La rama por email es alcanzable en prod (el backfill llega en PR3
   * y las cortesías no pasan por el checkout).
   */
  bookingsForCustomer(customerId: string, email: string | null): Promise<CustomerBooking[]>;
```

- [ ] **Step 4: Implement them in the adapter.** In `src/infrastructure/db/customer-repository.ts`: add the `escapeIlike` import, the booking mapper next to `toProfile`, and the two methods inside the class:

```ts
import { escapeIlike } from "@/src/domain/admin/reservas-list";
```

```ts
/** Mapea la fila de reserva (con su pedido) al shape del puerto. */
function toBooking(r: {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  order_id: string | null;
  orders: { status: string; amount_clp: number | null; points_redeemed_clp: number } | null;
}): CustomerBooking {
  return {
    id: r.id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status as CustomerBooking["status"],
    orderId: r.order_id,
    orderStatus: r.orders?.status ?? null,
    amountClp: r.orders?.amount_clp ?? null,
    pointsRedeemedClp: r.orders?.points_redeemed_clp ?? 0,
  };
}

const BOOKING_COLS =
  "id, starts_at, ends_at, status, order_id, customer_id, customer_email, orders(status, amount_clp, points_redeemed_clp)";
```

```ts
  async findByAuthUser(userId: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db.from("customers").select(PROFILE_COLS).eq("auth_user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProfile(data) : null;
  }

  async bookingsForCustomer(customerId: string, email: string | null): Promise<CustomerBooking[]> {
    const lower = email?.trim().toLowerCase() ?? null;
    let query = this.db
      .from("reservations")
      .select(BOOKING_COLS)
      .eq("kind", "booking")
      .order("starts_at", { ascending: false })
      .limit(200);
    // El email histórico se guardó tal como lo tipearon → ilike; el re-filtro
    // exacto en JS es la frontera (ilike trata `_` como comodín).
    query = lower
      ? query.or(`customer_id.eq.${customerId},and(customer_id.is.null,customer_email.ilike.${escapeIlike(lower)})`)
      : query.eq("customer_id", customerId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((r) => r.customer_id === customerId || (r.customer_id === null && r.customer_email?.toLowerCase() === lower))
      .map(toBooking);
  }
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customer-repository.itest.ts`
Expected: PASS (both describes). Then **`npm run db:reset`**.

- [ ] **Step 6: Lint + types**

Run: `npx tsc --noEmit && npx eslint .`
Expected: exit 0 (the adapter is infrastructure, so importing `@/src/domain/*` is allowed).

- [ ] **Step 7: Commit**

```bash
/opt/homebrew/bin/git add src/application/ports/customers.ts src/infrastructure/db/customer-repository.ts src/infrastructure/db/customer-repository.itest.ts
/opt/homebrew/bin/git commit -m "feat(customers): directory reads in the repository port and adapter" -m "bookingsForCustomer takes id AND email: the email fallback is reachable in prod because the backfill has not run yet and courtesy bookings bypass the checkout path." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Adapter — the two writes PR2 actually consumes

**Files:**
- Modify: `src/application/ports/customers.ts` (add the two write methods)
- Modify: `src/infrastructure/db/customer-repository.ts` (implement them)
- Modify: `src/infrastructure/db/customer-repository.itest.ts` (append one describe)

**Scope (decision 1):** `create` (PR5) and `assignToBooking` (PR7) are **not** in PR2. `assign_booking_customer` stays a PR1 RPC with no app caller until PR7, exactly like `upsert_guest_customer` and the backfill.

**Interfaces:**
- Consumes: `customerDbErrorCode`, `isEnsureEmailConflict` (Task 2); `EnsureCustomerResult` (Task 3); PR1's RPCs, typed in `database.types.ts` as `ensure_customer_for_user: { Args: { p_email: string; p_user: string }; Returns: string }` and `update_customer_contact: { Args: { p_customer: string; p_email: string; p_name: string; p_phone: string }; Returns: undefined }`.
- Produces, added to `CustomerRepository` and implemented:
  ```ts
  ensureForAuthUser(userId: string, email: string): Promise<EnsureCustomerResult>;
  updateContact(customerId: string, d: { name: string | null; email: string | null; phone: string | null }): Promise<void>;
  ```
  Every rejection from `updateContact` — and every non-conflict rejection from `ensureForAuthUser` — is rethrown with the **sentinel** as its message (`customer_has_account`, `customer_email_invalid`, `auth_user_taken`, …), so the application layer can branch on it and `customerDbErrorMessage` can translate it. **No path rethrows `error.message` directly.**

- [ ] **Step 1: Write the failing tests — append to `src/infrastructure/db/customer-repository.itest.ts`:**

```ts
// Solo lo que agrega el ADAPTADOR. La semántica de las RPC (adopción con id
// propio, idempotencia, fila legacy, cada rechazo) ya está probada al nivel SQL
// en customers-directory.itest.ts (PR1) — repetirla acá sería duplicar cobertura.
describe("escrituras del directorio (RPC de la migración)", () => {
  it("ensureForAuthUser devuelve { kind: 'ok', id } cuando no hay ficha previa", async () => {
    const r = await repo.ensureForAuthUser(U1, "  U1@Repo.cl ");
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect((await repo.getProfile(r.id))?.email).toBe("u1@repo.cl");
  });

  // Lo que el adaptador agrega sobre el SQL: el conflicto vuelve como VALOR.
  it("ensureForAuthUser devuelve email_conflict (no lanza) cuando el email es de otra ficha", async () => {
    await customer({ id: U1, email: "viejo@repo.cl", authUserId: U1 });
    await customer({ email: "tomado@repo.cl", name: "Ficha ajena" });

    expect(await repo.ensureForAuthUser(U1, "tomado@repo.cl")).toEqual({ kind: "email_conflict" });
    // La ficha del usuario queda intacta con su email viejo.
    expect((await repo.getProfile(U1))?.email).toBe("viejo@repo.cl");
  });

  // Lo que el adaptador agrega sobre el SQL: `raise exception '<literal>'` llega
  // como PostgrestError y sale como sentinela (nunca texto crudo de Postgres).
  it("updateContact relanza los literales de la RPC como sentinelas", async () => {
    const titular = await customer({ id: U1, email: "titular@repo.cl", authUserId: U1 });
    await expect(repo.updateContact(titular, { name: "X", email: "otro@repo.cl", phone: null })).rejects.toThrow(
      "customer_has_account",
    );

    const ficha = await customer({ email: "ficha@repo.cl", name: "Ficha" });
    await expect(repo.updateContact(ficha, { name: "X", email: "no-es-email", phone: null })).rejects.toThrow(
      "customer_email_invalid",
    );
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customer-repository.itest.ts -t "escrituras del directorio"`
Expected: FAIL — `repo.ensureForAuthUser is not a function`.

- [ ] **Step 3: Declare the two methods in the port.** In `src/application/ports/customers.ts`, inside `interface CustomerRepository`:

```ts
  /** Login → ficha (rpc `ensure_customer_for_user`). Un email tomado NO lanza: devuelve email_conflict. */
  ensureForAuthUser(userId: string, email: string): Promise<EnsureCustomerResult>;
  /** Edición de contacto (rpc `update_customer_contact`): propaga el snapshot y da retro. */
  updateContact(
    customerId: string,
    d: { name: string | null; email: string | null; phone: string | null },
  ): Promise<void>;
```

- [ ] **Step 4: Implement them in the adapter.** In `src/infrastructure/db/customer-repository.ts`: add `EnsureCustomerResult` to the type import from the port, add the domain import and a private error helper, then the two methods:

```ts
import { customerDbErrorCode, isEnsureEmailConflict } from "@/src/domain/customers/customer-input";
```

```ts
/**
 * Relanza el error de la DB con una SENTINELA estable como mensaje
 * (`email_taken`, `customer_has_account`, `customers_name_len`, …). La capa de
 * aplicación ramifica sobre ella y `customerDbErrorMessage` la traduce; nunca
 * viaja texto crudo de Postgres hacia un toast.
 */
function throwDbError(error: { code?: string | null; message: string }): never {
  const sentinel = customerDbErrorCode(error.code, null, error.message);
  throw new Error(sentinel === "unknown" ? error.message : sentinel);
}
```

```ts
  async ensureForAuthUser(userId: string, email: string): Promise<EnsureCustomerResult> {
    const { data, error } = await this.db.rpc("ensure_customer_for_user", { p_user: userId, p_email: email });
    if (error) {
      // El chequeo de email libre de la RPC no es serializable: una carrera
      // aflora como 23505 crudo en vez del literal. Misma condición.
      if (isEnsureEmailConflict(error)) return { kind: "email_conflict" };
      // Todo lo demás (incluido el 23505 de customers_auth_user_id_key) sale
      // como sentinela: por acá NO puede viajar texto crudo de Postgres.
      throwDbError(error);
    }
    return { kind: "ok", id: data as string };
  }

  async updateContact(
    customerId: string,
    d: { name: string | null; email: string | null; phone: string | null },
  ): Promise<void> {
    const { error } = await this.db.rpc("update_customer_contact", {
      p_customer: customerId,
      // El generador tipa los text params como `string`; la función SQL acepta
      // NULL (normaliza con nullif). El cast documenta el gap, no cambia runtime.
      p_name: d.name as unknown as string,
      p_email: d.email as unknown as string,
      p_phone: d.phone as unknown as string,
    });
    if (error) throwDbError(error);
  }
```

- [ ] **Step 5: Run the whole file and see it pass**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customer-repository.itest.ts`
Expected: PASS (three describes). Then **`npm run db:reset`**.

- [ ] **Step 6: Lint + types + unit suite**

Run: `npx tsc --noEmit && npx eslint . && npm test`
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
/opt/homebrew/bin/git add src/application/ports/customers.ts src/infrastructure/db/customer-repository.ts src/infrastructure/db/customer-repository.itest.ts
/opt/homebrew/bin/git commit -m "feat(customers): directory writes over the PR1 RPCs" -m "ensureForAuthUser returns email_conflict for both the raise-exception literal and the raw 23505 the non-serializable free-email check can produce; every other rejection is rethrown as a stable sentinel." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `CustomerService` — session → customer through `auth_user_id`

**Files:**
- Modify: `src/application/customers/customer-service.ts`
- Create: `src/application/customers/customer-service.test.ts`

**Interfaces:**
- Consumes: the port as of Task 5 — `ensureForAuthUser`, `awardRetroPoints`, `getProfile`, `findByAuthUser`, `updateContact`, `movements`, `bookingsForEmail`.
- Produces, used by Task 7:
  ```ts
  export type EnsureCustomerOutcome = { kind: "ok"; profile: CustomerProfile } | { kind: "email_conflict" };
  ensureCustomer(userId: string, email: string): Promise<EnsureCustomerOutcome>;
  profileByUser(userId: string): Promise<CustomerProfile | null>;
  movementsByUser(userId: string, limit?: number): Promise<PointsMovement[]>;   // default 50
  updateProfileByUser(userId: string, data: { name: string | null; phone: string | null }): Promise<void>;
  bookingsForEmail(email: string): Promise<CustomerBooking[]>;                  // unchanged
  bookings(email: string, nowIso?: string): Promise<{ upcoming: CustomerBooking[]; past: CustomerBooking[] }>; // unchanged
  ```
  The legacy `profile()`, `updateProfile()` and `movements()` stay for now as thin delegations marked `@deprecated`, so every current call site keeps compiling; Task 8 deletes them once the itest fixtures stop using the legacy port methods.

**Why a discriminated result and not a throw (spec, crítico #3):** the repo's `error.tsx` boundaries deliberately never render `error.message` (only `error.digest`), **and a layout is not caught by its own segment's boundary** — so a thrown email conflict in `app/cuenta/(panel)/layout.tsx` could only ever surface as a blank/global error page. The conflict must be a value.

- [ ] **Step 1: Write the failing test — create `src/application/customers/customer-service.test.ts`:**

```ts
import { describe, expect, it, vi } from "vitest";
import type { CustomerProfile, CustomerRepository } from "@/src/application/ports/customers";
import { CustomerService } from "./customer-service";

const ADOPTED: CustomerProfile = {
  id: "cust-adoptada",
  authUserId: "user-1",
  email: "ana@fotf.cl",
  name: "Ana",
  phone: "+56912345678",
  pointsBalance: 1999,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Fake del puerto: solo lo que el test necesita, con vi.fn() para las aserciones. */
function fakeRepo(over: Partial<CustomerRepository> = {}): CustomerRepository {
  return {
    ensureForAuthUser: vi.fn().mockResolvedValue({ kind: "ok", id: ADOPTED.id }),
    awardRetroPoints: vi.fn().mockResolvedValue(0),
    getProfile: vi.fn().mockResolvedValue(ADOPTED),
    findByAuthUser: vi.fn().mockResolvedValue(ADOPTED),
    updateContact: vi.fn().mockResolvedValue(undefined),
    movements: vi.fn().mockResolvedValue([]),
    bookingsForEmail: vi.fn().mockResolvedValue([]),
    ...over,
  } as unknown as CustomerRepository;
}

describe("CustomerService.ensureCustomer", () => {
  it("asegura la ficha, da retro con el id DEVUELTO y devuelve el perfil", async () => {
    const repo = fakeRepo();
    const r = await new CustomerService(repo).ensureCustomer("user-1", "Ana@FOTF.cl");

    expect(r).toEqual({ kind: "ok", profile: ADOPTED });
    expect(repo.ensureForAuthUser).toHaveBeenCalledWith("user-1", "ana@fotf.cl");
    // El retro va sobre la FICHA (id propio), nunca sobre el usuario de auth.
    expect(repo.awardRetroPoints).toHaveBeenCalledWith("cust-adoptada");
    expect(repo.getProfile).toHaveBeenCalledWith("cust-adoptada");
  });

  it("un conflicto de email es un valor, no una excepción, y no otorga puntos", async () => {
    const repo = fakeRepo({ ensureForAuthUser: vi.fn().mockResolvedValue({ kind: "email_conflict" }) });
    const r = await new CustomerService(repo).ensureCustomer("user-1", "ana@fotf.cl");

    expect(r).toEqual({ kind: "email_conflict" });
    expect(repo.awardRetroPoints).not.toHaveBeenCalled();
    expect(repo.getProfile).not.toHaveBeenCalled();
  });
});

describe("CustomerService: resolución por auth_user_id", () => {
  it("profileByUser y movementsByUser resuelven por la cuenta, no por el id", async () => {
    const repo = fakeRepo();
    const svc = new CustomerService(repo);

    expect(await svc.profileByUser("user-1")).toEqual(ADOPTED);
    await svc.movementsByUser("user-1", 200);

    expect(repo.findByAuthUser).toHaveBeenCalledWith("user-1");
    expect(repo.movements).toHaveBeenCalledWith("cust-adoptada", 200);
  });

  it("sin ficha, movementsByUser devuelve vacío en vez de consultar por el user id", async () => {
    const repo = fakeRepo({ findByAuthUser: vi.fn().mockResolvedValue(null) });
    const svc = new CustomerService(repo);

    expect(await svc.profileByUser("user-1")).toBeNull();
    expect(await svc.movementsByUser("user-1")).toEqual([]);
    expect(repo.movements).not.toHaveBeenCalled();
  });

  it("updateProfileByUser reenvía el email ACTUAL (nunca lo cambia)", async () => {
    const repo = fakeRepo();
    await new CustomerService(repo).updateProfileByUser("user-1", { name: "Ana Silva", phone: "+56999999999" });

    expect(repo.updateContact).toHaveBeenCalledWith("cust-adoptada", {
      name: "Ana Silva",
      email: "ana@fotf.cl", // así update_customer_contact nunca ve un cambio de email de titular
      phone: "+56999999999",
    });
  });

  it("updateProfileByUser sin ficha lanza el sentinela traducible", async () => {
    const repo = fakeRepo({ findByAuthUser: vi.fn().mockResolvedValue(null) });
    await expect(
      new CustomerService(repo).updateProfileByUser("user-1", { name: "Ana", phone: null }),
    ).rejects.toThrow("El cliente ya no existe. Vuelve a seleccionarlo.");
  });

  it("traduce un sentinela de la DB a una frase antes de que llegue al toast", async () => {
    const repo = fakeRepo({ updateContact: vi.fn().mockRejectedValue(new Error("customers_name_len")) });
    await expect(
      new CustomerService(repo).updateProfileByUser("user-1", { name: "x".repeat(81), phone: null }),
    ).rejects.toThrow("El nombre no puede superar los 80 caracteres.");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/application/customers/customer-service.test.ts`
Expected: FAIL — `repo.ensureForAuthUser is not a function` / `svc.profileByUser is not a function` (the service still calls `upsertCustomer`).

- [ ] **Step 3: Rewrite the service.** Replace the body of `src/application/customers/customer-service.ts` (keep `bookingsForEmail` and `bookings` exactly as they are today):

```ts
import type {
  CustomerBooking,
  CustomerProfile,
  CustomerRepository,
  PointsMovement,
} from "@/src/application/ports/customers";
import { customerDbErrorMessage } from "@/src/domain/customers/customer-input";

/** Resultado de asegurar la ficha del titular de la sesión. */
export type EnsureCustomerOutcome = { kind: "ok"; profile: CustomerProfile } | { kind: "email_conflict" };

/** Traduce la sentinela del adaptador a una frase; deja pasar lo desconocido. */
function legible(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  return new Error(customerDbErrorMessage(null, null, msg) ?? msg);
}

/**
 * Cuenta del cliente: perfil, puntos y reservas. Toda consulta se hace con
 * valores derivados de la sesión verificada (userId/email) — nunca con input
 * del cliente — porque el service-role bypasea RLS.
 *
 * La ficha se resuelve SIEMPRE por `auth_user_id`: desde el directorio,
 * `customers.id` ya no es `auth.users.id` (una ficha adoptada conserva su id).
 */
export class CustomerService {
  constructor(private readonly repo: CustomerRepository) {}

  /**
   * Punto de entrada de cada visita autenticada (/cuenta y /reservar): asegura
   * la ficha y otorga los puntos retroactivos del historial. Idempotente.
   * Un email que ya es de otra ficha vuelve como VALOR (`email_conflict`): los
   * error.tsx del repo jamás muestran `error.message` y un layout no lo captura
   * su propio boundary, así que un throw nunca llegaría con copy legible.
   */
  async ensureCustomer(userId: string, email: string): Promise<EnsureCustomerOutcome> {
    const ensured = await this.repo.ensureForAuthUser(userId, email.trim().toLowerCase());
    if (ensured.kind !== "ok") return { kind: "email_conflict" };
    await this.repo.awardRetroPoints(ensured.id);
    const profile = await this.repo.getProfile(ensured.id);
    // Inalcanzable salvo borrado concurrente (no hay flujo de borrado de fichas).
    if (!profile) throw legible(new Error("customer_not_found"));
    return { kind: "ok", profile };
  }

  profileByUser(userId: string): Promise<CustomerProfile | null> {
    return this.repo.findByAuthUser(userId);
  }

  async movementsByUser(userId: string, limit = 50): Promise<PointsMovement[]> {
    const profile = await this.repo.findByAuthUser(userId);
    return profile ? this.repo.movements(profile.id, limit) : [];
  }

  /**
   * Edición desde /cuenta/perfil. Pasa por `update_customer_contact` — el MISMO
   * camino que el admin — así los dos escritores nunca derivan y el snapshot de
   * la próxima reserva (el que el staff usa para WhatsApp) se actualiza solo.
   * Reenvía el email ACTUAL: la función rechaza cambiarlo para un titular.
   *
   * OJO: la LECTURA va dentro del try. Si `findByAuthUser` falla, su mensaje es
   * texto crudo de Postgres y `run()` lo mostraría tal cual en el toast del
   * perfil; adentro pasa por `legible` como cualquier otro fallo.
   */
  async updateProfileByUser(userId: string, data: { name: string | null; phone: string | null }): Promise<void> {
    try {
      const profile = await this.repo.findByAuthUser(userId);
      if (!profile) throw new Error("customer_not_found");
      await this.repo.updateContact(profile.id, { name: data.name, email: profile.email, phone: data.phone });
    } catch (e) {
      throw legible(e);
    }
  }

  /** @deprecated PR2: usa profileByUser. Se elimina al soltar los métodos legacy del puerto. */
  profile(userId: string): Promise<CustomerProfile | null> {
    return this.repo.getProfile(userId);
  }

  /** @deprecated PR2: usa updateProfileByUser. */
  updateProfile(userId: string, data: { name: string | null; phone: string | null }): Promise<void> {
    return this.repo.updateProfile(userId, data);
  }

  /** @deprecated PR2: usa movementsByUser. */
  movements(userId: string, limit = 50): Promise<PointsMovement[]> {
    return this.repo.movements(userId, limit);
  }

  bookingsForEmail(email: string): Promise<CustomerBooking[]> {
    return this.repo.bookingsForEmail(email.toLowerCase());
  }

  /** Reservas partidas en próximas (vigentes, ascendente) y pasadas/terminadas. */
  async bookings(
    email: string,
    nowIso = new Date().toISOString(),
  ): Promise<{ upcoming: CustomerBooking[]; past: CustomerBooking[] }> {
    const all = await this.bookingsForEmail(email);
    const now = new Date(nowIso).getTime();
    const upcoming = all
      .filter((b) => new Date(b.startsAt).getTime() >= now && (b.status === "held" || b.status === "confirmed"))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const upcomingIds = new Set(upcoming.map((b) => b.id));
    return { upcoming, past: all.filter((b) => !upcomingIds.has(b.id)) };
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/application/customers/customer-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the rest still builds and the existing call sites still compile**

Run: `npx tsc --noEmit && npx eslint . && npm test`
Expected: all exit 0. `ensureCustomer` now returns a value that the four current call sites simply ignore (`await svc.ensureCustomer(...)`), and the deprecated methods keep `page.tsx`/`perfil` compiling until Task 7.

- [ ] **Step 6: Commit**

```bash
/opt/homebrew/bin/git add src/application/customers
/opt/homebrew/bin/git commit -m "feat(customers): resolve the session customer through auth_user_id" -m "ensureCustomer returns a discriminated result: the error.tsx boundaries never render error.message and a layout is not caught by its own boundary, so an email conflict must be a value, not a throw." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The eight session call sites

**Files:**
- Modify: `app/auth/callback/route.ts:36-41`
- Modify: `app/cuenta/(panel)/layout.tsx:16-25`
- Create: `app/cuenta/(panel)/_components/EmailConflict.tsx`
- Modify: `app/cuenta/(panel)/page.tsx:18-26`
- Modify: `app/cuenta/(panel)/perfil/page.tsx:15-17`
- Modify: `app/cuenta/(panel)/perfil/actions.ts:9-19`
- Verify only (must keep working, no edit): `app/cuenta/(panel)/reservas/page.tsx:23`
- Modify: `app/reservar/page.tsx:31-39` (the body of `if (session) { … }`; line 29 is the `const session` binding and line 30 the `if` — do not touch either)
- Modify: `app/api/bookings/route.ts:62-73` (the points block inside the `try`; the `createBooking(...)` call at 75–86 keeps passing `customer`/`customerId` unchanged)

**Interfaces:**
- Consumes: `EnsureCustomerOutcome`, `ensureCustomer`, `profileByUser`, `movementsByUser`, `updateProfileByUser` (Task 6); `normalizeEmail`, `normalizePhone` (Task 1); `EmptyState` (`components/admin/ui/EmptyState`), `btn` (`components/admin/ui/styles`), `WhatsAppCta` (`components/WhatsAppCta`).
- Produces: no new exported API — this task is the behavioural payload. Task 8 depends on it only in that the deprecated service/port methods stop having app callers.

- [ ] **Step 1: `app/auth/callback/route.ts` — keep the best-effort catch, log the conflict.** Replace lines 36–41 with:

```ts
  const user = exchanged?.user;
  if (accountEnabled() && user?.email) {
    const ensured = await customerService()
      .ensureCustomer(user.id, user.email)
      .catch((e) => {
        console.error("[auth-callback:customer]", e);
        return null;
      });
    // El login NUNCA falla por esto: el layout de /cuenta muestra el estado.
    if (ensured?.kind === "email_conflict") console.warn("[auth-callback:customer] email_conflict", user.id);
  }
```

- [ ] **Step 2: Create the conflict screen — `app/cuenta/(panel)/_components/EmailConflict.tsx`:**

```tsx
import Link from "next/link";
import WhatsAppCta from "@/components/WhatsAppCta";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/**
 * Tu correo ya está en OTRA ficha del directorio, así que no pudimos vincularlo
 * a esta sesión. Ojo con la copia: `customer_email_owned_by_other_user` también
 * salta cuando la ficha dueña del email es un invitado sin cuenta o en la
 * carrera por PK — prometer "otra cuenta" sería falso. Fusionar es manual.
 */
export default function EmailConflict() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-20">
      <EmptyState
        icon="user"
        title="No pudimos abrir tu cuenta"
        hint="Tu correo ya está registrado en otro cliente nuestro, así que no pudimos vincularlo a esta sesión. Escríbenos y lo unificamos."
        action={
          <WhatsAppCta
            source="cuenta-email-conflict"
            waMessage="Hola, no puedo entrar a mi cuenta: dice que mi correo ya está registrado."
            className={btn("primary", "md")}
          >
            Escríbenos por WhatsApp
          </WhatsAppCta>
        }
      />
      <Link href="/" className="label-sm mt-8 text-center text-bone-mute transition-colors hover:text-gold">
        ← Volver al inicio
      </Link>
    </main>
  );
}
```

(`btn(variant: BtnVariant = "primary", size: BtnSize = "md")` lives in `components/admin/ui/styles.ts`; `"primary"` and `"md"` are valid.)

- [ ] **Step 3: `app/cuenta/(panel)/layout.tsx` — render the conflict instead of mounting the shell.** Replace lines 16–25 with:

```tsx
export default async function CuentaLayout({ children }: { children: ReactNode }) {
  if (!accountEnabled()) notFound();
  const session = await requireCustomer();

  // Un conflicto de email NO es una excepción: los error.tsx solo muestran el
  // digest y un layout no lo captura su propio boundary.
  const ensured = await customerService().ensureCustomer(session.userId, session.email);
  if (ensured.kind !== "ok") return <EmailConflict />;

  return <CuentaShell balance={ensured.profile.pointsBalance}>{children}</CuentaShell>;
}
```

and add the import (and drop nothing else):

```tsx
import EmailConflict from "./_components/EmailConflict";
```

- [ ] **Step 4: `app/cuenta/(panel)/page.tsx` — resolve by user.** Replace lines 20–24 with:

```tsx
  const svc = customerService();
  const [profile, movements] = await Promise.all([
    svc.profileByUser(session.userId),
    svc.movementsByUser(session.userId, 200),
  ]);
```

- [ ] **Step 5: `app/cuenta/(panel)/perfil/page.tsx` — resolve by user.** Replace line 17 with:

```tsx
  const profile = await customerService().profileByUser(session.userId);
```

- [ ] **Step 6: `app/cuenta/(panel)/perfil/actions.ts` — write through `update_customer_contact`.** Replace line 16 with:

```ts
    await customerService().updateProfileByUser(session.userId, data);
```

(No other change: `validateProfile` still normalizes, `run()` still wraps, and the service now translates any DB sentinel into a full sentence before it reaches the toast.)

- [ ] **Step 7: `app/reservar/page.tsx` — use the returned profile.** Replace lines **31–39** — the body of `if (session) { … }`: `const svc = customerService();` through the closing `};` of the `customer = { … }` assignment. **Line 29 (`const session = await currentCustomer();`) and line 30 (`if (session) {`) stay exactly as they are** — replacing from 29 would delete the binding and unbalance the braces. Lines 40 (`}`) and 41 (`}`) also stay. New body:

```tsx
      // La ficha puede tener id ≠ session.userId (adoptada del directorio):
      // se usa el perfil que devuelve ensureCustomer, no una segunda consulta
      // por el id del usuario (devolvería null y el widget mostraría 0 pts).
      const ensured = await customerService().ensureCustomer(session.userId, session.email);
      if (ensured.kind === "ok") {
        customer = {
          email: ensured.profile.email ?? session.email,
          name: ensured.profile.name ?? "",
          phone: ensured.profile.phone ?? "",
          points: ensured.profile.pointsBalance,
        };
      }
      // Con email_conflict el widget sigue como invitado: un conflicto de
      // directorio no puede impedir que alguien reserve.
```

- [ ] **Step 8: `app/api/bookings/route.ts` — normalize the body and redeem with the ficha id.** Replace lines 62–73 with:

```ts
    // Normalización de dominio: el email válido se guarda canónico (minúsculas)
    // y el teléfono en "+dígitos"; un email inválido NO bloquea la reserva (se
    // guarda tal como se tipeó y la reserva queda sin vincular, como hoy).
    const points = typeof b.pointsToRedeem === "number" ? Math.floor(b.pointsToRedeem) : 0;
    let customer: { name?: string; email?: string; phone?: string } = {
      name: b.customer.name?.trim().slice(0, 80) || undefined,
      email: normalizeEmail(b.customer.email) ?? b.customer.email.trim().slice(0, 120),
      phone: b.customer.phone ? (normalizePhone(b.customer.phone) ?? b.customer.phone.trim().slice(0, 40)) : undefined,
    };
    let customerId: string | undefined;

    // Canje de puntos: la identidad es SOLO la sesión (cookie verificada) — el
    // email del body se sobreescribe y el saldo lo valida el row lock en la DB.
    if (points > 0) {
      const session = await currentCustomer();
      if (!session) return Response.json({ error: "points_session" }, { status: 401 });
      const ensured = await customerService(client).ensureCustomer(session.userId, session.email);
      if (ensured.kind !== "ok") return Response.json({ error: "points_session" }, { status: 401 });
      // El canje va contra la FICHA, nunca contra el usuario de auth: una ficha
      // adoptada del directorio tiene id ≠ session.userId y el row lock del
      // canje (p_customer_id) se toma sobre ella.
      customer = { ...customer, email: ensured.profile.email ?? session.email };
      customerId = ensured.profile.id;
    }
```

and add the import at the top of the file:

```ts
import { normalizeEmail, normalizePhone } from "@/src/domain/contact/contact";
```

- [ ] **Step 9: Verify the eighth call site needs no change.**

Run: `grep -n "customerService" "app/cuenta/(panel)/reservas/page.tsx"`
Expected: exactly two lines — `12:import { customerService } from "@/src/composition";` and `23:  const { upcoming, past } = await customerService().bookings(session.email);`. `bookings`/`bookingsForEmail` are unchanged in PR2, so this page keeps working. Do not edit it.

- [ ] **Step 10: Confirm no app code calls the deprecated methods any more**

Run: `grep -rn "\.profile(\|\.updateProfile(\|\.movements(" app | grep -v node_modules`
Expected: **no output**. (Matches inside `src/` are the port/adapter/itests — Task 8 handles those.)

- [ ] **Step 11: Types, lint, unit tests, build**

Run: `npx tsc --noEmit && npx eslint . && npm test && npm run build`
Expected: all exit 0.

- [ ] **Step 12: Smoke it locally** (CLAUDE.md: restart dev after a build)

```bash
npm run db:reset
npm run dev
```

Check, with the local stack up: `/cuenta` login as `felipe.munoz@outlook.cl` (magic link in Mailpit, `http://127.0.0.1:54424`) shows his 4.498 pts chip; `/cuenta/perfil` saves a new phone with the toast "Perfil actualizado"; then

```bash
docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
  "select c.id, c.auth_user_id, c.phone, r.customer_phone from customers c
     join reservations r on r.customer_id = c.id
    where c.email = 'felipe.munoz@outlook.cl' limit 3;"
```

Expected: `id = auth_user_id`, and the reservation snapshot carries the **new** phone (the snapshot invariant, propagated by `update_customer_contact`). `/reservar` while logged in shows his points; a guest checkout still creates a hold.

- [ ] **Step 13: Commit**

```bash
/opt/homebrew/bin/git add "app/auth/callback/route.ts" "app/cuenta/(panel)" "app/reservar/page.tsx" "app/api/bookings/route.ts"
/opt/homebrew/bin/git commit -m "feat(cuenta): resolve the session customer by auth_user_id at every call site" -m "/cuenta renders an email-conflict screen instead of throwing (the error boundaries never show error.message), and /api/bookings redeems with the customer id returned by ensureCustomer, never the auth user id." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Integration fixtures for the new identity model, and drop the legacy methods

**Files:**
- Modify: `src/infrastructure/db/points.itest.ts:130` (fixture gains `auth_user_id`), `:70-79` (the `book` helper takes an explicit `customerId`), `:371-399` (retro test), `:410-426` (ownership test), plus a new describe with three cases (two adoption + the redemption for `id ≠ auth id`)
- Modify: `src/infrastructure/db/reschedule.itest.ts:423` and `:463` (`on conflict (id)` → `on conflict (email)`)
- Modify: `src/application/ports/customers.ts` (delete `upsertCustomer` and `updateProfile`)
- Modify: `src/infrastructure/db/customer-repository.ts` (delete both implementations)
- Modify: `src/application/customers/customer-service.ts` (delete the three `@deprecated` methods)

**Interfaces:**
- Consumes: `CustomerService.ensureCustomer` → `EnsureCustomerOutcome` (Task 6); `repo.updateContact` (Task 5).
- Produces: a port with exactly one write path for contact data (`updateContact` → `update_customer_contact`), so the snapshot invariant cannot be bypassed; the application-level proof that a legacy row is **adopted, not duplicated**; and the proof that a **redemption for a ficha whose id ≠ the auth user id** lands on the ficha (the spec's PR2 test list requires this one).

**On the TDD cycle here:** Tasks 6 and 7 already made the behaviour correct, so these cases are **regression tests against `main`'s model**, not red-first tests — they lock it in at the application level (service → adapter → RPC), which is exactly what the PR1 review asked for. The red step is therefore a **mutation check** (Step 3 for the adoption cases, Step 5 for the redemption case): re-introduce the old assumption in one line and watch the case fail.

- [ ] **Step 1: Write the tests — in `src/infrastructure/db/points.itest.ts`, append a new describe after the "retro al crear la cuenta" block:**

```ts
describe("identidad: la ficha se resuelve por auth_user_id", () => {
  it("adopta la fila legacy (id = usuario, auth_user_id null) sin duplicar", async () => {
    // Lo que dejaba el upsert-por-id vivo hasta este PR.
    await pg.query("delete from customers where id=$1", [CUST_ID]);
    await pg.query("insert into customers (id, email) values ($1, $2)", [CUST_ID, CUST_EMAIL]);

    const r = await customers.ensureCustomer(CUST_ID, CUST_EMAIL);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.profile.id).toBe(CUST_ID);
    expect(r.profile.authUserId).toBe(CUST_ID);

    const n = await pg.query<{ n: string }>("select count(*)::text n from customers where email=$1", [CUST_EMAIL]);
    expect(Number(n.rows[0].n)).toBe(1); // adoptada, no duplicada
  });

  it("adopta una ficha del directorio con id propio y le resuelve saldo y movimientos", async () => {
    await pg.query("delete from customers where id=$1", [CUST_ID]);
    const other = (
      await pg.query<{ id: string }>("insert into customers (email, name) values ($1, 'Del backfill') returning id", [
        CUST_EMAIL,
      ])
    ).rows[0].id;
    expect(other).not.toBe(CUST_ID);
    await seedPoints(300, other);

    const r = await customers.ensureCustomer(CUST_ID, CUST_EMAIL);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.profile.id).toBe(other); // conserva su id
    expect(r.profile.pointsBalance).toBe(300);

    // Con el modelo viejo (id = auth id) esto habría devuelto null / 0 pts.
    expect((await customers.profileByUser(CUST_ID))?.id).toBe(other);
    expect(await customers.movementsByUser(CUST_ID, 50)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them and see them pass**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/points.itest.ts -t "identidad"`
Expected: PASS (both cases). If either fails, the bug is in Task 5's adapter or Task 6's service — fix there, not in the test.

- [ ] **Step 3: Mutation check — prove the tests are load-bearing.** Temporarily change `profileByUser` in `src/application/customers/customer-service.ts` back to the old assumption:

```ts
  profileByUser(userId: string): Promise<CustomerProfile | null> {
    return this.repo.getProfile(userId); // MUTACIÓN TEMPORAL: id = auth id
  }
```

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/points.itest.ts -t "adopta una ficha del directorio"`
Expected: FAIL — `expected undefined to be '<other id>'` (the adopted ficha is invisible under the old model, exactly the regression these tests exist for). **Revert the mutation** (`git checkout -- src/application/customers/customer-service.ts`) and re-run to confirm PASS.

- [ ] **Step 4: The redemption case for a customer whose id ≠ the auth user id.** This is the test for the riskiest line of the PR — Task 7 Step 8 made `/api/bookings` redeem with `ensured.profile.id` instead of `session.userId` — and the spec's PR2 test list requires it explicitly ("canje para un cliente con `id ≠ auth id`", §"Pruebas"). Two parts.

**(a) Let the `book` helper take an explicit customer.** Replace `points.itest.ts:70-79` with:

```ts
const book = (start: number, opts: { email?: string; points?: number; customerId?: string } = {}) =>
  checkout.createBooking({
    resourceId,
    date: MON,
    startMinute: start,
    durationHours: 1,
    customer: { email: opts.email ?? CUST_EMAIL },
    // Por defecto el canje va sobre CUST_ID (id = usuario auth), que es lo que
    // asumían los casos viejos; `customerId` permite canjear sobre una ficha
    // ADOPTADA, que es lo que hace /api/bookings desde este PR.
    customerId: opts.customerId ?? (opts.points ? CUST_ID : undefined),
    pointsToRedeem: opts.points ?? 0,
  });
```

**(b) Append the case to the `describe("identidad: …")` block from Step 1:**

```ts
  it("canje: el redeem cae en la ficha adoptada (id ≠ auth id), no en el usuario de auth", async () => {
    // Ficha del directorio con id PROPIO y saldo, como la dejará el backfill de PR3.
    await pg.query("delete from customers where id=$1", [CUST_ID]);
    const other = (
      await pg.query<{ id: string }>("insert into customers (email, name) values ($1, 'Del backfill') returning id", [
        CUST_EMAIL,
      ])
    ).rows[0].id;
    expect(other).not.toBe(CUST_ID);
    await seedPoints(HOUR_PRICE, other);

    // El login la adopta: conserva su id y queda vinculada a la cuenta.
    const ensured = await customers.ensureCustomer(CUST_ID, CUST_EMAIL);
    expect(ensured.kind).toBe("ok");
    if (ensured.kind !== "ok") return;
    expect(ensured.profile.id).toBe(other);

    // Lo que hace /api/bookings desde Task 7: canjea con el id del PERFIL.
    const b = await book(600, { points: HOUR_PRICE, customerId: ensured.profile.id });
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    const redeem = await pg.query<{ customer_id: string; amount: number }>(
      "select customer_id, amount from points_ledger where order_id=$1 and kind='redeem'",
      [b.value.orderId],
    );
    expect(redeem.rows).toHaveLength(1);
    expect(redeem.rows[0].customer_id).toBe(other); // la ficha adoptada
    expect(redeem.rows[0].amount).toBe(-HOUR_PRICE);
    // Nada quedó a nombre del usuario de auth (que ya no tiene ficha propia).
    expect((await pg.query("select 1 from points_ledger where customer_id=$1", [CUST_ID])).rowCount).toBe(0);
    expect(await balance(other)).toBe(0);
    await expectBalanceConsistent(other);
  });
```

- [ ] **Step 5: Run it green, then prove it is load-bearing (mutation).**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/points.itest.ts -t "el redeem cae en la ficha adoptada"`
Expected: PASS.

Then temporarily swap the redemption to the **old** assumption — `const b = await book(600, { points: HOUR_PRICE, customerId: CUST_ID });` (the auth user id, which is what `/api/bookings` used before Task 7) — and re-run.
Expected: FAIL — the adopted ficha owns the points and `CUST_ID` no longer has a row of its own, so `create_checkout`'s `select points_balance … where id = p_customer_id for update` finds nothing, raises `points_without_customer`, and `checkout-service.ts:124` maps it to `err("points_session")`: `expect(b.ok).toBe(true)` fails and no `redeem` row is written. That is precisely the bug Task 7 Step 8 removed from `/api/bookings`. **Revert the mutation** (`/opt/homebrew/bin/git checkout -- src/infrastructure/db/points.itest.ts` would also drop parts (a)/(b) — just undo that one line by hand) and re-run to confirm PASS. Then **`npm run db:reset`**.

- [ ] **Step 6: Update the `points.itest.ts` fixture (line 130)** so the two demo customers are real account holders (without `auth_user_id` they are directory fichas, so any `*ByUser` call in this file would not resolve them):

```ts
  await pg.query("insert into customers (id, email, auth_user_id) values ($1, $2, $1), ($3, $4, $3)", [
    CUST_ID,
    CUST_EMAIL,
    OTHER_ID,
    OTHER_EMAIL,
  ]);
```

- [ ] **Step 7: Update the retro test (lines 384–398)** to use the id `ensureCustomer` returns instead of assuming `CUST_ID`:

```ts
    const first = await customers.ensureCustomer(CUST_ID, CUST_EMAIL);
    expect(first.kind).toBe("ok");
    if (first.kind !== "ok") return;
    const cid = first.profile.id;
    expect(cid).toBe(CUST_ID); // sin ficha previa, ensure crea con id = usuario
    // 999 + 500 + floor(0.05·14000)=700; la cancelada no suma.
    expect(await balance(cid)).toBe(999 + 500 + 700);

    await customers.ensureCustomer(CUST_ID, CUST_EMAIL); // idempotente
    expect(await balance(cid)).toBe(2199);

    // Una orden nueva ganada EN VIVO no se re-otorga al correr retro de nuevo.
    const b = await book(600);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    await payWebhook(b.value.orderId, "pay9", HOUR_PRICE);
    await customers.ensureCustomer(CUST_ID, CUST_EMAIL);
    expect(await balance(cid)).toBe(2199 + computeEarn(HOUR_PRICE));
    await expectBalanceConsistent(cid);
```

- [ ] **Step 8: Update the ownership test (line 423)** to write contact data through the only remaining path:

```ts
    // La edición pasa por update_customer_contact (mismo camino que el admin):
    // reenvía el email actual, así el titular no cambia su acceso.
    await repo.updateContact(CUST_ID, { name: "Cliente A", email: CUST_EMAIL, phone: null });
    const other = await repo.getProfile(OTHER_ID);
    expect(other?.name).toBeNull(); // el update de A no tocó a B
```

- [ ] **Step 9: Update `reschedule.itest.ts` lines 423 and 463.** Both currently read:

```ts
    await pg.query("insert into customers (id, email) values ($1,$2) on conflict (id) do nothing", [EARN_CUST_ID, EARN_EMAIL]);
```

Replace both with:

```ts
    // El id ya no es la clave natural de una ficha: el conflicto que importa es
    // el email (customers_email_key), que `on conflict (id)` dejaría escapar como 23505.
    await pg.query("insert into customers (id, email, auth_user_id) values ($1,$2,$1) on conflict (email) do nothing", [EARN_CUST_ID, EARN_EMAIL]);
```

- [ ] **Step 10: Run both files and see them pass**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/points.itest.ts src/infrastructure/db/reschedule.itest.ts`
Expected: PASS. Then **`npm run db:reset`**.

- [ ] **Step 11: Drop the legacy methods now that nothing calls them.**

In `src/application/ports/customers.ts`, delete these two members of `CustomerRepository`:

```ts
  /** Crea/actualiza el perfil (id = auth user, email en minúsculas). Idempotente. */
  upsertCustomer(id: string, email: string): Promise<void>;
```
```ts
  updateProfile(id: string, data: { name: string | null; phone: string | null }): Promise<void>;
```

In `src/infrastructure/db/customer-repository.ts`, delete `upsertCustomer` (lines 15–18) and `updateProfile` (lines 37–43).

In `src/application/customers/customer-service.ts`, delete the three `@deprecated` methods (`profile`, `updateProfile`, `movements`).

- [ ] **Step 12: Prove nothing referenced them**

Run:

```bash
grep -rn "upsertCustomer\|updateProfile" app src lib components | grep -v "updateProfileAction\|updateProfileByUser"
```

Expected: **no output**. The exclusions are load-bearing: `updateProfileAction` (`app/cuenta/(panel)/perfil/actions.ts`) and `updateProfileByUser` (the service method Task 6 added) both **survive** this PR and both contain the substring `updateProfile`, so the bare grep can never come back empty.
Run: `npx tsc --noEmit && npx eslint . && npm test`
Expected: all exit 0.

- [ ] **Step 13: Full integration run from a clean seed**

Run: `npm run db:reset && npm run test:integration`
Expected: all green (MP-gated specs self-skip without `MP_ACCESS_TOKEN`). Then **`npm run db:reset`** again — never leave the DB seed-less.

- [ ] **Step 14: Commit**

```bash
/opt/homebrew/bin/git add src/infrastructure/db/points.itest.ts src/infrastructure/db/reschedule.itest.ts src/application/ports/customers.ts src/infrastructure/db/customer-repository.ts src/application/customers/customer-service.ts
/opt/homebrew/bin/git commit -m "test(customers): itest fixtures for the identity model; drop the legacy upsert path" -m "Adds application-level cases proving a legacy row (id = auth user, auth_user_id null) is adopted rather than duplicated, that a directory ficha with its own id resolves balance and movements, and that a points redemption for such a ficha lands on the adopted customer instead of the auth user id." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Full verification and PR body (do NOT push)

**Files:** none new; writes `/tmp/directorio-pr2-body.md` (scratch).

**Interfaces:**
- Consumes: everything committed in Tasks 0–8 on `feat/directorio-clientes-identidad`.
- Produces: a verified branch and a ready PR body. **The push and `gh pr create` happen only after a whole-branch review** — this task stops before them.

- [ ] **Step 1: Lint, unit tests, types, build**

Run: `npx eslint . && npm test && npm run build`
Expected: all exit 0. `npm run build` type-checks the itests too (`tsconfig.json` includes `**/*.ts`).

- [ ] **Step 2: Prove there is no schema change in this PR**

Run:
```bash
/opt/homebrew/bin/git diff --stat main -- supabase/ src/infrastructure/db/database.types.ts
```
Expected: **no output**. PR2 adds no migration, no seed change and no regenerated types; if either shows up, it does not belong in this PR. (Do **not** run `npm run db:types` to "check" — it is unnecessary here and a stray diff would fail CI's sync step.)

- [ ] **Step 3: Integration from a clean seed, then restore the seed**

Run: `npm run db:reset && npm run test:integration && npm run db:reset`
Expected: all green, and the seed back in place afterwards.

- [ ] **Step 4: Manual smoke (local only), then restart dev**

```bash
npm run dev
```

SQL checks run inside the DB container (**`psql` is not installed on this machine**):

```bash
docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
  "select id, auth_user_id from customers where email='felipe.munoz@outlook.cl';"
docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
  "select customer_email from orders order by created_at desc limit 1;"
```

- `/cuenta` login as `felipe.munoz@outlook.cl` (Mailpit at `http://127.0.0.1:54424`): the panel loads with his balance; the first query still returns `…00a3 / …00a3` (nothing re-created).
- `/cuenta/perfil`: change the phone → toast "Perfil actualizado" → the snapshot of his upcoming reservation carries the new phone.
- `/reservar` while logged in: the widget shows his points; a guest checkout with a **mixed-case** email still creates a hold, and the second query now shows that email lowercase.
- `/admin/reservas` and `/admin/reservas/nueva` (cash) still work — PR2 does not touch the admin console.

- [ ] **Step 5: Write the PR body** to `/tmp/directorio-pr2-body.md`:

````markdown
## Qué

PR2 de la cadena "Directorio de clientes" — **solo código, sin migración**. La app deja de asumir
que `customers.id` es `auth.users.id` y pasa a resolver la ficha por `auth_user_id` sobre las RPC
que PR1 ya dejó vivas. Spec: `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` ·
Plan: `docs/superpowers/plans/2026-09-09-directorio-clientes-pr2-identidad.md`.

- **`src/domain/contact/contact.ts`** (+test): único hogar de `EMAIL_RE`/`EMAIL_MAX`,
  `normalizeEmail`, `normalizePhone`, `phoneDigits` y `normalizePhoneCl` (se mudó desde
  `lib/whatsapp.ts`, que lo re-exporta). Se re-apuntan `applications/application.ts`,
  `course/lead.ts` y `lib/profile.ts`; sus tests pasan **sin tocarlos**. `normalizePhone` gana la
  forma canónica chilena (`962803298` → `+56962803298`), que es justo la que `waLink` acepta;
  `validateProfile` conserva su semántica permisiva (guarda el teléfono tal como se tipeó) y solo
  delega el rango de dígitos.
- **`src/domain/customers/customer-input.ts`** (+test): `CUSTOMER_CAPS`, `parseCustomerInput`
  (Result con frases completas), `customerSearchNeedle` (reusa `escapeIlike`), `customerLabel`,
  `customerDbErrorCode`/`customerDbErrorMessage` (23505/23514 + los once literales de las RPC de
  PR1 → castellano de Chile) e `isEnsureEmailConflict`.
- **Puerto y adaptador**: `CustomerProfile` gana `authUserId` y `createdAt` y aparece
  `EnsureCustomerResult`; el repositorio suma **exactamente cuatro** métodos sobre las RPC y
  tablas de PR1: `ensureForAuthUser`, `findByAuthUser`, `updateContact` y
  `bookingsForCustomer`. Se eliminan `upsertCustomer` y `updateProfile`: la única escritura de
  contacto es `update_customer_contact`, que propaga el snapshot. **Los métodos del directorio
  que no tienen consumidor en este PR viajan con su PR:** `create`/`findByEmail` en PR5,
  `search`/`list` (con `CustomerHit`/`CustomerListQuery`) en PR6, `assignToBooking` en PR7.
- **`CustomerService`**: `ensureCustomer` devuelve un resultado discriminado
  (`ok` | `email_conflict`) y `profileByUser`/`movementsByUser`/`updateProfileByUser` resuelven por
  `auth_user_id`.
- **Los ocho call sites**: `/cuenta` renderiza una pantalla de conflicto de email en vez de lanzar,
  `/reservar` usa el perfil devuelto (una ficha adoptada tiene id ≠ usuario) y `/api/bookings`
  canjea con `profile.id`, nunca con `session.userId`, además de normalizar el `customer` del body.
- **Itests**: nuevo `customer-repository.itest.ts`, acotado a lo que agrega el **adaptador**
  (mapeo de columnas, `EnsureCustomerResult` como valor, traducción de rechazos a sentinelas y
  el OR de `bookingsForCustomer`) — la semántica SQL ya la prueba `customers-directory.itest.ts`
  de PR1 y no se repite. `points.itest.ts` gana los casos de adopción (fila legacy y ficha del
  directorio con id propio) **y el canje sobre una ficha con `id ≠ auth id`**;
  `reschedule.itest.ts` cambia el `on conflict` al email.

## Cambios de comportamiento

Consolidar cuatro copias de `normalizePhone` y mandar `/cuenta/perfil` por
`update_customer_contact` no es un refactor neutro. Todo esto es intencional:

1. `"56962803298"` tipeado sin `+` ahora queda `"+56962803298"`.
2. Cualquier número de 9 dígitos que parte en `9` ahora gana `+56` — incluido un extranjero que
   tenga esa forma. En este negocio, un 9 dígitos pelado es un móvil chileno.
3. `"0012345678"` ahora queda `"12345678"` (se saca el 00 internacional). El `00` se saca **solo**
   si lo que queda sigue siendo un teléfono de 8–15 dígitos, así que `"00123456"` sigue
   devolviendo `"00123456"` y ninguna postulación de /unete o /curso-dj que hoy entra empieza a
   rebotar (hay test).
4. El formulario de perfil ahora **rechaza** teléfonos de 16 a 20 dígitos: el allow-list acepta
   6–20 caracteres, pero E.164 tope en 15 dígitos, así que esos no son números reales.
5. `/api/bookings` ahora recorta el nombre del cliente a 80 caracteres (el CHECK
   `customers_name_len`).
6. **SUPERSEDIDO por la revisión final (ver decisión 6 arriba y el cuerpo del PR): el guardado de perfil NO pasa por `update_customer_contact`; la propagación del snapshot queda para PR3.** Redacción original, conservada como historia: guardar el perfil ahora pasa por `update_customer_contact`, que además
   de escribir la ficha **reescribe el snapshot de nombre/email/teléfono en TODOS los pedidos y
   reservas de ese cliente — incluidos los históricos ya pagados**, **adopta las filas huérfanas
   cuyo email coincide** (les setea `customer_id`) y corre **`award_retro_points`**. O sea: un
   **backfill parcial por cliente aterriza en PR2**, antes del global de PR3. Cada uno de esos
   efectos es algo que PR3 hace igual para toda la tabla — el estado final es el mismo, solo
   ocurre antes y de a un cliente, para quien edite su perfil. También agrega un segundo
   disparador del **sobre-otorgamiento conocido y preexistente de `award_retro_points` en los
   pedidos delta de reagendamiento**, que se arregla en su propio PR aparte y **no** acá.
7. Un `+` explícito no salva a un número de 9 dígitos que parte en `9`: igual se le antepone
   `+56`, pisando la marca internacional (`"+912345678"` → `"+56912345678"`, y lo mismo con
   `"(+91) 2345678"`). Ningún país con código de país que empiece en `9` tiene solo 9 dígitos en
   total, así que en este negocio ese patrón siempre es un móvil chileno mal prefijado, nunca un
   número extranjero real.
8. El `00` también amplía la aceptación en el otro extremo: un número de 16 o 17 dígitos con
   prefijo `00` que hoy se rechazaba ahora se acepta si al sacarle el `00` quedan 15 dígitos o
   menos (`"0012345678912345"` → antes `null`, ahora `"12345678912345"`). 15 dígitos es el
   máximo de un número E.164, así que el `null` de antes era el defecto — esto solo amplía lo
   que se acepta, nunca lo angosta.

## Por qué

PR1 dejó el esquema y las RPC listas, pero el código vivo seguía haciendo
`upsert({id: authUserId}, onConflict: "id")`: cada login volvía a crear una ficha con
`id = auth id` y `auth_user_id` NULL, y una ficha adoptada del directorio (id propio) habría
mostrado 0 puntos. Este PR corta esa suposición en las ocho entradas de sesión y consolida cuatro
copias del par `EMAIL_RE`/`normalizePhone`.

## Hallazgos de la revisión de PR1 que este PR cierra

- **TOCTOU de `ensure_customer_for_user`**: su chequeo de email libre no es serializable, así que
  una carrera aflora como `23505` crudo en vez del literal. `isEnsureEmailConflict` trata ambos
  como la **misma** condición, pero **excluye** el `23505` de `customers_auth_user_id_key` (dos
  logins concurrentes del mismo usuario): ese es `auth_user_taken`, no un email ocupado, y sale
  como sentinela traducible en vez de mostrar la pantalla de conflicto (dos tests unitarios).
- **El literal exagera la causa**: `customer_email_owned_by_other_user` también salta con una ficha
  de invitado sin reclamar y en la carrera por PK, así que la copia habla de "otro cliente" y
  **nunca** promete "otra cuenta" (hay un test que lo asegura).
- **`bookingsForCustomer(id, email)`** matchea `customer_id = id OR (customer_id is null AND
  lower(customer_email) = email)`: la rama por email es alcanzable hoy en prod (el backfill llega
  en PR3 y las cortesías no pasan por el checkout).
- **Filas legacy**: hay un itest de aplicación que prueba que una fila `id = usuario,
  auth_user_id null` se **adopta** (misma fila, `auth_user_id` seteado) en vez de duplicarse.

## Qué NO hace

- **Sin migración y sin `db:types`**: `supabase/` y `database.types.ts` quedan intactos.
- Sin UI nueva ni páginas de admin (PR5–PR7), sin `customers.manage` (PR4) y sin tocar
  `create_checkout` ni la cortesía (PR3): ninguna reserva nueva crea todavía una ficha.
- Sin fusionar clientes y sin canje ni ajuste manual de puntos desde el admin.

## Verificación local

`npx eslint .` · `npm test` · `npm run test:integration` · `npm run build` — todo exit 0, y
`git diff main -- supabase/ src/infrastructure/db/database.types.ts` vacío. Smoke con el stack
local: login en `/cuenta` como `felipe.munoz@outlook.cl` (saldo intacto, `id = auth_user_id` sin
recrear), edición de teléfono en `/cuenta/perfil` propagada al snapshot de su próxima reserva,
`/reservar` con puntos y checkout de invitado.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

- [ ] **Step 6: Summarize the branch for review — do NOT push.**

```bash
/opt/homebrew/bin/git log --oneline main..HEAD
/opt/homebrew/bin/git diff --stat main
/opt/homebrew/bin/git status --short
```

Expected: nine commits (Tasks 0–8), a clean tree, and no `supabase/` or `database.types.ts` in the diff. **Stop here.** The push and

```bash
/opt/homebrew/bin/git push -u origin feat/directorio-clientes-identidad
/opt/homebrew/bin/gh pr create --title "refactor(customers): identidad por auth_user_id" --body-file /tmp/directorio-pr2-body.md
```

happen only **after** a whole-branch review has been requested and its findings resolved (see `superpowers:requesting-code-review`). PR3 (`feat(db): activar vínculo cliente ↔ reserva`) branches from `main` once this one is squash-merged and live.
