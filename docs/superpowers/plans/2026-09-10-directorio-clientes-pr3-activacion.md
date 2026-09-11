# Directorio de clientes — PR3 (activar el vínculo cliente ↔ reserva) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR3 of the customer-directory chain — the **activation**: make `customer_sync_snapshots` non-destructive, run the historical backfill plus retroactive points, and turn `create_checkout`, `create_reschedule_charge` and the courtesy path into writers of `customers.id`, so from this deploy on every booking has a real customer record behind it.

**Architecture:** One new migration (`supabase/migrations/20260909130000_customer_directory_activate.sql`) built in five ordered sections — the non-destructive `customer_sync_snapshots` fix **first** (it is a precondition, not a nicety: every production customer record has `name` and `phone` empty while thirteen reservations carry a name and five carry a phone, so the current version would blank live contact data the moment anything called it), then the one-shot `backfill_customers_from_bookings()` + retro loop, then `create or replace` of `create_checkout` and `create_reschedule_charge` with byte-identical signatures. Two small TypeScript changes ride along: the courtesy insert stops diverging from the checkout (it goes through `upsert_guest_customer`) and `CheckoutService` learns the new `customer_not_found` sentinel. Re-pointing `/cuenta/perfil` at `update_customer_contact` is **deliberately NOT in this PR** — it moves to PR4 (see decision 4); PR2's provisional narrow write (`updateNamePhone`) stays exactly as it is. Each task leaves `eslint + unit + integration + build` green.

**Tech Stack:** Postgres 17 / Supabase (plpgsql, `set search_path = public, pg_temp`), TypeScript 5 / Next.js 15 App Router, Supabase JS v2 over the service role, vitest (unit: `src/**/*.test.ts` + `lib/**/*.test.ts`, node env; integration: `src/**/*.itest.ts` against local Supabase on ports 54421/54422), ESLint 9 flat config.

**Spec:** `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` — read it end to end first, especially "Invariante central", §"Esquema y migraciones → PR3", "Reglas de higiene SQL", the PR3 entry of "Cadena de PRs" and "Riesgos, casos borde y no-objetivos". This plan argues from it. Format models: `docs/superpowers/plans/2026-09-09-directorio-clientes-pr1-expand.md` and `docs/superpowers/plans/2026-09-09-directorio-clientes-pr2-identidad.md`.

## Global Constraints

- **PR1 and PR2 are merged and live in production** (`main` at `eed85e8`). PR1's schema and its five directory functions are applied everywhere; PR2's code-only identity refactor is deployed. **Do not re-derive anything from them** — the file on disk is the truth: `supabase/migrations/20260909120000_customer_directory.sql`.
- **This PR HAS a migration.** The expand/contract rule of `DEPLOY.md` applies in full: the migration must be safe for the code that is *currently live* at the instant it runs. Every SQL change here is `create or replace` of an existing function with an **identical signature** plus data writes to nullable columns that already exist — nothing renamed, nothing dropped, nothing made `NOT NULL`. A Vercel Instant Rollback of the code must stay safe against the new function bodies (it is: the extra columns they write are nullable and the old code never reads them).
- **The migration file is applied inside a SINGLE transaction.** `npx supabase db push --linked` (`.github/workflows/ci.yml:129,173`) wraps each migration file in one transaction, so a failure anywhere in the five sections leaves **nothing** applied and the `migrate` job can simply be re-run after the fix — there is no half-migrated state to reconcile by hand. The file is also re-runnable by design (`create or replace` everywhere; `backfill_customers_from_bookings()` and `award_retro_points()` are both idempotent), so a re-run after a partial-looking failure is safe.
- **The deploy window is why the profile re-point is NOT in this PR.** Vercel deploys the code on the push while the prod `migrate` job waits behind a required reviewer (`environment: production`), so the new code is live *before* the migration is approved. Anything that starts calling `update_customer_contact` in that window would run against PR1's still-destructive `customer_sync_snapshots`. See decision 4.
- **Vercel Preview runs against the STAGING Supabase project** (`DEPLOY.md` § "Staging"), and staging does **not** get this migration until `migrate-staging` runs on merge. So the preview of this PR exercises the OLD function bodies: **do not exercise `/cuenta/perfil` (nor judge checkout linking) on the preview URL** — a profile save there hits the destructive sync on staging data. Preview is a build/marketing check for this PR; behaviour is verified locally (CLAUDE.md § "Local-first testing").
- **The staging project must be confirmed awake before merging.** Free Supabase projects pause after ~7 days idle (`DEPLOY.md` § "Límites del plan free"). The `migrate` (prod) job runs only if the `migrate-staging` canary passed; a paused staging project fails the canary and the production migration is then never offered for approval — silently skipping the backfill while the code that expects it is already live. **Open the staging project in the dashboard and confirm it is active before squash-merging.**
- **Regexes inside migration files use SINGLE backslashes** (`standard_conforming_strings = on`). The two exact literals, byte-for-byte, are `'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'` and `regexp_replace(coalesce(phone, ''), '\D', '', 'g')`. `'\\D'` and `[^\\s@]` would be wrong (spec § "Reglas de higiene SQL" #1). PR3 does not add a new regex — it must not reformulate the existing ones either.
- **Language:** every user-facing string in Chilean Spanish (precise, direct, no exclamation marks); identifiers, sentinels (`customer_not_found`, `slot_taken`, …), file names and commit messages in English. Code comments follow the surrounding file (this repo comments in Spanish).
- **Branch:** `feat/directorio-clientes-activacion`, already created and checked out from `main` at `eed85e8`. Squash-merged via PR; **do not push until a whole-branch review has happened** (Task 7 stops before `git push`).
- **`git` on PATH fails on this machine** with "You have not agreed to the Xcode license agreements". Use **`/opt/homebrew/bin/git`** for every git command (same arguments). `gh` is at `/opt/homebrew/bin/gh`. **`python3` is blocked** — use `node` for any scripting.
- **`psql` is not installed on this machine.** Every ad-hoc SQL check runs inside the DB container: `docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c "…"`.
- **Conventional Commits**, small and atomic, one per task. Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` passed as a second `-m` (if your session's attribution guidance names a different model, use that line instead — the point is that the trailer is there).
- **No new npm dependencies.** Everything here is stdlib + what is already installed.
- **Local-first (CLAUDE.md):** everything is verified against local Supabase (`npm run db:start`, Docker). **Never against prod or the remote DB.**
- **Never leave the local DB seed-less.** The integration suite truncates transactional tables; **always finish an integration run with `npm run db:reset`.**
- **Before pushing:** `npx eslint .`, `npm test`, `npm run test:integration` and `npm run build` must all exit 0.
- **`npm run db:types` must produce NO diff.** PR3 changes no table, no column, no function signature. CI's "Check generated DB types are in sync" step compares `src/infrastructure/db/database.types.ts`; a diff here is a bug in your migration, not a types problem.
- **Snapshot invariant (spec §"Invariante central"):** every writer of `customer_id` also rewrites `customer_name/customer_email/customer_phone` **from the `customers` row**. PR3 adds three writers (`create_checkout`, `create_reschedule_charge`, `createCourtesyBooking`) and all three obey it. `customer_email` is always the record's — the eight points functions resolve the customer with `c.email = lower(o.customer_email)` and must never disagree with the FK.
- **Never render a raw DB message.** `run()`/`runData` (`components/admin/ui/action.ts`) surface `e.message` verbatim in toasts and the `error.tsx` boundaries only show `error.digest`. Every error that can reach a person goes through `customerDbErrorMessage` (`src/domain/customers/customer-input.ts`) or the segment's own `…ErrorMessage` mapper.
- **Layer boundaries (`eslint.config.mjs`):** `src/domain/**` may not import `@/src/application/*`, `@/src/infrastructure/*`, `@/app/*`, `@/components/*`, nor `next`/`react`/`@supabase/*`. `src/application/**` may not import `@/src/infrastructure/*` nor `next`/`@supabase/*`.
- **Run one unit test file:** `npx vitest run src/application/checkout/checkout-service.test.ts` (add `-t "<describe or it title>"` for one block). ⚠️ **`-t` is compiled as a REGEX, not a substring.** A title containing `(`/`)` — and most describes in this plan do — becomes a capture group and matches **nothing**, so vitest reports "No test files found"/0 tests and you would read that as "green". Always pass a **parenthesis-free** fragment of the title (or escape as `\(` `\)`). **Run one integration file:** `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts` (`fileParallelism: false`; `tests/setup.integration.ts` loads `.env.local`). After editing the migration, `npm run db:reset` **before** running any integration test — migrations only reach the local DB through a reset.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `docs/superpowers/plans/2026-09-10-directorio-clientes-pr3-activacion.md` | commit (Task 0) | This plan. |
| `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` | modify (Task 0) | §"Invariante central" gains PR3's non-destructive `customer_sync_snapshots`; the chain entries move the sync fix into PR3 and the `/cuenta/perfil` re-point into PR4. Committed with the plan. |
| `supabase/migrations/20260909130000_customer_directory_activate.sql` | create (Task 1), append (Tasks 2, 3, 4) | The whole activation, in five ordered sections: (1) non-destructive `customer_sync_snapshots`, (2) `backfill_customers_from_bookings()`, (3) retro loop, (4) `create_checkout`, (5) `create_reschedule_charge`. |
| `src/infrastructure/db/customers-directory.itest.ts` | append (Tasks 1, 2, 3, 4) | PR1's SQL-level suite (raw `pg`, no supabase-js). Gains four new describes: the non-destructive sync, the activation (backfill + retro + post-activation idempotence), `create_checkout` linking, and the delta order. |
| `src/infrastructure/db/admin-repository.ts` | modify (Task 5) — `createCourtesyBooking`, currently at line 849 | The courtesy insert resolves/creates the record through `upsert_guest_customer`, reads the snapshot back from it and writes `customer_id`. |
| `src/infrastructure/db/admin.itest.ts` | append (Task 5) | Courtesy linking cases — this file already owns `createCourtesyBooking` coverage and holds the `SupabaseAdminRepository` instance. |
| `src/application/checkout/checkout-service.ts` | modify (Task 6) — the `catch` at lines 121–127 | Maps the new `customer_not_found` raise to a stable error code. |
| `src/application/checkout/checkout-service.test.ts` | append (Task 6) | Unit case for that mapping. |
| `src/application/ports/checkout.ts` | modify (Task 6) — the `customerId` doc at line 24 | `customerId` is no longer "the points account": it is the directory link, and the DB now demands it exist. |
| `app/admin/(panel)/reservas/nueva/actions.ts` | modify (Tasks 5, 6) — the `notifyCourtesy` call at lines 76–78 (Task 5, comment only); `checkoutErrorMessage`, lines 19–27 (Task 6) | Flags that the courtesy email still uses the typed contact while the snapshot now comes from the record; staff copy for `customer_not_found`. |
| `src/infrastructure/db/points.itest.ts` | modify (Task 3) — the "sin perfil" case at line 160 | A guest with a valid email now earns at payment (the record is created inside `create_checkout`), so retro afterwards awards 0. |
| `src/infrastructure/db/booking-routes.itest.ts` | modify (Task 3) — the snapshot case at lines ~245–264 | The order snapshot now comes from the linked record, not from the typed body. |

## Migration file layout (section order — each task appends under its header)

```
-- header comment (Task 1)
-- ── 1. PRECONDICIÓN: customer_sync_snapshots deja de ser destructivo ──   (Task 1)
-- ── 2. Backfill del directorio (una vez; la función es idempotente) ──     (Task 2)
-- ── 3. Retro de puntos para toda ficha con email ──                        (Task 2)
-- ── 4. create_checkout: crea/vincula la ficha (misma firma de 15 params) ─ (Task 3)
-- ── 5. create_reschedule_charge: el pedido delta hereda el vínculo ──      (Task 4)
```

Section 1 is first **on purpose**: it is the only statement in this PR that must not run after any other. From the moment the backfill links orders and reservations to records, every call to `customer_sync_snapshots` touches live contact data — and PR4 will add a second caller when `/cuenta/perfil` re-points at `update_customer_contact`. Landing the fix in the same migration but *below* the backfill would leave a window inside the transaction where the destructive version is the one on disk, and it would read as if the ordering did not matter. It does: this is the fix for the data-loss defect PR2's review found.

## What PR1 and PR2 already gave us (do not re-derive it)

- **Function signatures live in production** (`supabase/migrations/20260909120000_customer_directory.sql`):
  - `upsert_guest_customer(p_name text, p_email text, p_phone text) returns uuid` — returns **null** without writing when the email fails the shape gate. For a guest record the typed values win (`coalesce(excluded.…, customers.…)`); for an account holder (`auth_user_id is not null`) the name and email are kept and only an empty phone is filled.
  - `customer_sync_snapshots(p_customer uuid, p_old_email text) returns void` — **this PR rewrites its body.**
  - `ensure_customer_for_user(p_user uuid, p_email text) returns uuid`
  - `backfill_customers_from_bookings() returns int` — returns the count of **inserted** records (`xmax = 0`), links orders, reservations and reservations-through-their-order. **This PR calls it; it does not change it.**
  - `update_customer_contact(p_customer uuid, p_name text, p_email text, p_phone text) returns void` — calls `customer_sync_snapshots` and then `award_retro_points` when the email is not null.
  - `assign_booking_customer(p_reservation uuid, p_customer uuid, p_created_by uuid default null) returns void` — **untouched here** (PR7 wires it).
  - `award_retro_points(p_customer uuid) returns int` (pre-existing, `20260704113000_customers_points.sql:424`).
- **Signatures this PR must reproduce byte-for-byte** (`create or replace`, never `drop`) — from `supabase/migrations/20260707240000_booking_events_instrumentation.sql`:
  - `create_checkout(p_resource uuid, p_starts timestamptz, p_ends timestamptz, p_amount int, p_net int, p_tax int, p_currency text, p_customer jsonb, p_snapshot jsonb, p_lines jsonb, p_ttl interval default interval '10 minutes', p_customer_id uuid default null, p_points int default 0, p_terms_version text default null, p_terms_source text default null) returns uuid` (lines 8–15).
  - `create_reschedule_charge(p_reservation uuid, p_starts timestamptz, p_ends timestamptz, p_snapshot jsonb, p_lines jsonb, p_delta int, p_delta_net int, p_delta_tax int, p_created_by uuid default null) returns table(reschedule_id uuid, delta_order_id uuid)` (lines 126–130).
  Changing either signature would force a `drop`, break `checkout-repository.ts` and violate expand/contract. **Do not touch `src/infrastructure/db/checkout-repository.ts`.**
- **Generated types already carry everything** (`src/infrastructure/db/database.types.ts`): `Functions.upsert_guest_customer` is `{ Args: { p_email: string; p_name: string; p_phone: string }; Returns: string }` — the generator does not model the nullable return, so the adapter casts `data as string | null`. `customers.Row` has `name`, `email`, `phone` all nullable; `orders`/`reservations` have `customer_id: string | null`.
- **Copy already exists** for every sentinel this PR can raise: `src/domain/customers/customer-input.ts` maps `customer_not_found` → **"El cliente ya no existe. Vuelve a seleccionarlo."**. Do not invent a second sentence.
- **Cleanup strings are already done.** PR1's Task 9 added `customers` to every itest that already truncated `reservations, orders`. `truncate customers cascade` reaches `orders`, `reservations`, `points_ledger` and the curso tables. **No itest needs a cleanup-string change in PR3** — verify, do not edit.

## Production facts (measured 2026-09-10 — use them, do not re-derive)

| Fact | Value |
|---|---|
| `customers` rows today | **3**, all with `name` and `phone` **empty** |
| Reservations carrying a name / a phone | **13** / **5** |
| Paid orders | **6** |
| `points_ledger` rows | **0** |
| `reschedules` rows | **0** |
| Records the backfill will create | **7** → directory goes from 3 to **10** |
| Orders left unlinked after the backfill | **0** |
| Existing records that merge with a booking email | **0** (the three share no email with any booking) |

These numbers drive two things: the pre-flight/verification queries in Task 7's PR body, and the risk assessment below.

## Decisions of this PR (read before Task 1)

1. **`customer_sync_snapshots` keeps `customer_email` authoritative and coalesces only `name` and `phone`.** The eight points functions resolve the customer with `c.email = lower(o.customer_email)` (`confirm_payment` at `20260707240000:86-87`, `mark_refunded`, `reschedule_down`, `apply_reschedule_charge`, `award_retro_points`, …). If the snapshot email could lag behind the record, a claw-back would revoke from nobody — or from the wrong person if another record took that address. So the email is copied verbatim, always. Name and phone carry no such contract, and the record is frequently the *poorer* source (in production it is empty for all three records while thirteen bookings carry a name): `coalesce(<record value>, <existing snapshot value>)` is the correct direction. `update_customer_contact` already refuses to strip the email from a record with points or with linked history (`customer_email_in_use`), so the authoritative email can never be nulled out from under a booking.
2. **`assign_booking_customer` is deliberately NOT made coalescing.** It is a *reassignment*: the point is that the booking now belongs to somebody else, so keeping the previous customer's name in the snapshot would be actively wrong. It also does not go through the helper — it inlines its own `update`. Leave it exactly as PR1 shipped it; it has no consumer until PR7.
3. **The known `award_retro_points` over-award is NOT fixed here.** `award_retro_points` walks every order whose email matches, including fulfilled reschedule **delta** orders (whose earn actually lives on the principal order), so it can over-award when a customer has reschedules. Production has **0 reschedules** and **0 ledger rows**, so this backfill cannot trigger it. It has its own pull request; fixing it here would widen PR3's blast radius for no production benefit. Stated in the risk section and in the PR body.
4. **⚠️ DEFERRED TO PR4 — `/cuenta/perfil` KEEPS the narrow write in this PR.** PR2 added `updateNamePhone` as a stopgap "until PR3 makes `customer_sync_snapshots` non-destructive"; Task 1 meets that condition, so re-pointing the profile save at `update_customer_contact` (and deleting the stopgap) is now *correct code* — but it cannot ship **in this PR**. Reason, and it is only this: **the deploy window.** CI deploys the code to Vercel on the push while the prod `migrate` job waits behind a required reviewer (`environment: production`, `.github/workflows/ci.yml:144-173`), so the new code is live *before* the migration is approved. In that window a profile save through `update_customer_contact` would run against PR1's **still-destructive** `customer_sync_snapshots`, and one save with a blank Nombre would blank the name on every linked booking — the exact defect this PR exists to fix, against 13 named reservations. There is **no doubt about the function**: `updateProfileByUser` forwarding the record's current email is safe (`customer_has_account` and `customer_email_in_use` can never fire), and the coalescing sync is proven by Task 1's tests. It is purely a matter of ordering. So: **PR4 does the re-point and the `updateNamePhone` removal**, and by the chain rule ("PR N+1 merges only after PR N's `migrate` is approved") PR4 merges only once **this** PR's migration job is approved and green — by then the non-destructive sync is live in production and the window is closed. Consequence for this PR: `updateNamePhone` stays exactly as PR2 shipped it, on the port (`src/application/ports/customers.ts`), on the adapter (`src/infrastructure/db/customer-repository.ts`), in `CustomerService.updateProfileByUser` and in the test fakes — **do not delete it anywhere**, and saving `/cuenta/perfil` still does *not* propagate snapshots or award retro points until PR4.
5. **Courtesy integration tests live in `admin.itest.ts`, not `customers-directory.itest.ts`.** `customers-directory.itest.ts` is a pure `pg` suite with no supabase-js client by design; `createCourtesyBooking` is a TypeScript method on `SupabaseAdminRepository`, whose instance and fixtures already exist in `admin.itest.ts` (which also already truncates `customers`). The spec's own §"Pruebas" lists `admin.itest.ts` for admin-repository behaviour, so this is a placement choice inside the spec's grain, not a deviation from it.
6. **The courtesy `customerId` parameter has no caller in PR3.** PR5 wires the picker. It ships now so that the courtesy path and the checkout path are written together and can never drift; the parameter is exercised by an integration test, not by production code, until PR5.
7. **`orders.customer_email` becomes lowercase for every new order.** `create_checkout` normalizes with `lower(trim(...))` before writing. `priorCustomerEmails` (`admin-repository.ts:441`) and `computeAnalytics` (`src/domain/analytics/metrics.ts:289`) already lowercase on both sides, and `notification-repository` reads the field as an address, so nothing breaks — but it is a real behaviour change and an integration test pins it.

---

### Task 0: Confirm the branch and commit the plan

**Files:**
- Commit: `docs/superpowers/plans/2026-09-10-directorio-clientes-pr3-activacion.md` (this file)
- Modify + commit: `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` (Step 4)

**Interfaces:**
- Consumes: `main` at `eed85e8` (PR1 and PR2 squash-merged, PR1's migration applied in prod and staging).
- Produces: branch `feat/directorio-clientes-activacion` that every later task commits to, and a spec whose §"Invariante central" and chain entries match what this PR actually ships.

- [ ] **Step 1: Confirm the branch (it already exists and is checked out).**

```bash
/opt/homebrew/bin/git branch --show-current
```

Expected: `feat/directorio-clientes-activacion`. If it prints something else, `/opt/homebrew/bin/git switch feat/directorio-clientes-activacion` — the branch exists, so `checkout -b` would abort. Do not rebase or pull.

- [ ] **Step 2: Confirm PR1 and PR2 are in the history and PR1's migration is on disk.**

```bash
/opt/homebrew/bin/git log --oneline -3 main
ls supabase/migrations/20260909120000_customer_directory.sql
grep -c "create function customer_sync_snapshots" supabase/migrations/20260909120000_customer_directory.sql
```

Expected: `eed85e8 refactor(customers): identidad por auth_user_id (#128)` and `14ddf46 feat(db): directorio de clientes (expand) (#127)` in the log; the migration file exists; the grep prints `1`.

- [ ] **Step 3: Start the local stack and confirm the schema matches prod's.**

```bash
npm run db:start
npm run db:reset
docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
  "select count(*) from customers; select count(*) from orders where customer_id is not null;"
```

Expected: `db:reset` exits 0 (the seed's `backfill_customers_from_bookings() <> 0` guard passes), 7 customers, 6 linked orders. If `db:reset` fails on that guard, stop — the local schema drifted and nothing below is trustworthy.

- [ ] **Step 4: Patch the spec so it matches what this PR actually ships**

The spec still describes `customer_sync_snapshots` as fully destructive (it was, in PR1) and its
chain entry for PR3 lists neither the sync fix nor the profile re-point. Both are wrong now: the
sync fix belongs to **this** PR (Task 1) and the `/cuenta/perfil` re-point moved to **PR4**
(decision 4). Three edits in `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md`:

**(a) §"Invariante central"** — replace this paragraph tail (currently lines 58–62):

```markdown
Ambas pasan por el
helper privado **`customer_sync_snapshots(p_customer uuid, p_old_email text)`** (PR1): relee la
ficha y reescribe `customer_id/name/email/phone` en los pedidos/reservas vinculados
(`customer_id = p_customer`) y en los huérfanos (`customer_id is null`) cuyo
`lower(customer_email)` sea el email viejo o el actual.
```

with:

```markdown
Ambas pasan por el
helper privado **`customer_sync_snapshots(p_customer uuid, p_old_email text)`** (definido en PR1,
**cuerpo reescrito en PR3**): relee la ficha y reescribe `customer_id/name/email/phone` en los
pedidos/reservas vinculados (`customer_id = p_customer`) y en los huérfanos
(`customer_id is null`) cuyo `lower(customer_email)` sea el email viejo o el actual.

**No es destructivo desde PR3.** El `email` de la ficha sigue siendo **autoritativo** (se copia
verbatim: las ocho funciones de puntos resuelven al cliente por `c.email = lower(o.customer_email)`
y un snapshot con el email viejo haría que el claw-back revoque a nadie —o al cliente equivocado—),
pero **`name` y `phone` se COALESCEAN** contra lo que ya tenía el pedido/reserva:
`customer_name = coalesce(c.name, o.customer_name)`, `customer_phone = coalesce(c.phone,
o.customer_phone)`. La versión de PR1 copiaba los NULL de la ficha encima del snapshot, y la ficha
suele ser la fuente **más pobre** (medido en prod el 2026-09-10: las 3 fichas tienen `name` y
`phone` vacíos mientras 13 reservas llevan nombre y 5 llevan teléfono), así que borraba el contacto
de reservas pagadas y confirmadas. Por eso el arreglo va **primero** en la migración de PR3, antes
del backfill y antes de cualquier escritor nuevo. `assign_booking_customer` es la excepción
deliberada: inlinea su propio `update` y **pisa** el snapshot, porque reasignar es cambiar de dueño.
```

**(b) el corolario que sigue** — replace (currently lines 64–67):

```markdown
Corolario (crítico #6): la edición de perfil en `/cuenta` pasa por el **mismo** camino que la
edición del admin (`update_customer_contact`), así los dos escritores de `customers` nunca
derivan: cambiar el teléfono en `/cuenta/perfil` actualiza el snapshot de la reserva próxima
que el staff usa para WhatsApp.
```

with:

```markdown
Corolario (crítico #6): la edición de perfil en `/cuenta` pasa por el **mismo** camino que la
edición del admin (`update_customer_contact`), así los dos escritores de `customers` nunca
derivan: cambiar el teléfono en `/cuenta/perfil` actualiza el snapshot de la reserva próxima
que el staff usa para WhatsApp.

Ese corolario se cumple **en PR4**, no en PR3. PR2 dejó un escritor angosto provisorio
(`CustomerRepository.updateNamePhone`: solo `name`/`phone` en la fila de `customers`, sin
propagar) porque el sync todavía era destructivo. PR3 arregla el sync, pero **no** re-apunta
`/cuenta/perfil`: en el push de PR3 el código sale a Vercel mientras el job `migrate` de prod
espera aprobación de un revisor, así que habría una ventana con el código nuevo llamando al
`customer_sync_snapshots` viejo (destructivo). Por la regla de la cadena, PR4 se mergea recién
cuando el `migrate` de PR3 está aprobado y verde: ahí el re-apunte es seguro y `updateNamePhone`
se elimina del puerto y del adaptador.
```

**(c) §"Cadena de PRs"** — in entry **3** (`feat(db): activar vínculo cliente ↔ reserva`) add the
sync fix to the migration's contents, and in entry **4** add the profile re-point. Replace:

```markdown
3. **`feat(db): activar vínculo cliente ↔ reserva`** —
   `supabase/migrations/20260909130000_customer_directory_activate.sql` (backfill + retro,
   `create_checkout`, `create_reschedule_charge`), `src/infrastructure/db/admin-repository.ts`
```

with:

```markdown
3. **`feat(db): activar vínculo cliente ↔ reserva`** —
   `supabase/migrations/20260909130000_customer_directory_activate.sql` (**`customer_sync_snapshots`
   no destructivo — precondición, va primero**, backfill + retro,
   `create_checkout`, `create_reschedule_charge`), `src/infrastructure/db/admin-repository.ts`
```

and replace:

```markdown
4. **`feat(rbac): customers.manage`** — `supabase/migrations/20260909140000_customers_permission.sql`,
   `src/domain/auth/permissions.ts`, `permissions.test.ts`. Sin nav.
```

with:

```markdown
4. **`feat(rbac): customers.manage` + `/cuenta/perfil` por `update_customer_contact`** —
   `supabase/migrations/20260909140000_customers_permission.sql`,
   `src/domain/auth/permissions.ts`, `permissions.test.ts` (sin nav); y el re-apunte del guardado
   de perfil que PR3 difirió por la ventana de deploy: `src/application/ports/customers.ts` y
   `src/infrastructure/db/customer-repository.ts` (se elimina `updateNamePhone`),
   `src/application/customers/customer-service.ts` (+test), `customer-repository.itest.ts`.
   Se mergea recién con el `migrate` de PR3 aprobado y verde.
```

Verify the three edits landed and nothing else moved:

```bash
/opt/homebrew/bin/git diff --stat docs/superpowers/specs/2026-09-09-directorio-clientes-design.md
grep -n "no destructivo desde PR3\|no destructivo — precondición\|updateNamePhone" \
  docs/superpowers/specs/2026-09-09-directorio-clientes-design.md
```

Expected: exactly one file changed; the greps find the new sentences in §"Invariante central", in the
corollary and in chain entries 3 and 4.

- [ ] **Step 5: Commit the plan and the spec patch.**

```bash
/opt/homebrew/bin/git add docs/superpowers/plans/2026-09-10-directorio-clientes-pr3-activacion.md \
  docs/superpowers/specs/2026-09-09-directorio-clientes-design.md
/opt/homebrew/bin/git commit -m "docs(plan): plan de PR3 — activar el vínculo cliente ↔ reserva" \
  -m "La spec se corrige en el mismo commit: customer_sync_snapshots deja de describirse como destructivo (PR3 lo coalescea) y la cadena mueve el re-apunte de /cuenta/perfil a PR4." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: The precondition — `customer_sync_snapshots` stops being destructive

**Files:**
- Create: `supabase/migrations/20260909130000_customer_directory_activate.sql` (header + section 1)
- Test: `src/infrastructure/db/customers-directory.itest.ts` (new `describe` inserted **immediately before** `describe("update_customer_contact …")`, currently line 416)

**Interfaces:**
- Consumes: PR1's `customer_sync_snapshots(p_customer uuid, p_old_email text) returns void` and the module-scope itest helpers `customer({id?,name?,email?,phone?,authUserId?}) => Promise<string>`, `booking({name?,email?,phone?,customerId?,amount?,status?}) => Promise<{orderId, reservationId}>`, `snapshot("orders"|"reservations", id) => Promise<Snapshot>` and `count(fromClause, params?) => Promise<number>`.
- Produces: the same signature with a coalescing body — `customer_name = coalesce(c.name, <existing>)`, `customer_phone = coalesce(c.phone, <existing>)`, `customer_email = c.email` (unchanged, authoritative). Tasks 2–4 depend on it (the backfill and both `create or replace`d functions run after it in the same transaction), and the already-live `update_customer_contact` — which calls this helper — inherits the fix the moment the migration lands. **PR4's `/cuenta/perfil` re-point is what finally exercises it from the app; it is not in this PR (decision 4).**

- [ ] **Step 1: Write the failing tests**

Insert this whole `describe` into `src/infrastructure/db/customers-directory.itest.ts`, immediately **before** the line `describe("update_customer_contact (edición desde /admin/clientes y /cuenta/perfil)", () => {`:

```ts
describe("customer_sync_snapshots (no destructivo desde PR3)", () => {
  const sync = (id: string, oldEmail: string | null) =>
    pg.query("select customer_sync_snapshots($1, $2)", [id, oldEmail]);

  // El defecto que PR3 arregla: en prod las tres fichas tienen name y phone en
  // NULL mientras 13 reservas llevan nombre y 5 llevan teléfono. La versión
  // vieja copiaba los NULL encima y borraba el contacto del historial.
  it("una ficha sin nombre ni teléfono NO borra el nombre ni el teléfono del historial", async () => {
    const c = await customer({ name: null, email: "vacia@dir.cl", phone: null });
    const linked = await booking({
      name: "Nombre Del Historial",
      email: "vacia@dir.cl",
      phone: "+56 9 1111 1111",
      customerId: c,
    });
    const orphan = await booking({ name: "Huérfana", email: "VACIA@dir.cl", phone: "+56 9 2222 2222" });

    await sync(c, "vacia@dir.cl");

    expect(await snapshot("orders", linked.orderId)).toEqual({
      customer_id: c,
      customer_name: "Nombre Del Historial",
      customer_email: "vacia@dir.cl",
      customer_phone: "+56 9 1111 1111",
    });
    expect(await snapshot("reservations", linked.reservationId)).toEqual({
      customer_id: c,
      customer_name: "Nombre Del Historial",
      customer_email: "vacia@dir.cl",
      customer_phone: "+56 9 1111 1111",
    });
    // El huérfano se adopta y su email se canoniza, pero conserva su contacto.
    expect(await snapshot("orders", orphan.orderId)).toEqual({
      customer_id: c,
      customer_name: "Huérfana",
      customer_email: "vacia@dir.cl",
      customer_phone: "+56 9 2222 2222",
    });
  });

  it("cuando la ficha SÍ tiene nombre y teléfono, siguen ganando los de la ficha", async () => {
    const c = await customer({ name: "Ficha", email: "manda@dir.cl", phone: "+56 9 3333 3333" });
    const b = await booking({ name: "Viejo", email: "manda@dir.cl", phone: "+56 9 4444 4444", customerId: c });

    await sync(c, "manda@dir.cl");

    expect(await snapshot("orders", b.orderId)).toEqual({
      customer_id: c,
      customer_name: "Ficha",
      customer_email: "manda@dir.cl",
      customer_phone: "+56 9 3333 3333",
    });
  });

  // El email NO se coalescea: las ocho funciones de puntos resuelven al cliente
  // por c.email = lower(o.customer_email). Si el snapshot pudiera quedarse con
  // el email viejo, el claw-back de mark_refunded revocaría a nadie.
  it("el email de la ficha SIEMPRE manda, incluso sobre un snapshot que traía otro", async () => {
    const c = await customer({ name: null, email: "nuevo@dir.cl", phone: null });
    const b = await booking({ name: "Con Nombre", email: "viejo@dir.cl", phone: null, customerId: c });

    await sync(c, "viejo@dir.cl");

    expect(await snapshot("orders", b.orderId)).toEqual({
      customer_id: c,
      customer_name: "Con Nombre",
      customer_email: "nuevo@dir.cl",
      customer_phone: null,
    });
  });

  it("una ficha inexistente sigue levantando customer_not_found", async () => {
    await expect(sync("e0000000-0000-4000-a000-0000000000fe", null)).rejects.toThrow("customer_not_found");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "no destructivo desde PR3"`
(The filter is a **parenthesis-free** fragment of the describe title on purpose: `-t` is a regex, and
`-t "customer_sync_snapshots (no destructivo desde PR3)"` would compile the parens as a capture group
and match **zero** tests — which looks exactly like "nothing failed". Before reading the result,
confirm the run actually collected **4** tests.)

Expected: FAIL — the **first** case reports `customer_name: null` where `"Nombre Del Historial"` was expected and `customer_phone: null` where `"+56 9 1111 1111"` was expected, and the **third** reports `customer_name: null` where `"Con Nombre"` was expected (the live version copies the record's NULLs over the snapshot). The second passes because that record has a name and a phone, and the fourth because the `customer_not_found` guard is unchanged. **Exactly cases 1 and 3 must be red before you continue** — if all four are green, you are running against a database that already has the fix; if **zero** tests ran, your `-t` pattern matched nothing (see above), fix the filter and re-run.

- [ ] **Step 3: Write the migration file with its header and section 1**

Create `supabase/migrations/20260909130000_customer_directory_activate.sql` with exactly this content:

```sql
-- Directorio de clientes (PR3, activación). Ver docs/superpowers/specs/2026-09-09-directorio-clientes-design.md.
--
-- PR1 dejó el esquema y las funciones DEFINIDAS pero sin ejecutar; PR2 cortó la suposición
-- customers.id = auth.users.id en el código. Acá se ACTIVA el vínculo: se corre el backfill
-- histórico, se otorgan los puntos retroactivos y create_checkout / create_reschedule_charge
-- pasan a escribir customer_id (misma firma; create or replace, nunca drop → expand/contract).
--
-- INVARIANTE (spec §"Invariante central"): quien escribe customer_id reescribe también
-- customer_name/customer_email/customer_phone DESDE la ficha, así el FK y la join por email
-- (c.email = lower(o.customer_email), que usan las ocho funciones de puntos) nunca discrepan.
--
-- Regex: UNA barra invertida (standard_conforming_strings = on).

-- ── 1. PRECONDICIÓN: customer_sync_snapshots deja de ser destructivo ──
-- El email de la ficha SIGUE mandando (las funciones de puntos resuelven por ahí y un snapshot
-- con el email viejo haría que mark_refunded / reschedule_* revoquen a nadie — o al cliente
-- equivocado si otra ficha tomara esa dirección). Nombre y teléfono, en cambio, se COALESCEAN
-- contra lo que ya tenía el pedido/reserva: la ficha suele ser la fuente MÁS POBRE (en prod las
-- tres fichas tienen name y phone en NULL mientras 13 reservas llevan nombre y 5 llevan
-- teléfono), y copiar esos NULL encima borraba el contacto de reservas pagadas y confirmadas.
-- Tiene que ir ANTES del backfill y antes de que cualquier escritor nuevo llame al helper.
create or replace function customer_sync_snapshots(p_customer uuid, p_old_email text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  c customers%rowtype;
begin
  select * into c from customers where id = p_customer;
  if c.id is null then raise exception 'customer_not_found'; end if;

  update orders o
     set customer_id    = c.id,
         customer_name  = coalesce(c.name,  o.customer_name),
         customer_email = c.email,
         customer_phone = coalesce(c.phone, o.customer_phone)
   where o.customer_id = c.id
      or (o.customer_id is null and o.customer_email is not null
          and lower(o.customer_email) in (lower(p_old_email), c.email));

  update reservations r
     set customer_id    = c.id,
         customer_name  = coalesce(c.name,  r.customer_name),
         customer_email = c.email,
         customer_phone = coalesce(c.phone, r.customer_phone)
   where r.customer_id = c.id
      or (r.customer_id is null and r.customer_email is not null
          and lower(r.customer_email) in (lower(p_old_email), c.email));
end;
$$;
```

- [ ] **Step 4: Apply the migration locally and run the tests to verify they pass**

```bash
npm run db:reset
npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts
```

Expected: PASS — the four new cases and **every pre-existing case in the file**. The pre-existing snapshot cases stay green because in each of them the record's `name`/`phone` are non-null (`ensure_customer_for_user` propagation, `update_customer_contact` rewrite), so `coalesce` picks the same value as before.

- [ ] **Step 5: Confirm the migration produces no types diff**

```bash
npm run db:types
/opt/homebrew/bin/git diff --exit-code --stat src/infrastructure/db/database.types.ts
```

Expected: **no output and exit 0** (`--exit-code` is what makes this a real gate: plain `git diff --stat` always exits 0, so a diff would slip past a `&&` chain unnoticed). `create or replace` with an identical signature changes nothing the generator sees. If it exits 1, you changed the signature — fix the migration, do not commit the types.

- [ ] **Step 6: Leave the repo green, restore the seed and commit**

```bash
npx eslint . && npm run build
npm run db:reset
/opt/homebrew/bin/git add supabase/migrations/20260909130000_customer_directory_activate.sql src/infrastructure/db/customers-directory.itest.ts
/opt/homebrew/bin/git commit -m "fix(db): customer_sync_snapshots no destructivo (coalesce de nombre y teléfono)" \
  -m "El email sigue siendo autoritativo (las funciones de puntos resuelven por él); nombre y teléfono se coalescean contra el snapshot existente para que una ficha vacía no borre el contacto de una reserva." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Expected: `eslint` and `build` both exit 0 before the commit (constraint: **every task leaves the repo green**, and `npm run build` is what type-checks the new itest cases — `tsconfig.json` includes `**/*.ts`).

---

### Task 2: Run the backfill and award the retroactive points

**Files:**
- Modify: `supabase/migrations/20260909130000_customer_directory_activate.sql` (append sections 2 and 3)
- Test: `src/infrastructure/db/customers-directory.itest.ts` (new `describe` appended at the **end of the file**)

**Interfaces:**
- Consumes: Task 1's coalescing `customer_sync_snapshots`; PR1's `backfill_customers_from_bookings() returns int` and `award_retro_points(p_customer uuid) returns int`; the itest helpers `customer`, `booking`, `pay(orderId, paymentId)`, `snapshot`, `balance(id)`, `expectBalanceConsistent(id)`, `count(fromClause, params?)`.
- Produces: a production directory of 10 records with every order linked and the retro ledger written. Nothing later in this PR depends on the *data*; Task 7's verification queries depend on the *shape* of what ran.

- [ ] **Step 1: Write the characterization tests for exactly what the migration will do**

These two cases pin PR1's already-live functions on production-shaped fixtures. They are the contract the migration's sections 2 and 3 execute; the red state this task closes is Step 3 (the migration does not call them yet).

Append this `describe` to the **end** of `src/infrastructure/db/customers-directory.itest.ts`:

```ts
describe("activación PR3: backfill + retro (exactamente lo que corre la migración)", () => {
  const backfill = async () =>
    (await pg.query<{ n: number }>("select backfill_customers_from_bookings() n")).rows[0].n;

  /** El bloque de la migración, textual: retro para toda ficha con email. */
  const retroAll = () =>
    pg.query(`do $$ declare r record; begin
                for r in select id from customers where email is not null loop
                  perform award_retro_points(r.id);
                end loop;
              end $$;`);

  it("crea las fichas faltantes, vincula todo, otorga el retro — y correrlo de nuevo no cambia nada", async () => {
    // Pagó como invitado sin ficha → confirm_payment no otorgó nada en vivo.
    const paid = await booking({ name: "Matías Rojas", email: "MiXeD@Case.cl", phone: "+56 9 8123 4567" });
    await pay(paid.orderId, "act1");
    const pending = await booking({ name: "Ignacio", email: "ignacio@case.cl", phone: null });
    // La forma exacta de prod: ficha existente con nombre y teléfono vacíos.
    const existing = await customer({ name: null, email: "existe@case.cl", phone: null });
    const existingBooking = await booking({
      name: "Existe Con Nombre",
      email: "existe@case.cl",
      phone: "+56 9 9999 9999",
    });

    expect(await count("points_ledger")).toBe(0);
    expect(await backfill()).toBe(2); // mixed@case.cl e ignacio@case.cl (existe@case.cl ya tenía ficha)
    await retroAll();

    const mixed = (await pg.query<{ id: string }>("select id from customers where email='mixed@case.cl'")).rows[0].id;
    expect(await balance(mixed)).toBe(499); // floor(0.05 · 9990)
    await expectBalanceConsistent(mixed);

    // La ficha vacía preexistente absorbe nombre y teléfono del historial (solo NULLs rellenados).
    expect((await pg.query("select name, phone from customers where id=$1", [existing])).rows[0]).toEqual({
      name: "Existe Con Nombre",
      phone: "+56 9 9999 9999",
    });

    // Todo lo que tiene email queda vinculado (en prod: 0 pedidos sin vincular).
    expect(await count("orders where customer_id is null and customer_email is not null")).toBe(0);
    expect(await count("reservations where kind='booking' and customer_id is null and customer_email is not null")).toBe(0);
    expect((await snapshot("orders", existingBooking.orderId)).customer_id).toBe(existing);
    expect((await snapshot("orders", pending.orderId)).customer_id).not.toBeNull();
    expect((await snapshot("orders", paid.orderId)).customer_id).toBe(mixed);

    // Idempotencia DESPUÉS de la activación: ni fichas nuevas ni puntos nuevos.
    const fichas = await count("customers");
    const asientos = await count("points_ledger");
    expect(await backfill()).toBe(0);
    await retroAll();
    expect(await count("customers")).toBe(fichas);
    expect(await count("points_ledger")).toBe(asientos);
    expect(await balance(mixed)).toBe(499);
    await expectBalanceConsistent(mixed);
  });

  it("una ficha solo-teléfono no recibe retro y el backfill no la toca", async () => {
    const pia = await customer({ name: "Pía Contreras", email: null, phone: "+56912345678" });
    const b = await booking({ name: "Otra", email: "otra@case.cl", phone: null });
    await pay(b.orderId, "act2");

    expect(await backfill()).toBe(1);
    await retroAll();

    expect(await balance(pia)).toBe(0);
    expect((await pg.query("select name, email, phone from customers where id=$1", [pia])).rows[0]).toEqual({
      name: "Pía Contreras",
      email: null,
      phone: "+56912345678",
    });
  });
});
```

- [ ] **Step 2: Run them — they must be GREEN**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "activación PR3"`
Expected: **PASS.** These cases exercise PR1's already-live functions, so they characterize rather than drive. **If either is red, stop** — PR1's functions do not behave as this plan assumes, and you must reconcile with `supabase/migrations/20260909120000_customer_directory.sql` before writing section 2.

- [ ] **Step 3: Prove the migration does not yet run the backfill (the red state)**

```bash
grep -c "backfill_customers_from_bookings()" supabase/migrations/20260909130000_customer_directory_activate.sql
```

Expected: FAIL — `grep` exits 1 and prints `0`. That is the red state this task closes.

⚠️ **Be explicit about what this is: a `grep` exit code, NOT a failing test.** `superpowers:test-driven-development` demands a red *test* before the implementation, and this step does not provide one — deliberately. Step 1's two cases are **characterization** tests: they pin PR1's already-live `backfill_customers_from_bookings()` and `award_retro_points()`, which behave correctly *before* sections 2 and 3 exist, so no assertion can be made to fail by the absence of a one-line `select`. What sections 2 and 3 add is not behaviour but **execution against production data** — a data migration, whose only observable "before" state is that the statement is not in the file. So the rule is followed in spirit (a proven-red gate that only the implementation can close) with a documented deviation in letter, and Step 5 re-runs the same characterization suite against the applied migration to prove the statement did run.

- [ ] **Step 4: Append sections 2 and 3 to the migration**

Append to `supabase/migrations/20260909130000_customer_directory_activate.sql`:

```sql

-- ── 2. Backfill del directorio (una vez; la función ya es idempotente y re-ejecutable) ──
-- Una ficha por lower(customer_email) distinto que pase la puerta de forma; nombre y teléfono
-- se eligen por independiente (pagadas/cumplidas/reembolsadas/confirmadas primero, luego la más
-- reciente) y las fichas existentes SOLO reciben los NULL rellenados. Vincula pedidos, reservas
-- y reservas a través de su pedido. Medido en prod el 2026-09-10: crea 7 fichas (directorio
-- 3 → 10) y no deja ningún pedido sin vincular.
select backfill_customers_from_bookings();

-- ── 3. Retro de puntos para toda ficha con email ──
-- Idempotente por points_ledger_once (order_id, kind, ref): una segunda corrida no otorga nada.
-- Así /admin/clientes muestra saldos reales en vez de "0 pts" hasta el signup, y el seed local
-- y prod quedan simétricos (refinamiento flagged #2 de la spec).
-- OJO: award_retro_points recorre TODOS los pedidos del email, incluidos los pedidos delta de
-- reagendamiento, y con reagendamientos previos podría otorgar de más. Eso es un defecto
-- PREEXISTENTE con su propio PR; acá no se arregla y no puede dispararse: prod tiene 0
-- reagendamientos y 0 filas en points_ledger al momento de esta migración.
do $$
declare r record;
begin
  for r in select id from customers where email is not null loop
    perform award_retro_points(r.id);
  end loop;
end $$;
```

- [ ] **Step 5: Apply and verify**

```bash
npm run db:reset
grep -c "backfill_customers_from_bookings()" supabase/migrations/20260909130000_customer_directory_activate.sql
npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts
```

Expected: `db:reset` exits 0 (the seed's own backfill smoke still returns 0 — the migration runs the backfill against an empty DB, then the seed inserts its demo data already linked), the grep prints `1`, and the whole file passes.

- [ ] **Step 6: Confirm no types diff, leave the repo green, restore the seed and commit**

```bash
npm run db:types && /opt/homebrew/bin/git diff --exit-code --stat src/infrastructure/db/database.types.ts
npx eslint . && npm run build
npm run db:reset
/opt/homebrew/bin/git add supabase/migrations/20260909130000_customer_directory_activate.sql src/infrastructure/db/customers-directory.itest.ts
/opt/homebrew/bin/git commit -m "feat(db): correr el backfill del directorio y el retro de puntos" \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Expected: the diff prints nothing and exits 0; `eslint` and `build` exit 0 too (the build type-checks the new itest cases).

---

### Task 3: `create_checkout` creates and links the customer record

**Files:**
- Modify: `supabase/migrations/20260909130000_customer_directory_activate.sql` (append section 4)
- Test: `src/infrastructure/db/customers-directory.itest.ts` (new `describe` appended at the end)
- Modify: `src/infrastructure/db/points.itest.ts` (the case at line 160, `"sin perfil de cliente no otorga…"`)
- Modify: `src/infrastructure/db/booking-routes.itest.ts` (the case at lines ~245–264, `"normaliza nombre y teléfono del body en el snapshot"`)

**Interfaces:**
- Consumes: PR1's `upsert_guest_customer(p_name text, p_email text, p_phone text) returns uuid` (null when the email fails the gate); the 15-parameter `create_checkout` signature from `20260707240000_booking_events_instrumentation.sql:8-15`.
- Produces: `create_checkout` **raises `customer_not_found`** when `p_customer_id` is supplied and no such record exists (Task 6 maps it); writes `customer_id` on both the reservation and the order; and writes `orders.customer_email` **lowercase**.

- [ ] **Step 1: Write the failing tests**

Append this `describe` to the end of `src/infrastructure/db/customers-directory.itest.ts`:

```ts
describe("PR3: create_checkout crea/vincula la ficha", () => {
  const reservationOf = async (orderId: string) =>
    (await pg.query<{ id: string }>("select id from reservations where order_id=$1", [orderId])).rows[0].id;

  /** create_checkout directo (sin supabase-js), con la firma de 15 parámetros. Devuelve el orderId. */
  let hour = 0;
  const checkout = async (opts: {
    slot?: number;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    customerId?: string | null;
  }): Promise<string> => {
    hour += 1;
    const starts = new Date(Date.now() + (24 * 30 + (opts.slot ?? hour)) * 3_600_000);
    const ends = new Date(starts.getTime() + 3_600_000);
    const { rows } = await pg.query<{ id: string }>(
      `select create_checkout($1, $2, $3, 9990, 8395, 1595, 'CLP',
              jsonb_build_object('name', $4::text, 'email', $5::text, 'phone', $6::text),
              '{}'::jsonb, '[]'::jsonb, interval '10 minutes', $7::uuid, 0, null, null) id`,
      [
        resourceId,
        starts.toISOString(),
        ends.toISOString(),
        opts.name ?? null,
        opts.email ?? null,
        opts.phone ?? null,
        opts.customerId ?? null,
      ],
    );
    return rows[0].id;
  };

  it("p_customer_id que ya no existe → customer_not_found (la carrera entre elegir y guardar)", async () => {
    await expect(
      checkout({ email: "x@dir.cl", customerId: "e0000000-0000-4000-a000-0000000000fd" }),
    ).rejects.toThrow("customer_not_found");
  });

  it("con p_customer_id: vincula y arma el snapshot desde la ficha (el titular conserva nombre y email)", async () => {
    const c = await customer({ name: "Titular", email: "titular@dir.cl", phone: null, authUserId: U_HOLDER });
    const orderId = await checkout({
      name: "Otro Nombre",
      email: "otro@dir.cl",
      phone: "+56 9 1111 1111",
      customerId: c,
    });

    const esperado = {
      customer_id: c,
      customer_name: "Titular",
      customer_email: "titular@dir.cl",
      customer_phone: "+56 9 1111 1111", // la ficha no tenía teléfono → lo tipeado llena el hueco
    };
    expect(await snapshot("orders", orderId)).toEqual(esperado);
    expect(await snapshot("reservations", await reservationOf(orderId))).toEqual(esperado);
  });

  it("invitado nuevo: la ficha se crea en la MISMA transacción y el email queda en minúsculas", async () => {
    const orderId = await checkout({ name: "  Nueva Invitada  ", email: " Nueva@Dir.CL ", phone: "+56 9 2222 2222" });

    const c = (
      await pg.query<{ id: string; name: string; phone: string }>(
        "select id, name, phone from customers where email='nueva@dir.cl'",
      )
    ).rows[0];
    expect(c).toMatchObject({ name: "Nueva Invitada", phone: "+56 9 2222 2222" });
    expect(await snapshot("orders", orderId)).toEqual({
      customer_id: c.id,
      customer_name: "Nueva Invitada",
      customer_email: "nueva@dir.cl",
      customer_phone: "+56 9 2222 2222",
    });
  });

  it("invitado que vuelve: el teléfono nuevo tipeado gana en la ficha y viaja al snapshot", async () => {
    const c = await customer({ name: "Vuelve", email: "vuelve@dir.cl", phone: "+56 9 0000 0000" });
    const orderId = await checkout({ name: "Vuelve", email: "vuelve@dir.cl", phone: "+56 9 3333 3333" });

    expect((await pg.query("select phone from customers where id=$1", [c])).rows[0].phone).toBe("+56 9 3333 3333");
    expect((await snapshot("orders", orderId)).customer_phone).toBe("+56 9 3333 3333");
    expect((await snapshot("orders", orderId)).customer_id).toBe(c);
  });

  it("email sin forma válida: reserva igual, sin ficha y sin vínculo (snapshot con lo tipeado, en minúsculas)", async () => {
    const orderId = await checkout({ name: "Basura", email: "A@B", phone: "+56 9 4444 4444" });

    expect(await count("customers")).toBe(0);
    expect(await snapshot("orders", orderId)).toEqual({
      customer_id: null,
      customer_name: "Basura",
      customer_email: "a@b",
      customer_phone: "+56 9 4444 4444",
    });
  });

  it("slot_taken revierte también la ficha del invitado (una sola transacción)", async () => {
    await checkout({ slot: 90, name: "Primero", email: "primero@dir.cl" });
    await expect(checkout({ slot: 90, name: "Segundo", email: "segundo@dir.cl" })).rejects.toMatchObject({
      code: "23P01",
    });
    expect(await count("customers where email='segundo@dir.cl'")).toBe(0);
    expect(await count("customers where email='primero@dir.cl'")).toBe(1);
  });

  it("nombre de 120 caracteres y teléfono de 3 dígitos: se clampean como en upsert_guest_customer", async () => {
    const orderId = await checkout({ name: "N".repeat(120), email: "clamp@dir.cl", phone: "123" });
    expect(await snapshot("orders", orderId)).toMatchObject({
      customer_name: "N".repeat(80),
      customer_phone: null,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "PR3: create_checkout"`
Expected: FAIL — the live `create_checkout` writes no `customer_id` and no record, so the first case resolves instead of rejecting (`create_checkout` happily accepts an unknown `p_customer_id` today), and every `customer_id` assertion reports `null`.

- [ ] **Step 3: Append section 4 to the migration**

Append to `supabase/migrations/20260909130000_customer_directory_activate.sql`. **The body below is the live one from `20260707240000_booking_events_instrumentation.sql:8-66` with only the customer resolution and the two `customer_id` columns added — everything else is byte-identical on purpose:**

```sql

-- ── 4. create_checkout: crea/vincula la ficha (MISMA firma de 15 parámetros) ──
-- create or replace, nunca drop: checkout-repository.ts no se toca y el código vivo sigue
-- llamando igual (expand/contract). Con p_customer_id la ficha tiene que existir
-- (customer_not_found cubre la carrera entre elegir el cliente y guardar); sin él, el invitado
-- se resuelve por email con upsert_guest_customer — el MISMO escritor que usa la cortesía —,
-- que devuelve null si el email no pasa la puerta de forma (entonces la reserva queda sin
-- vincular, exactamente como hoy). INVARIANTE: el snapshot se lee de la fila DESPUÉS del
-- upsert, así un invitado que vuelve trae su teléfono nuevo y un titular de cuenta conserva
-- nombre y email. Consecuencia: orders.customer_email queda SIEMPRE en minúsculas.
create or replace function create_checkout(
  p_resource uuid, p_starts timestamptz, p_ends timestamptz,
  p_amount int, p_net int, p_tax int, p_currency text,
  p_customer jsonb, p_snapshot jsonb, p_lines jsonb,
  p_ttl interval default interval '10 minutes',
  p_customer_id uuid default null, p_points int default 0,
  p_terms_version text default null, p_terms_source text default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_res uuid; v_order uuid; v_line jsonb; v_balance int;
  v_cust  uuid := p_customer_id;
  v_name  text := nullif(left(trim(p_customer ->> 'name'), 80), '');
  v_email text := nullif(lower(trim(p_customer ->> 'email')), '');
  v_phone text := case when char_length(trim(p_customer ->> 'phone')) between 6 and 40
                       then trim(p_customer ->> 'phone') end;
begin
  perform expire_stale_holds(p_resource);

  if v_cust is not null then
    if not exists (select 1 from customers where id = v_cust) then
      raise exception 'customer_not_found';
    end if;
  else
    v_cust := upsert_guest_customer(v_name, v_email, v_phone);   -- null si el email no pasa la puerta
  end if;

  if v_cust is not null then
    select coalesce(c.name, v_name), c.email, coalesce(c.phone, v_phone)
      into v_name, v_email, v_phone
      from customers c where c.id = v_cust;
  end if;

  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at,
                            customer_name, customer_email, customer_phone, customer_id)
    values (p_resource, 'booking', 'held', p_starts, p_ends,
            case when p_ttl is null then null else now() + p_ttl end,
            v_name, v_email, v_phone, v_cust)
    returning id into v_res;

  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot,
                      terms_accepted_at, terms_version, terms_source, customer_id)
    values ('pending_payment', p_currency, p_amount, p_net, p_tax,
            v_name, v_email, v_phone, p_snapshot,
            case when p_terms_source is not null then now() end,
            case when p_terms_source is not null then p_terms_version end,
            p_terms_source, v_cust)
    returning id into v_order;

  update reservations set order_id = v_order where id = v_res;

  -- Bloque de canje: BYTE-IDÉNTICO al de 20260707240000 y sigue usando p_customer_id, NO
  -- v_cust. Hoy son el mismo valor cuando p_points > 0: el canje exige sesión
  -- (checkout-service.ts:62) y esa rama siempre pasa p_customer_id, así que v_cust nunca se
  -- reasignó (la rama del invitado solo corre con p_customer_id null, y entonces p_points = 0).
  -- Se deja el parámetro a propósito, para que este bloque quede idéntico al original y el
  -- diff de la migración muestre SOLO la resolución de la ficha y las dos columnas customer_id.
  -- Si alguna vez un canje pudiera llegar sin p_customer_id, esta línea debe pasar a v_cust.
  if p_points > 0 then
    select points_balance into v_balance from customers where id = p_customer_id for update;
    if v_balance is null then raise exception 'points_without_customer'; end if;
    if v_balance < p_points then raise exception 'insufficient_points'; end if;
    perform apply_points(p_customer_id, v_order, 'redeem', -p_points, '');
    update orders set points_redeemed_clp = p_points where id = v_order;
  end if;

  for v_line in select jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, line_type, reservation_id, addon_key, description,
                             quantity, unit_price_clp, subtotal_clp)
      values (v_order, v_line ->> 'line_type',
              case when v_line ->> 'line_type' = 'room_time' then v_res else null end,
              v_line ->> 'addon_key', v_line ->> 'description',
              coalesce((v_line ->> 'quantity')::int, 1),
              (v_line ->> 'unit_price_clp')::int, (v_line ->> 'subtotal_clp')::int);
  end loop;

  perform log_booking_event(v_res, 'created', p_order => v_order);

  if p_points > 0 and p_amount = 0 then
    perform confirm_payment(v_order, 'offline:puntos');
  end if;

  return v_order;
end;
$$;
```

- [ ] **Step 4: Apply and run the new tests to verify they pass**

```bash
npm run db:reset
npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts
```

Expected: PASS — the whole file, including every pre-existing case.

- [ ] **Step 5: Run the full integration suite and see exactly two files go red**

```bash
npm run test:integration
```

Expected: FAIL in **two** files only:
- `src/infrastructure/db/points.itest.ts` › `"sin perfil de cliente no otorga (el retro lo cubre al crear la cuenta)"` — the guest now has a record, so `points_ledger` has one row instead of zero.
- `src/infrastructure/db/booking-routes.itest.ts` › `"normaliza nombre y teléfono del body en el snapshot"` — `customer_name` is now `"Titular Adoptado"` (from the linked record) instead of the 80-character clamp of the typed name.

If any other file fails, stop and read it: it means an assumption in this plan is wrong.

- [ ] **Step 6: Rewrite the points case (a guest with a valid email now earns at payment)**

In `src/infrastructure/db/points.itest.ts`, replace the whole `it("sin perfil de cliente no otorga …")` block (line 160) with:

```ts
  // PR3: create_checkout crea la ficha del invitado en la misma transacción, así
  // que el earn cae EN VIVO al pagar en vez de esperar al signup. El saldo final
  // es idéntico al que produciría un retro posterior (points_ledger_once lo hace
  // no-op), y el claw-back de mark_refunded aplica desde ya.
  it("invitado con email válido: la ficha se crea en el checkout y el earn cae en vivo", async () => {
    const b = await book(600, { email: "invitado@points.cl" });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    await payWebhook(b.value.orderId, "pay2", HOUR_PRICE);

    const guest = (
      await pg.query<{ id: string }>("select id from customers where email='invitado@points.cl'")
    ).rows[0];
    expect(guest).toBeDefined();

    const earns = await pg.query<{ customer_id: string; amount: number }>(
      "select customer_id, amount from points_ledger where order_id=$1 and kind='earn'",
      [b.value.orderId],
    );
    expect(earns.rows).toHaveLength(1);
    expect(earns.rows[0]).toMatchObject({ customer_id: guest.id, amount: computeEarn(HOUR_PRICE) });

    // Un login posterior ADOPTA esa ficha y el retro ya no tiene nada que otorgar.
    expect((await pg.query<{ n: number }>("select award_retro_points($1) n", [guest.id])).rows[0].n).toBe(0);
    await expectBalanceConsistent(guest.id);
  });

  it("un email sin forma válida sigue sin ficha y sin puntos", async () => {
    const b = await book(660, { email: "a@b" });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    await payWebhook(b.value.orderId, "pay3", HOUR_PRICE);

    expect(Number((await pg.query<{ n: string }>("select count(*)::text n from customers where email='a@b'")).rows[0].n)).toBe(0);
    const rows = await pg.query("select 1 from points_ledger where order_id=$1", [b.value.orderId]);
    expect(rows.rowCount).toBe(0);
  });
```

- [ ] **Step 7: Rewrite the booking-routes snapshot case (the snapshot comes from the record)**

In `src/infrastructure/db/booking-routes.itest.ts`, replace the whole `it("normaliza nombre y teléfono del body en el snapshot", …)` block with:

```ts
  // PR3: con la ficha vinculada, el snapshot sale del REGISTRO, no del body. Un
  // titular de cuenta conserva su nombre y su email (ni un nombre de 120
  // caracteres se los pisa) y solo un teléfono vacío se llena con lo tipeado.
  it("el snapshot sale de la FICHA vinculada; el teléfono tipeado solo llena el que la ficha no tiene", async () => {
    const customerId = await adoptedCustomer(50_000);
    auth.session = { userId: AUTH_USER, email: AUTH_EMAIL };

    const res = await post(
      fullPointsBody(720, { customer: { email: AUTH_EMAIL, name: "N".repeat(120), phone: "962803298" } }),
    );
    expect(res.status).toBe(200);
    const { orderId } = await res.json();

    const snap = await pg.query<{
      customer_id: string;
      customer_name: string;
      customer_phone: string;
      customer_email: string;
    }>("select customer_id, customer_name, customer_phone, customer_email from orders where id = $1", [orderId]);
    expect(snap.rows[0]).toMatchObject({
      customer_id: customerId,
      customer_name: "Titular Adoptado",
      customer_phone: "+56962803298",
      customer_email: AUTH_EMAIL,
    });

    // La ficha del titular tampoco cambia de nombre por el camino del checkout.
    const rec = await pg.query<{ name: string; phone: string | null }>(
      "select name, phone from customers where id=$1",
      [customerId],
    );
    expect(rec.rows[0]).toEqual({ name: "Titular Adoptado", phone: null });
  });
```

- [ ] **Step 8: Run the full integration suite to verify everything passes**

```bash
npm run test:integration
```

Expected: PASS, all files.

- [ ] **Step 9: Confirm no types diff, restore the seed and commit**

```bash
npm run db:types && /opt/homebrew/bin/git diff --exit-code --stat src/infrastructure/db/database.types.ts
npm run db:reset
npx eslint . && npm test
/opt/homebrew/bin/git add supabase/migrations/20260909130000_customer_directory_activate.sql \
  src/infrastructure/db/customers-directory.itest.ts src/infrastructure/db/points.itest.ts \
  src/infrastructure/db/booking-routes.itest.ts
/opt/homebrew/bin/git commit -m "feat(db): create_checkout crea y vincula la ficha del cliente" \
  -m "Misma firma de 15 parámetros (create or replace). Con p_customer_id la ficha debe existir (customer_not_found); sin él, upsert_guest_customer resuelve al invitado por email. El snapshot se lee de la ficha, así orders.customer_email queda siempre en minúsculas." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Expected: the types diff prints nothing; eslint and unit tests exit 0.

---

### Task 4: The reschedule delta order inherits the customer

**Files:**
- Modify: `supabase/migrations/20260909130000_customer_directory_activate.sql` (append section 5)
- Test: `src/infrastructure/db/customers-directory.itest.ts` (new `describe` appended at the end)

**Interfaces:**
- Consumes: the live `create_reschedule_charge` body from `20260707240000_booking_events_instrumentation.sql:126-164`; the itest helpers `customer`, `booking`, `pay`, `snapshot`.
- Produces: `create_reschedule_charge` with the same `returns table(reschedule_id uuid, delta_order_id uuid)` signature, writing `customer_id` on the delta order alongside the name/email/phone it already copies.

- [ ] **Step 1: Write the failing test**

Append to the end of `src/infrastructure/db/customers-directory.itest.ts`:

```ts
describe("PR3: create_reschedule_charge copia el vínculo al pedido delta", () => {
  it("el pedido delta hereda customer_id junto al snapshot de contacto", async () => {
    const c = await customer({ name: "Delta", email: "delta@dir.cl", phone: "+56 9 5555 5555" });
    const b = await booking({
      name: "Delta",
      email: "delta@dir.cl",
      phone: "+56 9 5555 5555",
      customerId: c,
    });
    await pay(b.orderId, "dch1"); // paga y confirma la reserva

    const starts = new Date(Date.now() + 24 * 40 * 3_600_000);
    const ends = new Date(starts.getTime() + 3_600_000);
    const { rows } = await pg.query<{ delta_order_id: string }>(
      "select * from create_reschedule_charge($1, $2, $3, '{}'::jsonb, '[]'::jsonb, 2000, 1681, 319, null)",
      [b.reservationId, starts.toISOString(), ends.toISOString()],
    );

    expect(await snapshot("orders", rows[0].delta_order_id)).toEqual({
      customer_id: c,
      customer_name: "Delta",
      customer_email: "delta@dir.cl",
      customer_phone: "+56 9 5555 5555",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "create_reschedule_charge copia el vínculo"`
Expected: FAIL with `customer_id: null` where the record's id was expected (the live function copies only the three contact columns).

- [ ] **Step 3: Append section 5 to the migration**

Append to `supabase/migrations/20260909130000_customer_directory_activate.sql`. **Identical to `20260707240000:126-164` except `v_cust` and the two lines that carry it:**

```sql

-- ── 5. create_reschedule_charge: el pedido delta hereda el vínculo ──
-- MISMA firma. El pedido delta ya copiaba nombre/email/teléfono del pedido original; ahora copia
-- también customer_id, para que el pagador de MP, las notificaciones y una futura reasignación
-- (PR7 reescribe también los pedidos delta) vean al mismo cliente. INVARIANTE cumplido por
-- construcción: los cuatro valores salen de la MISMA fila de orders, que ya venía de la ficha.
create or replace function create_reschedule_charge(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb,
  p_delta int, p_delta_net int, p_delta_tax int, p_created_by uuid default null
) returns table(reschedule_id uuid, delta_order_id uuid)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_live int;
  v_name text; v_email text; v_phone text; v_currency text; v_cust uuid;
  v_delta_order uuid; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  select amount_clp - refunded_amount_clp, customer_name, customer_email, customer_phone, currency, customer_id
    into v_live, v_name, v_email, v_phone, v_currency, v_cust
    from orders where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0;
  if v_live is null then raise exception 'reschedule_not_eligible'; end if;
  if p_delta < 1 then raise exception 'reschedule_bad_delta'; end if;

  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, customer_id)
    values ('pending_payment', v_currency, p_delta, p_delta_net, p_delta_tax,
            v_name, v_email, v_phone, v_cust)
    returning id into v_delta_order;

  insert into reschedules (reservation_id, original_order_id, delta_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp,
      new_snapshot, new_lines, created_by)
    values (p_reservation, v_order, v_delta_order, 'charge', 'pending_charge',
      v_old_start, v_old_end, p_starts, p_ends, v_live, v_live + p_delta, p_delta, p_snapshot, p_lines, p_created_by)
    returning id into v_resched;

  perform log_booking_event(p_reservation, 'reschedule_charge_pending', p_order => v_delta_order,
    p_reschedule => v_resched, p_amount => p_delta, p_created_by => p_created_by,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', p_starts));

  return query select v_resched, v_delta_order;
end;
$$;
```

- [ ] **Step 4: Apply and run the tests to verify they pass**

```bash
npm run db:reset
npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts
npx vitest run --config vitest.integration.config.ts src/infrastructure/db/reschedule.itest.ts
```

Expected: PASS in both files. `reschedule.itest.ts` matters here: it is the suite that exercises `create_reschedule_charge`, `reschedule_down` and `apply_reschedule_charge` end to end, including the earn truing cases.

- [ ] **Step 5: Confirm no types diff, leave the repo green, restore the seed and commit**

```bash
npm run db:types && /opt/homebrew/bin/git diff --exit-code --stat src/infrastructure/db/database.types.ts
npx eslint . && npm run build
npm run db:reset
/opt/homebrew/bin/git add supabase/migrations/20260909130000_customer_directory_activate.sql src/infrastructure/db/customers-directory.itest.ts
/opt/homebrew/bin/git commit -m "feat(db): el pedido delta del reagendamiento hereda el cliente" \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Expected: no types diff (exit 0), and `eslint` and `build` exit 0 (the build type-checks the new itest case).

---

### Task 5: The courtesy path stops diverging from the checkout

**Files:**
- Modify: `src/infrastructure/db/admin-repository.ts` — `createCourtesyBooking`, currently starting at line 849 (its doc comment at 848)
- Modify (comment only, Step 4): `app/admin/(panel)/reservas/nueva/actions.ts` — the `notifyCourtesy` call at lines 76–78
- Test: `src/infrastructure/db/admin.itest.ts` (new cases appended inside the existing top-level `describe`)

**Interfaces:**
- Consumes: PR1's `upsert_guest_customer(p_name text, p_email text, p_phone text) returns uuid` (typed in `database.types.ts` as `Returns: string`; the real function returns null for an email that fails the gate, so cast `data as string | null`).
- Produces: `createCourtesyBooking(resourceId: string, startsAt: string, endsAt: string, customer: { name?: string; email?: string; phone?: string }, notes?: string, customerId?: string): Promise<string>` — throws `"slot_taken"` on `23P01` (unchanged) and `"customer_not_found"` when `customerId` names a record that no longer exists. **No caller passes `customerId` in PR3; PR5 wires the picker.** The courtesy branch of `app/admin/(panel)/reservas/nueva/actions.ts` already wraps the call in a `try/catch` that maps `slot_taken` and turns anything else into "No se pudo crear la reserva.", so the new sentinel can never leak into a toast; PR5 gives it its own sentence when the picker can actually produce it.

- [ ] **Step 1: Write the failing tests**

Append these cases to `src/infrastructure/db/admin.itest.ts`, right after the existing `it("cortesía con notas → 'Cortesía — …' y devuelve el id insertado", …)` block:

```ts
  // PR3: la cortesía no pasa por create_checkout, así que replica su semántica a
  // mano — mismo escritor de invitados (upsert_guest_customer), mismo invariante
  // de snapshot desde la ficha. Sin esto, agendar una cortesía con email dejaba
  // una reserva huérfana que el directorio nunca veía.
  it("cortesía con email: crea la ficha del invitado, la vincula y arma el snapshot desde ella", async () => {
    const { startsAt, endsAt } = rangeFor("2099-06-03", 600, 1, tz);
    const id = await repo.createCourtesyBooking(resourceId, startsAt, endsAt, {
      name: "  Invitada Cortesía  ",
      email: " Cortesia@Dir.CL ",
      phone: "+56 9 7777 6666",
    });

    const c = (
      await pg.query<{ id: string; name: string; phone: string }>(
        "select id, name, phone from customers where email='cortesia@dir.cl'",
      )
    ).rows[0];
    expect(c).toMatchObject({ name: "Invitada Cortesía", phone: "+56 9 7777 6666" });

    const r = await pg.query<{
      customer_id: string | null;
      customer_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
    }>("select customer_id, customer_name, customer_email, customer_phone from reservations where id=$1", [id]);
    expect(r.rows[0]).toEqual({
      customer_id: c.id,
      customer_name: "Invitada Cortesía",
      customer_email: "cortesia@dir.cl",
      customer_phone: "+56 9 7777 6666",
    });
  });

  it("cortesía con customerId: la ficha manda y el email tipeado no la pisa", async () => {
    const c = (
      await pg.query<{ id: string }>(
        "insert into customers (name, email, phone) values ('Ficha Elegida', 'elegida@dir.cl', '+56 9 1212 1212') returning id",
      )
    ).rows[0].id;
    const { startsAt, endsAt } = rangeFor("2099-06-04", 600, 1, tz);
    const id = await repo.createCourtesyBooking(
      resourceId,
      startsAt,
      endsAt,
      { name: "Tipeado", email: "tipeado@dir.cl", phone: undefined },
      undefined,
      c,
    );

    const r = await pg.query<{
      customer_id: string | null;
      customer_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
    }>("select customer_id, customer_name, customer_email, customer_phone from reservations where id=$1", [id]);
    expect(r.rows[0]).toEqual({
      customer_id: c,
      customer_name: "Ficha Elegida",
      customer_email: "elegida@dir.cl",
      customer_phone: "+56 9 1212 1212",
    });
    expect(
      Number((await pg.query<{ n: string }>("select count(*)::text n from customers where email='tipeado@dir.cl'")).rows[0].n),
    ).toBe(0);
  });

  it("cortesía solo con nombre (walk-in) o con email inválido: sin ficha y sin vínculo", async () => {
    const a = rangeFor("2099-06-05", 600, 1, tz);
    const soloNombre = await repo.createCourtesyBooking(resourceId, a.startsAt, a.endsAt, { name: "Walk In" });
    const b = rangeFor("2099-06-06", 600, 1, tz);
    const emailMalo = await repo.createCourtesyBooking(resourceId, b.startsAt, b.endsAt, {
      name: "Basura",
      email: "a@b",
    });

    const rows = await pg.query<{ customer_id: string | null; customer_email: string | null }>(
      "select customer_id, customer_email from reservations where id = any($1::uuid[]) order by starts_at",
      [[soloNombre, emailMalo]],
    );
    expect(rows.rows).toEqual([
      { customer_id: null, customer_email: null },
      { customer_id: null, customer_email: "a@b" },
    ]);
    expect(Number((await pg.query<{ n: string }>("select count(*)::text n from customers")).rows[0].n)).toBe(0);
  });

  it("cortesía con un customerId que ya no existe → customer_not_found", async () => {
    const { startsAt, endsAt } = rangeFor("2099-06-07", 600, 1, tz);
    await expect(
      repo.createCourtesyBooking(
        resourceId,
        startsAt,
        endsAt,
        { name: "X" },
        undefined,
        "e0000000-0000-4000-a000-0000000000fc",
      ),
    ).rejects.toThrow("customer_not_found");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/admin.itest.ts -t "cortesía"`
Expected: FAIL — cases 1, 2 and 4 are red. Vitest transpiles without type-checking, so the sixth argument is simply ignored at runtime (the type error shows up in `npm run build`, at Step 5): case 1 finds no record for `cortesia@dir.cl`, case 2 gets the typed values in the snapshot and `customer_id: null`, and case 4 resolves instead of rejecting. Case 3 passes already — it is the *unchanged* behaviour this task must not break.

- [ ] **Step 3: Rewrite `createCourtesyBooking`**

In `src/infrastructure/db/admin-repository.ts`, replace the whole `createCourtesyBooking` method with:

```ts
  /**
   * Reserva de cortesía: confirmada, sin pedido ni boleta (comp gratis). Devuelve el id.
   *
   * INVARIANTE (spec §"Invariante central"): quien escribe customer_id escribe también el
   * snapshot DESDE la ficha. La cortesía no pasa por create_checkout, así que replica su
   * semántica a mano: con `customerId` manda la ficha; sin id pero con email, la resuelve el
   * MISMO escritor de invitados que usa el checkout (`upsert_guest_customer`), que devuelve
   * null cuando el email no pasa la puerta de forma → la reserva queda sin vincular.
   *
   * Son dos sentencias (rpc + insert): un `slot_taken` en el insert deja la ficha creada. Es
   * dato válido de directorio, no un huérfano — decisión explícita de la spec.
   */
  async createCourtesyBooking(
    resourceId: string,
    startsAt: string,
    endsAt: string,
    customer: { name?: string; email?: string; phone?: string },
    notes?: string,
    customerId?: string,
  ): Promise<string> {
    let linkedId: string | null = customerId ?? null;

    if (linkedId === null && customer.email) {
      const { data: guestId, error: guestErr } = await this.db.rpc("upsert_guest_customer", {
        // El generador tipa los text params como `string` y el retorno como no-nulo; la
        // función SQL acepta NULL y devuelve NULL si el email no pasa la puerta. Los casts
        // documentan el gap, no cambian runtime.
        p_name: (customer.name ?? null) as unknown as string,
        p_email: customer.email,
        p_phone: (customer.phone ?? null) as unknown as string,
      });
      if (guestErr) throw new Error(guestErr.message);
      linkedId = (guestId as string | null) ?? null;
    }

    let snapName = customer.name ?? null;
    // El email tipeado se normaliza IGUAL que en create_checkout (`nullif(lower(trim(…)), '')`):
    // si upsert_guest_customer lo rechaza por forma, la reserva queda sin vincular pero con el
    // email guardado en la MISMA grafía que habría guardado el checkout público. Sin esto, la
    // cortesía y el checkout escribirían dos versiones del mismo email rechazado — justo la
    // divergencia que este método existe para cerrar (y `priorCustomerEmails` compara en minúsculas).
    let snapEmail = customer.email?.trim().toLowerCase() || null;
    let snapPhone = customer.phone ?? null;

    if (linkedId !== null) {
      const { data: rec, error: recErr } = await this.db
        .from("customers")
        .select("name, email, phone")
        .eq("id", linkedId)
        .maybeSingle();
      if (recErr) throw new Error(recErr.message);
      if (!rec) throw new Error("customer_not_found");
      snapName = rec.name ?? snapName;
      snapEmail = rec.email;
      snapPhone = rec.phone ?? snapPhone;
    }

    const { data, error } = await this.db
      .from("reservations")
      .insert({
        resource_id: resourceId,
        kind: "booking",
        status: "confirmed",
        starts_at: startsAt,
        ends_at: endsAt,
        customer_name: snapName,
        customer_email: snapEmail,
        customer_phone: snapPhone,
        customer_id: linkedId,
        notes: notes ? `Cortesía — ${notes}` : "Cortesía",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.code === "23P01" ? "slot_taken" : error.message);
    return data.id;
  }
```

- [ ] **Step 4: Flag the one thing the courtesy notification still reads from the form**

`createManualBookingAction` sends the courtesy email **after** the insert, from the *typed* values,
not from the record the insert just linked (`app/admin/(panel)/reservas/nueva/actions.ts:76-78`):

```ts
      // Best-effort: el email nunca voltea una reserva ya creada.
      await notificationService()
        .notifyCourtesy({ email: customer.email ?? null, name: customer.name ?? null, startsAt, addonNames })
        .catch((e) => console.error("[cortesia:notify]", e));
```

Leave the behaviour alone — the email must go to the address the staff typed — but add the comment
above it so the divergence is deliberate and visible, not an oversight:

```ts
      // Best-effort: el email nunca voltea una reserva ya creada.
      // OJO (PR3): esto manda el email/nombre TIPEADOS, mientras el snapshot de la reserva ya
      // salió de la ficha (`createCourtesyBooking` lee `customers` después del upsert). Pueden
      // diferir: una ficha con cuenta conserva SU nombre, y la ficha puede traer otro email si
      // se pasó `customerId`. Es a propósito — el aviso va a la dirección que el staff escribió—,
      // pero cuando PR5 conecte el picker hay que decidirlo explícito: la action ya devolverá
      // `customer: { name, phone }` del servidor y ese es el dato que debería alimentar el aviso.
      await notificationService()
        .notifyCourtesy({ email: customer.email ?? null, name: customer.name ?? null, startsAt, addonNames })
        .catch((e) => console.error("[cortesia:notify]", e));
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.integration.config.ts src/infrastructure/db/admin.itest.ts
npx vitest run --config vitest.integration.config.ts src/infrastructure/db/reservas-list.itest.ts
```

Expected: PASS in both. `reservas-list.itest.ts` calls `createCourtesyBooking` with four arguments through its own `courtesy()` helper (`:48-50`) — the two new parameters are optional, so it keeps compiling and passing untouched.

- [ ] **Step 6: Lint, type-check and commit**

```bash
npx eslint . && npm test && npm run build
npm run db:reset
/opt/homebrew/bin/git add src/infrastructure/db/admin-repository.ts src/infrastructure/db/admin.itest.ts \
  "app/admin/(panel)/reservas/nueva/actions.ts"
/opt/homebrew/bin/git commit -m "feat(admin): la cortesía crea y vincula la ficha del cliente" \
  -m "Sin id pero con email pasa por upsert_guest_customer, el mismo escritor del checkout, y el snapshot se lee de la ficha. El parámetro customerId queda listo para el picker de PR5." \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Expected: all three exit 0.

---

### Task 6: Map `customer_not_found` to staff copy

**Files:**
- Modify: `src/application/checkout/checkout-service.ts` — the `catch` block at lines 121–127
- Modify: `src/application/ports/checkout.ts` — the `customerId` doc comment at line 24
- Modify: `app/admin/(panel)/reservas/nueva/actions.ts` — `checkoutErrorMessage`, lines 19–27
- Test: `src/application/checkout/checkout-service.test.ts` (new case appended to the "canje de puntos" describe)

**Interfaces:**
- Consumes: Task 3's `create_checkout`, which now raises `customer_not_found` when `p_customer_id` names a record that does not exist. The Supabase adapter surfaces it as `new Error(error.message)` (`checkout-repository.ts:30`), so the service sees the literal inside the message.
- Produces: `CheckoutService.createBooking` returns `err("customer_not_found")`; `checkoutErrorMessage("customer_not_found")` returns **"El cliente ya no existe. Vuelve a seleccionarlo."** — the same sentence `customerDbErrorMessage` already uses for that sentinel. PR5's console and PR7's dialog inherit it.

- [ ] **Step 1: Write the failing test**

Append to `src/application/checkout/checkout-service.test.ts`, inside `describe("CheckoutService.createBooking — canje de puntos", …)`, right after the `"saldo insuficiente (raise de la DB) → insufficient_points"` case:

```ts
  // PR3: create_checkout exige que la ficha exista cuando se le pasa p_customer_id.
  // Cubre la carrera entre elegir el cliente en la consola y guardar la reserva.
  it("ficha borrada entre elegirla y guardar (raise de la DB) → customer_not_found", async () => {
    const repo: CheckoutRepository = {
      createCheckout: vi.fn().mockRejectedValue(new Error("customer_not_found")),
    };
    const svc = new CheckoutService(pricedPricing(), repo);

    const r = await svc.createBooking({ ...input, customerId: "cust-borrada" });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("customer_not_found");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/application/checkout/checkout-service.test.ts -t "customer_not_found"`
Expected: FAIL with `expected 'checkout_failed: customer_not_found' to be 'customer_not_found'` (the current catch falls through to the generic branch).

- [ ] **Step 3: Map the sentinel in `CheckoutService`**

In `src/application/checkout/checkout-service.ts`, replace the `catch` block (lines 121–127) with:

```ts
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // La ficha elegida ya no existe (carrera entre el picker y el guardado).
      if (/customer_not_found/i.test(msg)) return err("customer_not_found");
      if (/insufficient_points/i.test(msg)) return err("insufficient_points");
      if (/points_without_customer/i.test(msg)) return err("points_session");
      if (/exclusion|23P01|overlap|conflict/i.test(msg)) return err("slot_taken");
      return err(`checkout_failed: ${msg}`);
    }
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run src/application/checkout/checkout-service.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Give the staff the sentence, and update the port doc**

In `app/admin/(panel)/reservas/nueva/actions.ts`, add one line to `checkoutErrorMessage`. Replace this exact line (currently line 22, the `discount:` branch):

```ts
  if (code.startsWith("discount:")) return code.slice("discount:".length);
```

with:

```ts
  if (code.startsWith("discount:")) return code.slice("discount:".length);
  if (code === "customer_not_found") return "El cliente ya no existe. Vuelve a seleccionarlo.";
```

Leave the rest of the mapper (`slot_taken`, `too_soon`, `sin tarifa`, the generic fallback) untouched.

In `src/application/ports/checkout.ts`, replace the `customerId` doc line (line 24) with:

```ts
  /**
   * Ficha del directorio a la que se vincula la reserva (`customers.id`, NUNCA
   * `auth.users.id`). Desde PR3 la DB exige que exista: si no, `create_checkout`
   * levanta `customer_not_found` y el servicio devuelve ese mismo código. Sigue
   * siendo además el row lock del canje de puntos.
   */
  customerId?: string;
```

- [ ] **Step 6: Lint, type-check and commit**

```bash
npx eslint . && npm test && npm run build
/opt/homebrew/bin/git add src/application/checkout/checkout-service.ts src/application/checkout/checkout-service.test.ts \
  src/application/ports/checkout.ts "app/admin/(panel)/reservas/nueva/actions.ts"
/opt/homebrew/bin/git commit -m "feat(checkout): mapear customer_not_found a copy para el staff" \
  -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Expected: all three exit 0.

---

### Task 7: Full verification and PR body (do NOT push)

**Files:** none new; writes `/tmp/directorio-pr3-body.md` (scratch).

**Interfaces:**
- Consumes: everything committed in Tasks 0–6 on `feat/directorio-clientes-activacion`.
- Produces: a verified branch and a ready PR body carrying the production pre-flight and post-migration verification queries. **The push and `gh pr create` happen only after a whole-branch review** — this task stops before them.

- [ ] **Step 1: Lint, unit tests, build**

Run: `npx eslint . && npm test && npm run build`
Expected: all exit 0. `npm run build` type-checks the itests too (`tsconfig.json` includes `**/*.ts`).

- [ ] **Step 2: Prove the migration changed no generated types**

```bash
npm run db:reset
npm run db:types
/opt/homebrew/bin/git diff --exit-code --stat src/infrastructure/db/database.types.ts
```
Expected: **no output and exit 0** from the diff (`--exit-code`; plain `git diff --stat` always exits 0 and would hide a real diff). PR3 replaces function bodies and writes data; it adds no table, column or signature.

- [ ] **Step 3: Integration from a clean seed, then restore the seed**

Run: `npm run db:reset && npm run test:integration && npm run db:reset`
Expected: all green, and the seed back in place afterwards.

- [ ] **Step 4: Prove the migration itself is what changed (and read it once, end to end)**

```bash
/opt/homebrew/bin/git diff --stat main -- supabase/
cat supabase/migrations/20260909130000_customer_directory_activate.sql
grep -nF '\\' supabase/migrations/20260909130000_customer_directory_activate.sql
```
Expected: exactly one file under `supabase/` (`supabase/seed.sql` must NOT appear — PR1 already seeded the directory); the five sections in order (1 sync · 2 backfill · 3 retro · 4 `create_checkout` · 5 `create_reschedule_charge`); and the `grep -F` prints **nothing** and exits 1 — a double backslash anywhere in a migration regex is the bug the spec's §"Reglas de higiene SQL" #1 warns about. (Single backslashes in `'^[^\s@]+…'` are correct and this grep does not match them.)

- [ ] **Step 5: Manual smoke (local only), then stop dev**

⚠️ `npm run dev` **blocks the shell until you kill it** — run it in the BACKGROUND, or nothing below
this line ever executes:

```bash
npm run dev > /tmp/pr3-dev.log 2>&1 &
echo $! > /tmp/pr3-dev.pid
# esperar a que levante (CLAUDE.md: siempre reiniciar dev después de un build)
until curl -sf -o /dev/null http://localhost:3000; do sleep 1; done
```

**When the smoke is done, stop it** (leaving it running holds port 3000 and a stale `.next`):

```bash
kill "$(cat /tmp/pr3-dev.pid)" && rm -f /tmp/pr3-dev.pid
```

Checks inside the DB container (`psql` is not installed on this machine):

```bash
docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
  "select count(*) fichas from customers;
   select count(*) sin_vincular from orders where customer_id is null and customer_email is not null;"
docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
  "select customer_id, customer_name, customer_email, customer_phone from orders order by created_at desc limit 1;"
```

- `/reservar` as a guest with a **mixed-case** email and a phone → the last query shows a non-null `customer_id` and the email lowercase; a second booking with the same email and a new phone updates the record's phone.
- `/admin/reservas/nueva` → **cortesía** typing a new email → the reservation gets a `customer_id` and a record appears in `customers`; **cortesía** with only a name → `customer_id` null, no record.
- `/admin/reservas/nueva` → **efectivo** with an email → linked order and reservation.
- `/cuenta` login as `felipe.munoz@outlook.cl` (Mailpit at `http://127.0.0.1:54424`) → balance 4.498 intact. `/cuenta/perfil`: **clear the Nombre field** and save a new phone → the record loses its name and gains the phone, and his upcoming reservation is **untouched** (name and phone exactly as before). That is the *current* behaviour and it must not change: `/cuenta/perfil` still goes through the narrow `updateNamePhone`, which does not propagate — the re-point at `update_customer_contact` is PR4 (decision 4).
- **Then eyeball the actual regression this PR prevents**, which no page reaches yet — call the fixed helper by hand on Felipe's record and confirm it *fills* rather than *blanks*:

  ```bash
  docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
    "select id, name, phone from customers where email='felipe.munoz@outlook.cl';
     select id, customer_name, customer_phone from reservations
      where customer_email='felipe.munoz@outlook.cl' order by starts_at desc limit 3;"
  docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
    "select customer_sync_snapshots('<id de la ficha>', 'felipe.munoz@outlook.cl');"
  docker exec supabase_db_fotf-studios-final-build psql -U postgres -d postgres -c \
    "select id, customer_name, customer_phone, customer_email from reservations
      where customer_email='felipe.munoz@outlook.cl' order by starts_at desc limit 3;"
  ```

  Expected: with the record's `name` now NULL and its `phone` new, the reservation **keeps** "Felipe Muñoz" (coalesce) and **gains** the new phone, and its email is unchanged. Before Task 1 the same call blanked the name. Check it by eye, not only by test.

- [ ] **Step 6: Write the PR body** to `/tmp/directorio-pr3-body.md`:

````markdown
## Qué

PR3 de la cadena "Directorio de clientes" — la **activación**. Desde este deploy toda reserva
nueva queda vinculada a una ficha de `customers`, y el historial existente pasa a estarlo.
Spec: `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` ·
Plan: `docs/superpowers/plans/2026-09-10-directorio-clientes-pr3-activacion.md`.

Migración `supabase/migrations/20260909130000_customer_directory_activate.sql`, en cinco secciones:

1. **`customer_sync_snapshots` deja de ser destructivo** (precondición, va primero). El email de
   la ficha sigue mandando —las ocho funciones de puntos resuelven al cliente con
   `c.email = lower(o.customer_email)`—, pero **nombre y teléfono se coalescean** contra lo que ya
   tenía el pedido/reserva. Es el arreglo del defecto que encontró la revisión de PR2: en prod las
   **3** fichas tienen `name` y `phone` vacíos mientras **13** reservas llevan nombre y **5**
   llevan teléfono, así que la versión anterior borraba contacto de reservas pagadas y confirmadas
   en cuanto alguien guardaba su perfil.
2. **`select backfill_customers_from_bookings();`** — una ficha por `lower(customer_email)` que pase
   la puerta de forma, nombre y teléfono elegidos por independiente (pagadas/confirmadas primero,
   luego la más reciente), fichas existentes solo con los NULL rellenados, y vínculo de pedidos,
   reservas y reservas-a-través-de-su-pedido.
3. **Retro de puntos** para toda ficha con email (idempotente por `points_ledger_once`), así
   `/admin/clientes` muestra saldos reales en vez de "0 pts" hasta el signup. Solo otorga cuando el
   monto **piso** es mayor que cero: `award_retro_points` asienta `floor(0.05 · (amount_clp −
   refunded_amount_clp))` y `points_ledger_sign` exige `amount > 0` para un `earn`, así que un
   pedido de menos de 20 CLP netos (o uno ya reembolsado por completo) no genera fila.
4. **`create_checkout`** (`create or replace`, **misma firma de 15 parámetros**, sin `drop`): con
   `p_customer_id` la ficha tiene que existir (`customer_not_found`); sin él, el invitado se
   resuelve por email con `upsert_guest_customer` en la misma transacción. El snapshot se lee de la
   fila **después** del upsert → un invitado que vuelve trae su teléfono nuevo y un titular de
   cuenta conserva nombre y email. Escribe `customer_id` en la reserva y en el pedido.
5. **`create_reschedule_charge`** (misma firma): el pedido delta copia también `customer_id`.

Y dos cambios de código:

- **Cortesía** (`admin-repository.ts`): gana un `customerId` opcional y, sin id pero con email, pasa
  por `upsert_guest_customer` — el mismo escritor del checkout — antes de insertar, con el snapshot
  leído de la ficha. Deja de divergir del camino público. (El `customerId` no tiene caller hasta PR5.)
- **`CheckoutService`** mapea `customer_not_found` y `/admin/reservas/nueva` lo muestra como
  "El cliente ya no existe. Vuelve a seleccionarlo." (cubre la carrera entre elegir y guardar).

## Cambios de comportamiento

1. **`orders.customer_email` y `reservations.customer_email` quedan siempre en minúsculas** (antes:
   tal como se tipeó). `priorCustomerEmails` y `computeAnalytics` ya normalizaban de los dos lados;
   hay itest que lo fija.
2. **Un invitado con email válido gana puntos al pagar**, no al crear la cuenta. El saldo final es
   idéntico al que produciría un retro posterior (`points_ledger_once` lo hace no-op) y el
   claw-back de `mark_refunded` aplica en vivo. **El canje sigue exigiendo sesión** en `/cuenta`.
3. **El snapshot de una reserva con ficha vinculada sale del registro**, no del formulario: el
   nombre de un titular de cuenta no lo pisa lo tipeado, y solo un teléfono vacío se llena.
4. **Agendar una cortesía con email crea una ficha** (dato válido de directorio). Un `slot_taken`
   deja la ficha creada: son dos sentencias, y es una decisión explícita de la spec.
5. **El nombre se recorta a 80 caracteres y un teléfono fuera de 6–40 caracteres se guarda como
   null** en el snapshot del checkout (los mismos topes de `customers_name_len`/`customers_phone_len`).

## Por qué

PR1 dejó el esquema y las funciones definidas pero **sin ejecutar**; PR2 cortó la suposición
`customers.id = auth.users.id` en el código. Hasta hoy ninguna reserva creaba ficha y el historial
seguía siendo texto libre. Esto lo activa, en un PR que se puede revisar por partes y con la
precondición del sync arriba de todo.

## Qué NO hace

- **No arregla el sobre-otorgamiento conocido de `award_retro_points`** sobre pedidos delta de
  reagendamiento (recorre todos los pedidos del email). Tiene su propio PR. **No puede dispararse
  en este backfill:** prod tiene **0 reagendamientos** y **0 filas en `points_ledger`**.
- **No re-apunta `/cuenta/perfil` a `update_customer_contact`.** El escritor angosto provisorio de
  PR2 (`updateNamePhone`) **sigue en su lugar**, y guardar el perfil sigue **sin** propagar el
  snapshot ni correr el retro. El código es correcto y está listo, pero no puede ir acá: Vercel
  despliega en el push mientras el job `migrate` de prod espera aprobación, así que habría una
  ventana con el código nuevo llamando al `customer_sync_snapshots` **viejo** (destructivo) — el
  defecto exacto que este PR arregla, contra 13 reservas con nombre. **Va en PR4**, que por la
  regla de la cadena se mergea recién con este `migrate` aprobado y verde.
- Sin UI nueva: el picker (PR5), `/admin/clientes` (PR6) y "Cambiar cliente" (PR7) siguen pendientes,
  igual que el permiso `customers.manage` (PR4).
- No toca `assign_booking_customer` (sigue pisando el snapshot a propósito: reasignar es cambiar de
  dueño), ni `checkout-repository.ts`, ni `supabase/seed.sql`, ni `database.types.ts`.
- Sin fusionar ni eliminar clientes; sin canje ni ajuste manual de puntos desde el admin.

## ⚠️ Esta migración CAMBIA DATOS de producción

A diferencia de PR1, acá no se agrega esquema: se escribe. Medido en prod el **2026-09-10**:

| Antes | Después (esperado) |
|---|---|
| 3 fichas, todas sin nombre ni teléfono | **10** fichas (7 creadas por el backfill) |
| 0 pedidos vinculados | **todos** los pedidos con email vinculados; **0** sin vincular |
| `points_ledger` vacío (0 filas) | una fila `earn` por pedido pagado/cumplido/reembolsado con email **cuyo `floor(0.05 · (amount_clp − refunded_amount_clp))` sea > 0** (`award_retro_points` no asienta 0) |
| 6 pedidos pagados · 0 reagendamientos | sin cambios |

Ninguna de las 3 fichas existentes comparte email con una reserva, así que **no se fusiona nada**;
solo se les rellenan los NULL de nombre/teléfono si su email aparece en el historial.

### Pre-flight en prod (SOLO LECTURA, antes de aprobar el job `migrate`)

```sql
-- 1) Punto de partida del directorio (esperado hoy: 3 / 0 / 0).
select count(*) total, count(name) con_nombre, count(phone) con_telefono from customers;

-- 2) Cuántas fichas creará el backfill (esperado: 7 a crear, directorio final 10).
with valid as (
  select distinct lower(customer_email) email from orders
   where customer_email is not null
     and lower(customer_email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
     and char_length(lower(customer_email)) <= 120
  union
  select distinct lower(customer_email) from reservations
   where kind = 'booking' and customer_email is not null
     and lower(customer_email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
     and char_length(lower(customer_email)) <= 120)
select count(*) emails_validos,
       count(*) filter (where not exists (select 1 from customers c where c.email = v.email)) a_crear
  from valid v;

-- 3) Qué quedará SIN vincular por email inválido (esperado: 0 y 0). El backfill aplica DOS
--    filtros, no uno: la forma Y el tope de 120 caracteres (CTE `valid` de
--    backfill_customers_from_bookings, espejo de upsert_guest_customer). Mirar solo la forma
--    contaría como "vinculable" un email larguísimo que el backfill igual va a saltear.
select count(*) pedidos_sin_vinculo from orders
 where customer_email is not null
   and (lower(customer_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
        or char_length(lower(customer_email)) > 120);
select count(*) reservas_sin_vinculo from reservations
 where kind = 'booking' and customer_email is not null
   and (lower(customer_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
        or char_length(lower(customer_email)) > 120);

-- 4) Cuántos puntos otorgará el retro (esperado: ledger vacío y ~5% del efectivo retenido).
--    La estimación tiene que aplicar los MISMOS dos filtros que award_retro_points
--    (20260704113000:424-445), o sobre-cuenta:
--      a) el email del pedido debe RESOLVER a una ficha — la función hace
--         `lower(o.customer_email) = c.email`, y tras el backfill esa ficha existe exactamente
--         para los emails que pasan la puerta de forma y miden ≤ 120;
--      b) el monto se PISA: `v_earn := floor(0.05 * retenido)` y solo se asienta `if v_earn > 0`
--         (points_ledger_sign exige amount > 0 para un 'earn'), así que un pedido con menos de
--         20 CLP retenidos —o completamente reembolsado— NO genera fila ni suma puntos.
select count(*) filas_ledger from points_ledger;                     -- DEBE ser 0
select count(*) pedidos_que_otorgan,
       coalesce(sum(floor(0.05 * (amount_clp - refunded_amount_clp))), 0) puntos_estimados
  from orders o
 where o.status in ('paid', 'fulfilled', 'refunded')
   and o.customer_email is not null
   and lower(o.customer_email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
   and char_length(lower(o.customer_email)) <= 120
   and floor(0.05 * (o.amount_clp - o.refunded_amount_clp)) > 0;

-- 5) El sobre-otorgamiento conocido de award_retro_points solo aplica con pedidos delta.
--    Esperado: 0 y 0. Si NO son 0, PARAR y no aprobar: hay que arreglar la función primero.
select count(*) reagendamientos from reschedules;
select count(*) pedidos_delta from orders o
 where exists (select 1 from reschedules r where r.delta_order_id = o.id);

-- 6) El backfill nunca fusiona en silencio: emails que difieren solo por caso/espacios.
--    Esperado: vacío (la guarda de PR1 ya lo habría abortado, pero se vuelve a mirar).
select lower(trim(email)), count(*) from customers group by 1 having count(*) > 1;

-- 7) ⚠️ LÍNEA BASE DEL CONTACTO — el gate REAL del arreglo de la sección 1.
--    ANOTAR los cuatro números: se repiten VERBATIM en la verificación de después y NINGUNO
--    puede haber BAJADO. Cualquier caída es la regresión destructiva del sync, que es
--    justamente lo que este PR existe para prevenir. Medido en prod el 2026-09-10:
--    reservas → 13 con nombre / 5 con teléfono.
--    (No sirve contar "vinculadas sin nombre": antes de la migración no hay ninguna vinculada,
--     así que ese conteo lo mueve el propio backfill y no distingue el arreglo del daño.)
select count(*) filter (where customer_name  is not null and customer_name  <> '') reservas_con_nombre,
       count(*) filter (where customer_phone is not null and customer_phone <> '') reservas_con_telefono
  from reservations where kind = 'booking';
select count(*) filter (where customer_name  is not null and customer_name  <> '') pedidos_con_nombre,
       count(*) filter (where customer_phone is not null and customer_phone <> '') pedidos_con_telefono
  from orders;
```

Condición para aprobar: **(3) en 0**, **(5) en 0 y 0**, **(6) vacío**, (2) coincidiendo con las
7 fichas esperadas, y **(7) anotado** (13 / 5 en reservas hoy) — sin ese número la verificación de
después no puede detectar nada. Si (2) da otro número, no es necesariamente un bloqueo — pero hay
que entender por qué antes de aprobar.

### Verificación en prod DESPUÉS de aplicar

Los seis primeros bloques son **solo lectura**. El último **NO lo es** — está marcado aparte.

```sql
select count(*) fichas from customers;                                -- 10
select count(*) from orders
 where customer_id is null and customer_email is not null;            -- 0
select count(*) from reservations
 where kind = 'booking' and customer_id is null and customer_email is not null;  -- 0
select count(*) filas, coalesce(sum(amount), 0) puntos from points_ledger;       -- earn del retro

-- El invariante contable del sistema: saldo == suma del ledger, para TODOS.
select c.id, c.points_balance, coalesce(sum(p.amount), 0) ledger
  from customers c left join points_ledger p on p.customer_id = c.id
 group by c.id, c.points_balance
having c.points_balance <> coalesce(sum(p.amount), 0);                -- DEBE ser vacío

-- ⚠️ GATE DE APROBACIÓN/ROLLBACK: ningún snapshot perdió contacto (lo que arregla la sección 1).
--    Es la consulta (7) del pre-flight, VERBATIM. Comparar los cuatro números con los anotados
--    ANTES de aplicar: pueden SUBIR (el backfill rellena huecos) pero NINGUNO puede BAJAR.
--    Una sola baja = el sync destructivo corrió → parar, revertir el código (rollback 1) y
--    reconstruir el contacto perdido desde el PITR (rollback 6). Hoy en prod: 13 / 5 en reservas.
select count(*) filter (where customer_name  is not null and customer_name  <> '') reservas_con_nombre,
       count(*) filter (where customer_phone is not null and customer_phone <> '') reservas_con_telefono
  from reservations where kind = 'booking';
select count(*) filter (where customer_name  is not null and customer_name  <> '') pedidos_con_nombre,
       count(*) filter (where customer_phone is not null and customer_phone <> '') pedidos_con_telefono
  from orders;
```

**Y una última comprobación que ESCRIBE (no va en el bloque de solo lectura):** la idempotencia del
backfill. `backfill_customers_from_bookings()` no es una consulta — inserta fichas, rellena NULLs y
setea `customer_id`. Correrla es seguro y es justamente lo que se quiere demostrar (que ya no queda
nada por hacer), pero hay que llamarla a sabiendas y **volver a correr el gate de contacto de
arriba** después:

```sql
-- ESCRIBE. Esperado: 0 fichas nuevas.
select backfill_customers_from_bookings();                            -- 0
```

Y en la app: `/reservar` como invitado nuevo → el pedido queda con `customer_id`; `/cuenta` de un
cliente con historial → su saldo ahora refleja el retro.

### Rollback

Las migraciones son **forward-only** (`DEPLOY.md` § Rollback), pero el archivo se aplica **en UNA
sola transacción**: `npx supabase db push --linked` envuelve cada migración en un `BEGIN…COMMIT`, así
que una falla en cualquiera de las cinco secciones deja **nada** aplicado — no hay estado a medias
que reconciliar a mano, y el job `migrate` se puede simplemente **re-correr** después del arreglo. El
archivo además es **re-ejecutable** por diseño (`create or replace` en todas las funciones;
`backfill_customers_from_bookings()` y `award_retro_points()` son idempotentes), así que re-correrlo
tras una falla parcial aparente tampoco duplica nada.

Si la migración sí se aplicó completa y el backfill produce algo inesperado:

1. **Primero, el código.** Vercel → Deployments → *Promote to Production* del último deploy bueno.
   Es seguro: las firmas de `create_checkout` y `create_reschedule_charge` no cambiaron y las
   columnas que escriben son nullable, así que el código anterior convive con el esquema nuevo.
2. **Puntos otorgados de más.** El ledger es **append-only**: nunca borrar filas. Se revierte
   sumando, con una ref propia y trazable:
   `select apply_points('<customer>', '<order>', 'adjust', -<n>, 'rollback:pr3:<motivo>');`
   Después, re-verificar el invariante `points_balance == sum(points_ledger)` con la consulta de
   arriba.
3. **Ficha creada de más.** ⚠️ **Mirar el ledger PRIMERO.** `orders.customer_id` y
   `reservations.customer_id` son `on delete set null` (se desvinculan sin perder el snapshot),
   pero **`points_ledger.customer_id` es `on delete CASCADE`**
   (`20260704113000_customers_points.sql:33`): borrar una ficha con puntos **destruye asientos de un
   ledger append-only** —lo que el punto 2 prohíbe explícitamente— y de paso borra las claves
   `(order_id, kind, ref)` que hacen idempotente al retro, así que un `award_retro_points` posterior
   volvería a otorgar. Doble daño, silencioso.

   ```sql
   select count(*) from points_ledger where customer_id = '<id>';   -- SIEMPRE primero
   ```

   - **= 0** → recién ahí `delete from customers where id = '<id>';`.
   - **> 0** → **NO borrar nunca.** Neutralizar sumando, igual que el punto 2:
     `select apply_points('<id>', '<order>', 'adjust', -<n>, 'rollback:pr3:<motivo>');` por cada
     asiento a revertir, y re-apuntar los pedidos afectados a la ficha correcta
     (`update orders set customer_id = '<correcto>' where id = '<order>';` +
     `select customer_sync_snapshots('<correcto>', null);`, punto 4). La ficha sobrante queda con
     saldo 0 y sin vínculos: es ruido del directorio, editable desde PR6, no un incidente.
   - Re-verificar después el invariante `points_balance == sum(points_ledger)`.
4. **Vínculo equivocado sin ficha sobrante.** `update orders set customer_id = '<correcto>' where
   id = '<order>';` seguido de `select customer_sync_snapshots('<correcto>', null);` para dejar el
   snapshot coherente con la ficha (el invariante). `assign_booking_customer` NO se usa acá: llega
   con PR7 y además exige reserva vigente.
5. **Revertir los cuerpos de las funciones.** Nueva migración con `create or replace` pegando los
   cuerpos de `supabase/migrations/20260707240000_booking_events_instrumentation.sql`
   (`create_checkout` líneas 8–66, `create_reschedule_charge` líneas 126–164) y el
   `customer_sync_snapshots` de `20260909120000_customer_directory.sql` líneas 138–157. Nunca
   `drop function`: rompería `checkout-repository.ts`.

   ⚠️ **Revertir `customer_sync_snapshots` a la versión de PR1 es volver a poner la versión
   DESTRUCTIVA en producción.** No se hace sola: **hay que revertir también el código** (paso 1) a
   un deploy anterior a PR4, porque desde PR4 `/cuenta/perfil` guarda por `update_customer_contact`
   → `customer_sync_snapshots`, y con el cuerpo viejo el primer cliente que guarde su perfil con un
   campo en blanco borra ese dato en todo su historial. Orden obligatorio: **código primero, cuerpo
   de la función después**. Si solo hace falta revertir `create_checkout` /
   `create_reschedule_charge`, revertir **solo esos dos** y dejar el sync coalescente en su lugar —
   es el arreglo, no parte del cambio riesgoso.
6. **Incidente grave** (invariante contable roto en varias fichas): restaurar desde el PITR/backup
   de Supabase, con el código ya revertido.

## Verificación local

`npx eslint .` · `npm test` · `npm run test:integration` · `npm run build` — todo exit 0, y
`git diff main -- src/infrastructure/db/database.types.ts` vacío (PR3 no cambia esquema). Smoke con
el stack local: checkout público de invitado (ficha creada, email en minúsculas, teléfono nuevo
actualizado al volver), cortesía con email (ficha creada y vinculada) y sin email (sin ficha),
reserva manual en efectivo, y `/cuenta/perfil` guardando con el nombre en blanco → la ficha pierde
el nombre y la reserva próxima queda **intacta** (sigue por el escritor angosto: el re-apunte es
PR4). El arreglo del sync se comprueba llamando `customer_sync_snapshots` a mano sobre esa ficha:
la reserva **conserva** su nombre y **recibe** el teléfono nuevo.

⚠️ **No verificar nada de esto en el Preview de Vercel**: el preview corre contra la **base de
staging**, que no tiene esta migración hasta que `migrate-staging` la aplique en el merge. Ahí los
cuerpos viejos siguen vivos.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

- [ ] **Step 7: Summarize the branch for review — do NOT push.**

```bash
/opt/homebrew/bin/git log --oneline main..HEAD
/opt/homebrew/bin/git diff --stat main
/opt/homebrew/bin/git status --short
```

Expected: **seven** commits (Tasks 0–6), a clean tree, exactly one new file under `supabase/`, and no `database.types.ts` and no `supabase/seed.sql` in the diff. The docs commit (Task 0) carries **two** files: this plan and the spec patch. **Stop here.** The push and

```bash
/opt/homebrew/bin/git push -u origin feat/directorio-clientes-activacion
/opt/homebrew/bin/gh pr create --title "feat(db): activar vínculo cliente ↔ reserva" --body-file /tmp/directorio-pr3-body.md
```

happen only **after** a whole-branch review has been requested and its findings resolved (see `superpowers:requesting-code-review`).

Before squash-merging, three gates that are not in CI:
1. **Confirm the staging Supabase project is awake** (dashboard). A paused free project fails `migrate-staging`, and `migrate` (prod) never gets offered for approval — the code would go live without the backfill.
2. **Run the pre-flight queries above against production** and check the five approval conditions before clicking approve on the `migrate` job — including **writing down query (7)**, the contact baseline (13 names / 5 phones on reservations today). Without it the post-migration check cannot detect the destructive-sync regression.
3. **Do not exercise `/cuenta/perfil` (or judge linking) on the Vercel preview.** Preview runs against the **staging** database, which does not have this migration until `migrate-staging` runs on merge — the old, destructive function bodies are still live there.

PR4 (`feat(rbac): customers.manage` **+ el re-apunte de `/cuenta/perfil`**) branches from `main` once this one is squash-merged **and its `migrate` job is approved and green** — that approval is precisely what closes the deploy window that keeps the profile re-point out of PR3 (decision 4).

---

## Riesgos y casos borde de este PR

- **El backfill escribe en prod.** No borra ni pisa nada no-nulo: solo inserta fichas faltantes,
  rellena NULLs de fichas existentes y setea `customer_id` donde estaba en null. Medido: 7 fichas
  nuevas, 0 fusiones, 0 pedidos sin vincular. Es re-ejecutable y la segunda corrida devuelve 0.
- **Sobre-otorgamiento conocido de `award_retro_points`** (recorre también los pedidos delta de
  reagendamiento, cuyo earn vive en el pedido principal): **no se arregla acá** y **no puede
  dispararse** — prod tiene **0 reagendamientos** y **0 filas en `points_ledger`** al momento de
  esta migración (medido 2026-09-10). Tiene su propio PR. La consulta (5) del pre-flight lo
  vuelve a comprobar antes de aprobar; si dejara de ser 0, no aprobar.
- **Ventana de deploy.** Vercel despliega en el push mientras el job `migrate` de prod espera
  aprobación de un revisor, así que hay un intervalo con **código nuevo sobre esquema viejo**. Este
  PR está construido para tolerarlo en las dos direcciones: el código nuevo tolera el esquema viejo
  (las funciones se reemplazan, no se agregan; `customer_id` ya existe desde PR1) y el esquema
  nuevo tolera el código viejo (columnas nullable). Lo único que se pierde si el `migrate` tarda
  son los vínculos de las reservas creadas en esa ventana — el backfill es re-ejecutable y los
  cierra. **Es exactamente esta ventana la que deja el re-apunte de `/cuenta/perfil` fuera de este
  PR** (decisión 4): re-apuntarlo acá pondría código llamando al `customer_sync_snapshots` viejo
  —destructivo— contra 13 reservas con nombre. Va en PR4, después de esta aprobación.
- **Staging pausado = migración de prod silenciosamente saltada.** `migrate` depende de
  `migrate-staging`; un proyecto free pausado hace fallar el canario y el job de prod nunca se
  ofrece para aprobación. Verificar antes del merge (gate 1 arriba).
- **Cortesía = dos sentencias** (rpc + insert): un `slot_taken` en el insert deja la ficha creada.
  Dato válido de directorio, no un huérfano; decisión explícita de la spec.
- **Ruido en el directorio** por holds abandonados o bots: solo se crean fichas con email de forma
  válida, dentro de la transacción del checkout. Son buscables y editables desde PR6.
- **Una ficha solo-teléfono vinculada a un pedido deja `customer_email` en null** en ese pedido, y
  entonces no gana puntos al pagarse. Es coherente con la decisión 3 del dueño (los puntos cuelgan
  del email) y con `customer_assign_needs_email`; no es alcanzable desde la app hasta PR5.
- **`/cuenta/perfil` NO cambia en este PR.** Sigue por el escritor angosto `updateNamePhone` de
  PR2: no propaga snapshots ni dispara `award_retro_points`. El re-apunte —y con él la propagación
  y el retro idempotente al guardar el perfil— llega en PR4 (decisión 4). No borrar `updateNamePhone`
  de `src/application/ports/customers.ts`, de `src/infrastructure/db/customer-repository.ts`, de
  `CustomerService.updateProfileByUser` ni de los fakes de test.
- **Preview de Vercel sobre staging sin la migración.** El preview de este PR corre contra la base
  de staging, que recibe la migración recién en el merge (`migrate-staging`): ahí siguen vivos el
  `customer_sync_snapshots` destructivo y el `create_checkout` sin vínculo. El preview sirve para
  build y páginas estáticas; **no** para juzgar este PR, y **no** hay que guardar `/cuenta/perfil`
  en él.
