# Supabase Schema Audit — FOTF Studios
_Date 2026-07-07 · local stack, Postgres 17.6, 27 migrations · read-only + rolled-back probes_

## Executive summary

The schema is in strong shape for its scale. The security model is coherent and correct where it counts: **every one of the ~23 public functions is `SECURITY INVOKER`** (zero `SECURITY DEFINER`), the app touches the DB exclusively through the `service_role` client server-side, and the browser's anon key is used only for `auth.signInWithOtp`. Role-simulation and anon-key PostgREST probes empirically prove that **anon dead-ends at `permission denied` on every business RPC** because the transactional tables carry no anon DML grant — so the widely-granted `EXECUTE` on business RPCs is a latent hardening gap, **not** an active hole (the suspected-P0 was empirically downgraded). Money/tax integrity is well-defended in code: the `points_ledger` has per-kind sign checks + an idempotency unique index, `net + tax = amount` holds structurally because tax is defined as the residual, double-booking is blocked by a GiST exclusion constraint, and the `webhook_events(provider,event_id)` inbox plus `status<>'paid'` guards make payment confirmation idempotent. There is **no schema drift** (ledger 27=27, regenerated types byte-identical, ledger-statement equality across all 27 migrations) and the official Supabase linter is clean.

The headline gaps are two P2 money-correctness items on the freshly-introduced reschedule-charge machinery (an unguarded consolidation path and missing money-bound CHECKs), plus a batch of P3 defense-in-depth and hygiene items. Nothing is P0/P1.

| Severity | Count | Disposition |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 2 | both fix_now (cheap, on unshipped `feat/reschedule` code) |
| P3 | 18 | 2 fix_now (A1, D5 — trivial hardening), 16 acceptable / confirmed-healthy |

## What is solid (keep)

- **All functions are `SECURITY INVOKER`** — zero `SECURITY DEFINER` in `public`, so an RPC's body runs with the caller's privileges. Combined with no anon DML grants, this is the load-bearing wall that neutralizes the broad `EXECUTE` grants.
- **Anti-double-booking via GiST exclusion** — `reservations_no_overlap EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at,ends_at) WITH &&) WHERE status IN ('held','confirmed')`, backed by `btree_gist`, plus `reservations_time_order CHECK (ends_at > starts_at)`. Validated, load-bearing, with real 23P01 error handlers in the repos.
- **Points ledger integrity** — `apply_points` is the sole writer, doing the ledger INSERT + balance UPDATE atomically, gated by `if not found return false`; `points_ledger_once` unique index (`order_id, kind, ref`) enforces idempotency and `points_ledger_sign` enforces per-kind sign. Concurrent redemptions serialize via `create_checkout`'s `SELECT ... FOR UPDATE`.
- **Structural `net + tax = amount`** — tax is always defined as the residual (`money.ts:24`, `points.ts:51-52`, and the `*_amount` DTE helpers), so the invariant holds by construction at every order-construction and boleta-emission site.
- **Payment idempotency without a fragile unique** — `webhook_events UNIQUE(provider,event_id)` inbox dedup + `update orders ... where status<>'paid'` status guard make `confirm_payment` and `apply_reschedule_charge` no-ops on replay.
- **Last-super-admin guard** — `protect_last_super_admin` BEFORE DELETE/UPDATE trigger on `admin_members` correctly blocks demoting/removing the final active super_admin.
- **No drift, clean lint, no `NOT VALID` constraints** — 84 constraints all validated; migration ledger and regenerated types are in lockstep; official Supabase advisor reports "No schema errors found."
- **service_role-only data access** — the entire app data path runs server-side under `service_role`; anon reaches only 10 non-sensitive catalog tables (pricing/hours/rooms) by design.

## Findings

### [P2] D1 — `apply_reschedule_charge` consolidates onto the original order without re-checking the reservation moved or is still paid

**Evidence** — `08-function-bodies.sql:41-64`, re-read verbatim:
```
42  update reservations set starts_at = v_starts, ends_at = v_ends
43    where id = v_reservation and status = 'confirmed';
44  exception when exclusion_violation then      -- ONLY slot-overlap caught
...NO `get diagnostics row_count` after the UPDATE...
54  select amount_clp - refunded_amount_clp into v_old_live from orders where id = v_order;  -- NO status='paid' guard
57  update orders set amount_clp = amount_clp + v_delta, ... where id = v_order;
64  perform create_boleta_amount(v_order, v_old_live + v_delta);
```
This function is the **sole outlier** — its three siblings all guard the original order: `create_reschedule_charge:400-402`, `reschedule_move:2293-2294`, `reschedule_down:2224-2225` all re-read `from orders where id=v_order and status='paid' and coalesce(points_redeemed_clp,0)=0`. Reachability: the refund path (`actions.ts:25-62` → `refund-service.ts:51-106` → `mark_refunded`, `webhook-repository.ts:40`) has no check for a pending reschedule, and `page.tsx:346-372` renders the refund card while the order is still `paid` (true during `pending_charge`). `mark_refunded` (`08:2020-2028`) cancels the reservation but does **not** touch `reschedules`, so `R` stays `pending_charge`. Sequence: order paid → create upgrade charge (`D` pending, `R` pending_charge) → refund `O` → customer pays the stale delta link → the reservation UPDATE hits a `cancelled` row → **0 rows, no `exclusion_violation`** → consolidation proceeds anyway.

**Impact** — Correction to the original framing: I1/SII is **not** broken (order `O` nets boleta(A)+NC(A)+boleta(delta); live = `amount_clp − refunded_amount_clp` = delta, so tax documents net correctly). The genuine harm is **customer money**: `D`→`fulfilled` (not refunded), studio keeps the delta, reservation stays `cancelled`, `order_lines` re-point room_time at the cancelled reservation (`08:66-71`), and `floor(0.05*delta)` points accrue on a refunded booking (`08:73-78`). The customer is charged the delta for a slot that never moved. Reached only on the uncommon refund-first edge, not normal ops.

**Remediation** — Distinguish "slot free" from "reservation no longer active," and re-assert the original is still live before consolidating:
```sql
-- inside apply_reschedule_charge, after the reservation UPDATE:
get diagnostics v_moved = row_count;
if v_moved = 0 then
  -- reservation no longer 'confirmed': do NOT consolidate.
  insert into tax_documents (...) values (p_delta_order,'boleta',...);   -- keep delta's own boleta
  update reschedules set status = 'failed_slot_taken' where id = v_resched;
  return 'slot_taken';                                                    -- webhook refunds the delta
end if;

-- and guard the original-order re-read (mirror the three sibling fns):
select amount_clp - refunded_amount_clp into v_old_live
  from orders
 where id = v_order and status = 'paid' and coalesce(points_redeemed_clp,0) = 0;
if v_old_live is null then
  -- original order no longer live: bail to slot_taken/refund rather than consolidate.
  ...
end if;
```
Belt-and-suspenders: have the refund path (`RefundService.cancelBooking` / `mark_refunded`) expire any `pending_charge` reschedule for the order so the stale link cannot be paid.

**Verdict — Fix now.** ~3 lines, closes real customer-money harm, and the feature is still on `feat/reschedule` and unshipped — cheapest to fix before it reaches prod. Downgraded P1→P2 because it manifests only on the refund-first edge and does not break SII/I1 as originally stated. (Severity is a judgment call: this is a customer-money-loss integrity gap; if you weight "money can silently leave the customer" over "only reachable on an uncommon edge," treat it as P1. Either way it's the top fix-now item.)
_Callers: `reschedule-repository.ts:141` (applyCharge → `apply_reschedule_charge`), reached from `webhook-service.ts:75`; refund path `refund-service.ts:51-106` → `mark_refunded` (`webhook-repository.ts:40`)._

---

### [P2] D2 — `orders` has no CHECK backstop for `0 ≤ refunded_amount_clp ≤ amount_clp` nor `net_clp + tax_clp = amount_clp` (merged with C2)

**Evidence** — `06-constraints.txt:36` (verified): `orders` carries **only** `orders_amount_clp_check CHECK (amount_clp >= 0)` and `orders_terms_source_check` — no bound on `refunded_amount_clp` (`06b-columns.txt:72`: `int4 NOT NULL default 0`, unconstrained), no `net/tax↔amount` tie. Live probe reproduced directly:
```
 total_orders | refunded_gt_amount | refunded_neg | net_tax_ne_amount | neg_net_or_tax
--------------+--------------------+--------------+-------------------+----------------
           10 |                  0 |            0 |                 0 |              0
```
Every write path provably preserves both invariants: `mark_refunded` (`08:2014-2017`) `v_refund=least(coalesce(p_refund_amount,v_boleta),v_boleta)` ⇒ `refunded ≤ amount`; `reschedule_down` (`08:2229`) raises unless `1 ≤ p_refund_amount ≤ v_boleta` (two-sided); `apply_reschedule_charge` (`08:57-62`) grows `amount` by `v_delta = v_delta_net + v_delta_tax`, preserving both; `net+tax=amount` is structural (`money.ts:24`, `reschedule-service.ts:125`). The one genuine (currently unreachable) gap is the `>=0` half — `mark_refunded` has no lower-bound guard, whereas the `<=amount` half is already guaranteed by both writers.

**Impact** — These are legally-significant SII/DTE money columns. Today: a hypothetical future-regression backstop, not a live defect or concrete race (concurrent partial refunds lose-update *downward*, never above `amount`). But a one-line CHECK on a money invariant is zero-downside insurance.

**Remediation** — Verified to pass on all 10 live rows; no write path is rejected:
```sql
ALTER TABLE public.orders
  ADD CONSTRAINT orders_refunded_bounds
    CHECK (refunded_amount_clp >= 0 AND refunded_amount_clp <= amount_clp),
  ADD CONSTRAINT orders_amount_balances
    CHECK (net_clp >= 0 AND tax_clp >= 0 AND net_clp + tax_clp = amount_clp);
```
Table is tiny and current data provably satisfies both, so no `NOT VALID` dance. If a future zero-/exempt-tax product ships, revisit only the `net+tax=amount` clause (currently always holds since tax is the residual).

**Verdict — Fix now** (borderline P2/P3, not urgent). Cheap, zero-downside, guards a legally-significant invariant against future regression. The `refunded`-only subset (originally C2) is merged here as the higher-severity item.
_Callers: `webhook-repository.ts:41` (mark_refunded); `reschedule-repository.ts:90` (reschedule_down), `:111` (create_reschedule_charge), `:141` (apply_reschedule_charge), `:147` (mark_refunded on delta)._

---

### [P3] A1 — 22 business RPCs carry PUBLIC/anon/authenticated `EXECUTE` — latent privilege-escalation surface, not an active hole

**Evidence** — Direct SQL over the 22 named business RPCs: `anon_exec=22 | auth_exec=22 | svc_exec=22 | secdef_true=0` — all carry anon+authenticated `EXECUTE` and all are `SECURITY INVOKER`. The grant is the Postgres PUBLIC default, **not** a repo migration: the only function grants in `supabase/migrations` are `20260625224334_grants.sql:10` (`grant all ... to service_role`) and `20260626150000_admin_rbac.sql:100-101` (hook → `supabase_auth_admin`, revoked from anon/public). No `alter default privileges ... revoke execute ... from public` exists, so **every future function re-inherits the PUBLIC grant**. The single wall is the absence of anon table grants (`01-table-grants.txt`: anon/authenticated hold only `SELECT` on 10 catalog tables and `REFERENCES/TRIGGER/TRUNCATE` on the 9 transactional ones). Role-sim (`18/18b`): all 20 RPCs tested die `permission denied for table {reservations|orders|points_ledger|...}` under `SET LOCAL ROLE anon`; `19-rowcounts` unchanged → no persisted mutation.

**Impact** — Not exploitable today: `SECURITY INVOKER` + zero anon DML grants = permission-denied on first table touch. This is defense-in-depth; the realistic future trigger is a broad `GRANT ALL ... TO anon` copy-paste, exactly the footgun least-privilege neutralizes. (Honest calibration: a single narrow `GRANT SELECT ON orders` would *not* arm the money RPCs, which need writes across several transactional tables.)

**Remediation** — One hardening migration (leaves `grants.sql:10` service_role grant intact):
```sql
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
-- Regression stop: future functions must not auto-grant EXECUTE to PUBLIC.
alter default privileges in schema public revoke execute on functions from public;
```
Safe for the `btree_gist` support functions swept up by the ALL revoke (invoked internally by the index AM, not via SQL `EXECUTE` checks; `service_role` keeps execute anyway) → `create_hold`'s `reservations_no_overlap` exclusion is unaffected. After this, anon RPC calls 404 (out of schema cache) instead of reaching parse/plan/execute.

**Verdict — Fix now.** Trivial, downside-free, and the `alter default privileges` clause is decisive: without it the PUBLIC grant re-inherits on every future function forever. Batching into a later hardening pass would also be defensible; the regression-prevention value tips it to fix_now.
_Callers: `webhook-repository.ts:25/41`, `admin-repository.ts:656/662/672`, `checkout-repository.ts:11` — all via `this.db.rpc(...)` on the injected service_role client; no anon/authenticated caller exists._

---

### [P3] A2 — Anon OpenAPI root + `42501` error hints enumerate the full schema (info disclosure, no data exposure)

**Evidence** — Re-run as anon against `http://127.0.0.1:54421`: `GET /rest/v1/` → HTTP 200, advertising exactly 22 `/rpc/` paths and 23 table paths. `42501` hints (all HTTP 401, zero rows) leak the exact GRANT needed, e.g. `GET reservations` → `"hint":"...GRANT SELECT ON public.reservations TO anon;"`. The leak is **richer than first stated**: the 106,871-byte OpenAPI `definitions{}` exposes full column lists of every table (`orders[...,customer_email,customer_phone,mp_payment_id,refunded_amount_clp,...]`, `tax_documents[...,receptor_rut,folio,neto,iva,total,...]`, `reservations[...,access_code,...]`) and full RPC param schemas — **still metadata only, no row values**.

**Impact** — Inert: all 401, zero rows, zero mutation; every RPC dead-ends at permission-denied. Default PostgREST/Postgres behavior over non-secret schema metadata.

**Remediation** — No A2-specific action. The RPC enumeration + param leak disappears the moment A1's `revoke execute` ships (PostgREST only advertises executable functions); residual table/column enumeration shrinks when the unused catalog-table grants are trimmed (A3/E4). The `42501` GRANT hint is Postgres's own `errhint`, not suppressible without a PostgREST-level change — not worth pursuing at this scale.
```sql
-- No standalone migration. Byproduct of A1 (+ optional A3/E4 revokes).
```

**Verdict — Acceptable for current scale.** P3 hygiene resolved as a side-effect of A1, not a standalone fix. For a tens-of-bookings/week studio, non-secret schema metadata disclosure is a non-event.

---

### [P3] A3 — anon/authenticated hold Supabase-baseline `TRUNCATE/REFERENCES/TRIGGER` on every table incl. the 9 transactional ones — inert, no reachable exploit

**Evidence** — `01-table-grants.txt:3-48`: all 23 tables show `REFERENCES, TRIGGER, TRUNCATE` for anon and authenticated (transactional tables show exactly those three, no DML). Live: `has_table_privilege('anon','public.reservations','TRUNCATE')=t` while all DML bits are `f`; anon/authenticated are `rolcanlogin=f` (NOLOGIN — cannot open a direct SQL session). The only live exploit angle — an INVOKER RPC whose body issues `TRUNCATE` running as anon (who holds the bit) — is **closed**: grep of `08-function-bodies.sql` = "NO TRUNCATE in any function body"; live `prosrc ILIKE '%truncate%'` = 0 rows; `pg_rules on public` = 0 rows; PostgREST emits no TRUNCATE verb. Grep of migrations confirms every explicit grant targets `service_role` only → this is the Supabase platform baseline, present in prod too.

**Impact** — Genuine-but-unreachable platform default. Zero reachable exploit at any scale.

**Remediation** — None required. Optional pure-hygiene cleanup only if you want a minimal guest ACL:
```sql
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
```

**Verdict — Acceptable for current scale.** Already at the P3 floor; re-tightening a platform default that Supabase tooling may reintroduce is low-value. Carry forward one review rule (not a schema change): never grant `EXECUTE` to anon/PUBLIC on any future INVOKER function that issues `TRUNCATE`. No such function exists today.

---

### [P3] C4 — `reschedules.kind/status` and `reservations.kind` are `text`+CHECK, not enums — cosmetic

**Evidence** — `06-constraints.txt:57,58,63` show the three CHECKs (`reschedules_kind_check` over `['equal','refund','charge']`, `reschedules_status_check` over 5 states, `reservations_kind_check` over `['booking','block']`); `06b-columns.txt` confirms the columns are `text`. Adversarial correction: the "everything else uses enums" premise is imprecise — `admin_members.status`, `order_lines.line_type`, `orders.terms_source` are **also** `text`+CHECK (~6 columns vs 7 enums). Every `reschedules` writer sets `status` explicitly (inserts at `08:412/2200/2271/2313`), so the `DEFAULT 'applied'` is dead code.

**Impact** — Behaviorally equivalent to an enum: CHECK makes invalid values unrepresentable. Purely cosmetic.

**Remediation** — No action. If ever normalized in a broader refactor:
```sql
CREATE TYPE reschedule_status AS ENUM ('pending_charge','applied','failed_slot_taken','expired','cancelled');
ALTER TABLE reschedules ALTER COLUMN status TYPE reschedule_status USING status::reschedule_status;
ALTER TABLE reschedules ALTER COLUMN status DROP DEFAULT;  -- 'applied' default masks omitted-status inserts as a terminal success
-- drop the now-redundant CHECKs; repeat for reschedule_kind / reservation_kind.
```

**Verdict — Acceptable for current scale.** `text`+CHECK is a widespread, safe convention here; the mixed style if anything argues for "leave it."

---

### [P3] C5 — `order_status` enum has dead label `'cart'` — genuinely unused, but leave it

**Evidence** — `06-constraints.txt:94`: `order_status | cart, pending_payment, paid, fulfilled, cancelled, refunded`. `09-data-probes.txt:2-8`: live statuses are only `pending_payment/paid/fulfilled/cancelled` (zero `'cart'` rows). `grep -ic 'cart' 08-function-bodies.sql = 0` (no function writes it), while `'refunded'` **is** written (`08:134/2024/2119`). Broadened across `supabase/migrations`, `src/`, `app/`, `lib/`: `'cart'` appears only as the enum def (`20260625223013_orders.sql:7`), the generated `database.types.ts` mirror, and a hand-written TS union member (`orders.ts:23`) — never a runtime value. Genuinely dead.

**Impact** — None (harmless unused label).

**Remediation** — Leave as-is. Postgres has no `ALTER TYPE ... DROP VALUE` (through PG17), so removal means recreating `order_status` and rewriting the column default + all dependent functions. If ever cleaned up, do it in a dedicated migration and drop `'cart'` from the mirrored TS union at `orders.ts:23` simultaneously.
```sql
-- Not worth it: requires recreating the enum + column default + dependent fns for a harmless label.
```

**Verdict — Acceptable for current scale.** No security/money/integrity impact.

---

### [P3] C6 — Emails are `text`, not `citext` — case-sensitive UNIQUE + `lower()`-joins are the only dedup guard

**Evidence** — `06b-columns.txt`: `customers.email`, `reservations.customer_email`, `orders.customer_email` all `text`. `06-constraints.txt:21`: `customers_email_key = UNIQUE (email)` (case-sensitive). `confirm_payment` joins `c.email = lower(o.customer_email)` (`08:201`, also `74/102/2034/2254`). `customer-repository.ts:66-75` uses `.ilike(...)` + a JS `toLowerCase()` re-filter (the `_`-wildcard workaround, documented at `:63-65`). Insert-path trace: the **sole** app writer is `upsertCustomer` (`customer-repository.ts:16`), called only from `customer-service.ts:22` as `upsertCustomer(userId, email.toLowerCase())`; zero raw `INSERT INTO customers` in functions or migrations. `customers.id` is FK to `auth.users(id)`. `09-data-probes.txt:30-40`: 0 mixed-case emails; `citext` not installed.

**Impact** — The "duplicate customer / missed points" corruption has **no reachable path**: `customers.id` FK to `auth.users` + GoTrue lowercasing + app-level `email.toLowerCase()` at the sole insert site; `confirm_payment` already lowercases the orders side. Theoretical, not a live break.

**Remediation** — Leave as-is. If ever done for hygiene, prefer a lightweight guard over a type change (avoids adding `citext` as a new extension-in-public, the very concern E1 flags):
```sql
ALTER TABLE public.customers ADD CONSTRAINT customers_email_lower CHECK (email = lower(email));
```

**Verdict — Acceptable for current scale.** The `ilike`+JS-refilter workaround is correct and safe; only revisit if `bookingsForEmail`'s `_`-wildcard handling is simplified.

---

### [P3] C7 — `tax_documents.order_id` is `ON DELETE CASCADE` (fiscal records) — dormant, but RESTRICT is the safer fiscal default

**Evidence** — `06-constraints.txt:76`: `tax_documents_order_id_fkey ... ON DELETE CASCADE`, contrasting the RESTRICTs at `:66/:69`. `grep` of `08-function-bodies.sql` for `delete from orders`/`delete from tax_documents` = 0 hits. The only DELETE paths in `src/` are `admin-repository.ts:761` (`deleteBlock`, reservations `kind='block'`) and `member-repository.ts:108/119` (RBAC tables) — none touch `orders`/`tax_documents`. New probe: `pg_constraint WHERE conrelid='public.orders' AND contype='f'` = 0 rows — `orders` has **no outgoing FK**, so there is no cascade-in path; the `tax_documents` CASCADE can only fire via a hand-written `DELETE FROM orders`.

**Impact** — Structurally unreachable under current schema + code. RESTRICT is legitimate fiscal-retention defense-in-depth (boletas/NCs must not silently vanish).

**Remediation** — Optional hardening (defer):
```sql
ALTER TABLE tax_documents DROP CONSTRAINT tax_documents_order_id_fkey;
ALTER TABLE tax_documents ADD CONSTRAINT tax_documents_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
```
Changes zero current behavior (no app caller deletes orders); forces an explicit decision if an order ever must be hard-deleted.

**Verdict — Acceptable for current scale.** Dormant; not a live bug.

---

### [P3] C8 — Confirmed healthy: no `NOT VALID` constraints; GiST no-overlap + last-super-admin trigger both wired

**Evidence** — Re-ran live SQL (not just the evidence file): `pg_constraint` in `public` → `total=84, not_valid_count=0`. `reservations_no_overlap`: `contype=x, convalidated=t`, `EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at,ends_at) WITH &&) WHERE status IN ('held','confirmed')`; `reservations_time_order`: `CHECK (ends_at > starts_at)`, valid. `btree_gist 1.7` present (required for `resource_id WITH =`). `trg_protect_last_super_admin`: `tgenabled='O'`, BEFORE DELETE OR UPDATE on `admin_members`; the function body correctly blocks demoting/disabling the last active super_admin (counts peers `WHERE role_id=v_super AND status='active' AND id<>old.id`, raises when 0). Migration ground truth: `20260625221356_reservations.sql:23`, `20260626150000_admin_rbac.sql:109-132`; grep for `NOT VALID` = nothing.

**Impact** — None (positive confirmation).

**Remediation** — None. Both the double-booking guard and last-owner guard are enforced and validated at the schema level.
```sql
-- No change needed.
```

**Verdict — Acceptable for current scale.** Genuine healthy confirmation; adversarial hunt for an invalid/disabled/buggy guard found nothing.

---

### [P3] C3+D6 — `orders.mp_payment_id` has no UNIQUE — correct as-is; any UNIQUE MUST be partial (offline sentinels repeat by design), and idempotency is already enforced (merged)

**Evidence** — Live distribution: `NULL ×2 | 3 distinct MP numeric IDs | mp_demo_0001..0004 ×1 | offline:efectivo ×1` (10 rows, 0 dups). Schema (`06b:65`, `06-constraints.txt`, `04-indexes.txt:20-21`): `mp_payment_id text nullable`, no UNIQUE. Sentinels repeat **by design**: `08:322-323` `confirm_payment(v_order,'offline:puntos')`; `admin-repository.ts:673` `offline:${method}`. Idempotency is already covered without a UNIQUE: `confirm_payment` `update orders ... where id=p_order and status<>'paid'` (`08:189`), `apply_reschedule_charge` `where ... status not in ('paid','fulfilled')` (`08:38`), and `webhook_events UNIQUE(provider,event_id)` (`06:87`). `manual-pending.itest.ts:220` asserts a repeated `offline:efectivo` confirm is a no-op.

**Impact** — No current defect (no plain UNIQUE exists). The residual gap (a duplicated *real* MP id) is near-impossible under MP's one-payment-one-order model and is already covered by the inbox dedup + status guard.

**Remediation** — Do **not** add a plain `UNIQUE(mp_payment_id)` — it would break the offline flow on the second cash/points order (`offline:efectivo` / `offline:puntos` collide). If a backstop is ever wanted, it **must be partial**:
```sql
CREATE UNIQUE INDEX orders_mp_payment_id_real_uq
  ON public.orders (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL AND mp_payment_id NOT LIKE 'offline:%';
```

**Verdict — Acceptable for current scale.** Advisory cross-check; no action needed. C3 and D6 (identical conclusion) are merged here.
_Callers: `webhook-repository.ts:26` (confirm_payment), `admin-repository.ts:671-673` (confirmOffline), `checkout-repository.ts:11` (offline:puntos); dedup at `webhook-service.ts:52,62`._

---

### [P3] C1+D7 — `customers.points_balance` has no CHECK `>= 0` — correct as-is; negative is intentional debt (merged)

**Evidence** — `06b:30` `points_balance int4 NOT NULL default 0`; `06-constraints.txt` shows customers has only pkey/fkey/email_key — no CHECK. `08:205-210` (`confirm_payment`): comment *"el saldo puede quedar negativo; deuda que se descuenta de earns futuros"* followed by an **unguarded** `apply_points(..., 'redeem', -v_points, 'late:'...)`. `apply_points` (`08:6-13`) is the **sole writer** — a single-statement atomic `points_balance = points_balance + p_amount` gated by `if not found return false`, backed by `points_ledger_once` (`04:25`) for idempotency and `points_ledger_sign` (`06:42`). `create_checkout` (`08:298-304`) serializes concurrent redemptions with `SELECT points_balance ... FOR UPDATE` + `if v_balance < p_points then raise 'insufficient_points'`. `09-data-probes.txt:24-28`: `neg_balance_customers = 0`. Two more by-design unguarded decrements (`earn_revoke`) at `reschedule.sql:142` and `customers_points.sql:369` widen the set a blanket CHECK would break.

**Impact** — A `>=0` CHECK would raise `check_violation` on `confirm_payment`'s intended late-redeem UPDATE and abort confirmation of a legitimately-paid order — a money/booking-integrity **break**. It fixes no concurrency defect (FOR UPDATE serializes; the increment is atomic; the partial unique index makes `apply_points` idempotent).

**Remediation** — Leave `points_balance` unconstrained on the low side. Negative balances are the intended "points debt" mechanic, amortized against future earns, and can never grant unpaid room time (all redemptions guarded by `v_balance < p_points`). If a floor is ever desired, gate on `kind` (reject only a direct `'adjust'` below 0) — never a blanket `>=0`. No production `'adjust'` writer exists today.
```sql
-- Do NOT add: ALTER TABLE customers ADD CONSTRAINT ... CHECK (points_balance >= 0);  -- would abort late-redeem
```

**Verdict — Acceptable for current scale.** Adding the CHECK is a bug, not a fix. C1 and D7 (identical conclusion) are merged here.
_Callers: `checkout-repository.ts:11` (guarded FOR UPDATE redemption), `webhook-repository.ts:26` (by-design unguarded late-redeem)._

---

### [P3] D3 — `tax_documents` has zero domain CHECKs — an unbalanced DTE (`total ≠ neto+iva`) can be inserted with no schema guard

**Evidence** — `06-constraints.txt:76-77`: `tax_documents` has only the FK and pkey (no `contype='c'` row). `06b:168-170`: `neto/iva/total` are `NOT NULL` but value-unconstrained. Insert paths: `confirm_payment` (`08:224-225`) inserts `o.net_clp, o.tax_clp, o.amount_clp WHERE o.amount_clp > 0`; `create_boleta_amount`/`create_nota_credito_amount` (`08:250-253/375-378`) guard `p_total<=0` and set `iva = p_total - v_net` (residual); `create_nota_credito` (full, `08:359-360`) has **no $0 guard** but is only reached from `cancel_booking` when `status='paid' AND p_refund_id not null`. Live probe: `tax_documents WHERE neto+iva<>total OR neto<0 OR iva<0` → 0; `orders WHERE net_clp+tax_clp<>amount_clp` → 0. Downgrade-critical fact: `total = neto + iva` is **structural** — `money.ts:24` and `points.ts:51-52` define tax as the residual, and the `*_amount` helpers define `iva` as `total - v_net`, so the proposed CHECK is mathematically unable to fire on any of the four insert paths under current code.

**Impact** — Structurally guaranteed upstream; both DTE and orders tables are 100% clean. On the `confirm_payment` path a CHECK would convert a hypothetical future regression from a slightly-off boleta into an **aborted payment confirmation** (stuck `held` reservation after MP captured funds) — arguably a worse live incident.

**Remediation** — Non-urgent, consistent with the schema's own convention:
```sql
ALTER TABLE public.tax_documents
  ADD CONSTRAINT tax_documents_balanced CHECK (neto >= 0 AND iva >= 0 AND total = neto + iva);
```
Non-breaking (`0 = 0+0` passes, so the $0 nota_credito path still works). Do **not** add `total > 0` without first adding a `p_total<=0` guard to `create_nota_credito` (full). A more root-cause-targeted alternative catching the same bug class *before* MP captures money is a CHECK on `orders (amount_clp = net_clp + tax_clp)` at `create_checkout` — see D2.

**Verdict — Acceptable for current scale.** Pure defense-in-depth against a hypothetical regression, with a real downside on the `confirm_payment` path; fold in opportunistically, don't rush. Downgraded from P2/fix_now.
_Callers: `webhook-repository.ts:26/41`, `reschedule-repository.ts:141/147`, `admin-repository.ts:671`._

---

### [P3] D4 — I1 "one live boleta per order" has no schema backstop and none is structurally feasible; the concurrent-double-boleta race does not exist

**Evidence** — Index absent (`04-indexes.txt:40-41`: only pkey + `status_idx`). `tax_doc_status` enum (`06:99`) has no `voided` state, so "live" is **net-of-NC across rows**, not a row flag. VOID+REISSUE emits `NC(old)+boleta(new)` on the same order (`mark_refunded` `08:2057-2059`; `reschedule_down` `08:2264-2265`; `apply_reschedule_charge` `08:54-64`). Live probe of order `f73e8b82`: two boletas share `total=9990` (one voided, one live), so even a `(order_id,kind,total)` partial-unique index would **falsely reject legitimate history**; net_of_nc = 9990 = live = `amount_clp − refunded_amount_clp`. Concurrency: `confirm_payment` (`08:189-194`) locks the orders row first (`where status<>'paid'`); a second caller blocks, re-evaluates `status='paid'` → 0 rows → boleta insert (gated on `v_held>0`) skipped. `apply_reschedule_charge` (`08:30-34`) `... for update` on the reschedules row → blocked second caller re-checks after commit → `noop`. Callers are single-statement `.rpc()` calls (each its own transaction), so row locks span the whole function-transaction.

**Impact** — None. The double-booking-boleta race is genuinely closed by the orders-row lock + reschedules `FOR UPDATE`. A partial-unique backstop is structurally impossible (liveness is cross-row net-of-NC; reissues legitimately reproduce totals).

**Remediation** — No index/constraint change. Document that I1 is procedurally enforced, and that the load-bearing serialization is (a) the `update orders ... where status<>'paid'` row lock in `confirm_payment` (`08:189-190`, first lock hit) gating the `v_held>0` boleta insert, and (b) the `for update` on the reschedules row in `apply_reschedule_charge`. Residual: `confirm_payment`'s `not exists(boleta)` guard (`08:228`) is not atomic on its own — its safety depends on that upstream row lock. If boleta emission is ever moved out of the `v_held>0` branch:
```sql
-- If refactoring boleta emission out of the v_held>0 branch, add around emission:
PERFORM pg_advisory_xact_lock(hashtext(p_order::text));
```

**Verdict — Acceptable for current scale.** Documentation/hardening note, not a defect.

---

### [P3] D5 — `custom_access_token_hook` & `protect_last_super_admin` set `search_path=public` without explicit `pg_temp` — convention deviation on the RBAC/JWT boundary

**Evidence** — Live: both functions have `proconfig={search_path=public}`, `prosecdef=f`; all 21 business RPCs carry `{search_path=public, pg_temp}` — only these two omit `pg_temp`. Source: `20260626150000_admin_rbac.sql:69,111`. The hook reads unqualified `admin_*` relations (`08:437-449`); grant/revoke restricts it to `supabase_auth_admin` (`:100-101`). CONTRA the original "closes 0011 linter" claim: `11-lint.txt` = "No schema errors found" — the official Supabase advisor does **not** fire on `search_path=public`; only the audit's custom query (`12-advisors-sql.txt:27,212`) flags these.

**Impact** — Not exploitable: no attacker-reachable path to seed `pg_temp` objects into the per-backend `supabase_auth_admin`/`service_role` session. Zero-risk consistency deviation on the JWT-minting boundary.

**Remediation** — Bundle into the next migration touch (not a hotfix):
```sql
ALTER FUNCTION public.custom_access_token_hook(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.protect_last_super_admin() SET search_path = public, pg_temp;
```
Or edit `20260626150000_admin_rbac.sql:69,111` so source and DB match. Stronger form: `search_path=''` with fully schema-qualified identifiers.

**Verdict — Fix now** (trivial). Two lines, and it sits on the RBAC boundary where convention consistency is worth keeping — despite the corrected justification (official lint is clean, so it does not "close 0011").

---

### [P3] E1 — `btree_gist` extension installed in `public` schema (`extension_in_public` advisor)

**Evidence** — `07-triggers-ext.txt:11` → `btree_gist | 1.7 | public`; `12-advisors-sql.txt` returns exactly `btree_gist` (1 row). Source `foundations.sql:5` `create extension if not exists btree_gist;` (no schema → public). It is **load-bearing**: the `resource_id WITH =` opclass in `reservations_no_overlap` is supplied by `btree_gist`. Relocatable: `pg_available_extension_versions` → `relocatable=t`, so `SET SCHEMA` is legal and constraint-preserving. `config.toml:15` already has `extra_search_path = ["public","extensions"]`. Real callers map `23P01`: `admin-repository.ts:728/754`, `reschedule-repository.ts:14`.

**Impact** — Nil: access is service_role-only and `btree_gist` exposes only internal `gbt_*` support functions.

**Remediation** — Optional one-line migration to silence the advisor (validate via `npm run db:reset` first):
```sql
ALTER EXTENSION btree_gist SET SCHEMA extensions;  -- relocatable=t; exclusion index binds opclass by OID, so protection survives
-- Do NOT DROP EXTENSION — that would drop reservations_no_overlap and disable anti-double-booking.
```

**Verdict — Acceptable for current scale.** Correct P3 hygiene, no urgency; fine to defer indefinitely.

---

### [P3] E2 — `db:*` scripts use bare `supabase`; the premise that this breaks the workflow on a stale global CLI is FALSE

**Evidence** — `package.json:16-19` call bare `supabase`; `:45` pins devDependency `"supabase": "^2.109.0"`. `which -a supabase` → global `/opt/homebrew/bin/supabase` is `2.95.4` (which rejects `config.toml`'s `[local_smtp]`). But `npm run env | grep ^PATH` shows entry #1 = `node_modules/.bin`, so `npm run db:*` invoke the pinned `2.109.0` — verified via `npm exec -- which supabase` resolving to the local install. CI (`.github/workflows/ci.yml`) uses `npx supabase` throughout → unaffected.

**Impact** — None on the documented loop. The only residual is a developer typing `supabase` directly with an outdated global — user error against an unsupported path, not a repo defect.

**Remediation** — No change needed; bare `supabase` in npm scripts is idiomatic. Optional courtesy one-liner in CLAUDE.md/DEPLOY.md: *"invoke via `npm run db:*`, or if calling `supabase` directly keep the global CLI ≥ 2.109.0."*
```
# No schema/script change. Documentation nicety only.
```

**Verdict — Acceptable for current scale.** Not a workflow break.

---

### [P3] E3 — No schema drift — ledger parity, byte-identical regenerated types, clean lint, AND ledger-statement equality all confirm applied == source

**Evidence** — (1) Ledger parity: `ls supabase/migrations/*.sql | wc -l` = 27 = `count(*)` in `supabase_migrations.schema_migrations`; DB versions == filename timestamps (strictly increasing, no gaps). (2) Regenerated types byte-identical: `./node_modules/.bin/supabase gen types typescript --local` (EXIT=0) `diff` against `database.types.ts` → IDENTICAL (prior EXIT=127 was macOS lacking `timeout`, not supabase). (3) Lint clean. (4) `db diff` env failure was a port-in-use on 54420, not drift (`config.toml` already has distinct `port=54422, shadow_port=54420`). (5) **New stronger check**: normalized md5 compare of each migration file vs the ledger's stored `statements[]` across all 27 → "total mismatches: 0 of 27" — directly proves each file was both applied and never edited post-apply.

**Impact** — None (positive confirmation; upgrades the conclusion from "triangulated" to directly proven).

**Remediation** — None required.
```sql
-- No defect. To close the belt-and-suspenders db-diff gap, free the stale 54420 allocation before `supabase db diff --local`.
```
Note: the earlier "set a distinct shadow_port" suggestion is imprecise — `shadow_port` (54420) is already distinct from `port` (54422). Residual theoretical gap (not present here): types+lint+ledger-statements would not catch purely out-of-band DDL run directly against the live DB — implausible for this `db:reset`-built local stack.

**Verdict — Acceptable for current scale.** No drift.

---

### [P3] E4 — Data API exposes `public + graphql_public` — required and acceptable; the "anon locked out of everything" rationale was factually wrong

**Evidence** — `config.toml` verbatim: L13 `schemas = ["public","graphql_public"]`, L18 `max_rows = 1000`, L24 `# auto_expose_new_tables = true` (commented → nothing auto-exposed). Exposing `public` is genuinely required — the service_role client reaches every table/RPC through PostgREST, which serves only listed schemas. **Refuted sub-claim**: anon is *not* locked out of everything — `01-table-grants.txt` shows anon holds `SELECT` on 10 catalog tables, and `03-rls.txt` shows 14 policies incl. 10 permissive `public read` (`qual=true`) policies on exactly those tables. Live role-sim: anon `resources`→1 row, `locations`→1 row, `rate_tiers`→4 rows (data, not 401), while `orders`/`customers`→`permission denied`. The `18/18b` probes only tested RPCs, never table SELECTs, so they never evidenced the "401 for everything" claim.

**Impact** — Anon-readable surface is only non-sensitive pricing/catalog/hours data; all sensitive/transactional/PII/tax tables are locked (no grant + no policy). Config verdict stands.

**Remediation** — Keep `schemas` and `max_rows` as-is. Real hardening lives in A1 (revoke blanket RPC EXECUTE). Since the browser uses anon only for `auth.signInWithOtp` (all catalog reads happen server-side via service_role), the anon SELECT grants + `public read` policies on those 10 tables are latent/unused surface that *could* be revoked — but they're non-sensitive:
```sql
-- Optional, low-value: catalog reads all run server-side via service_role, so these anon grants are unused.
revoke select on public.locations, public.resources, public.opening_hours, public.price_books,
                 public.rate_plans, public.rate_tiers, public.volume_discounts, public.addons,
                 public.schedule_exceptions, public.tax_rates
  from anon, authenticated;
```

**Verdict — Acceptable for current scale.** Config is correct; only the narrative needed fixing ("sensitive tables locked; 10 reference tables anon-readable by design").

---

### [P3] B1 — 11 foreign keys lack a covering index; 4 have equality-filter callers but all sit on tiny tables — no index warranted at this scale

**Evidence** — `05-fk-noindex.txt` lists 11 FK columns with no covering index. Cross-referenced against the actual app query paths (`17-query-patterns.txt` + the repository sources), they split cleanly:

- **Has an equality-filter caller** (an index *would* be used, but the table is tiny): `reservations.order_id` (`order-repository.ts:30,37`, `notification-repository.ts:19,26`, `admin-repository.ts:694,700`, `reschedule-repository.ts:53`); `tax_documents.order_id` (`admin-repository.ts:527`, booking-detail render); `rate_plans.resource_id` (`rate-plan-repository.ts:36`); `rate_tiers.rate_plan_id` (`rate-plan-repository.ts:42`).
- **No equality-filter caller** (join/cascade only — legitimately droppable): `admin_members.role_id`, `admin_role_permissions.permission`, `order_lines.reservation_id`, `reschedules.{original_order_id, delta_order_id, reservation_id}`, `resources.location_id`.

Live table sizes (`19-rowcounts`): `reservations`=10, `tax_documents`=11, `orders`=10; catalog tables (`rate_plans`/`rate_tiers`/`resources`) are single-digit rows. At these cardinalities the Postgres planner picks a sequential scan regardless — an index would sit unused and only slow writes.

**Impact** — None today. Left unindexed, these become relevant only if a table crosses ~a few thousand rows. The realistic first mover is `reservations` (grows one row per booking); `tax_documents` tracks it. The catalog FKs (`rate_plans`/`rate_tiers`/`resources`) are effectively fixed-size and will never need one.

**Remediation** — No index now. Add only when a table actually grows — the two worth pre-writing for that day:
```sql
-- Add ONLY when reservations/tax_documents reach a few-thousand rows (not before):
CREATE INDEX reservations_order_id_idx ON public.reservations (order_id);
CREATE INDEX tax_documents_order_id_idx ON public.tax_documents (order_id);
```

**Verdict — Acceptable for current scale.** All four caller-backed FKs are on ≤11-row tables where a seq scan beats an index; the other seven have no equality-filter caller at all. Revisit `reservations.order_id` / `tax_documents.order_id` if `reservations` grows past a few thousand rows. (Explicit note per the no-silent-drop rule: this candidate category was considered and dismissed on scale grounds, not overlooked.)

---

## Appendix: method & scope

**Evidence gathering.** All facts were collected against the local Supabase stack (Postgres 17.6, container `supabase_db_fotf-studios-final-build`) via `docker exec … psql`, cross-referenced against repo ground truth (`supabase/migrations/*.sql`, `config.toml`, `src/infrastructure/db/*-repository.ts`, and the I1/I2 design spec). Every finding was reproduced independently, not merely read from the pre-gathered evidence files.

**Non-destructive probing.** Privilege reality was tested with rolled-back role simulation (`BEGIN; SET LOCAL ROLE anon; SELECT …; ROLLBACK`) and with anon-key PostgREST probes against `http://127.0.0.1:54421`. Transactional row counts (`19-rowcounts`) were unchanged before/after → **no DB mutation persisted** (sequence increments from rolled-back inserts are the only side effect).

**Key empirical downgrade.** The function-exposure headline (all 22 business RPCs carry PUBLIC `EXECUTE`) was **downgraded from suspected-P0 to P3 hardening**: role-sim proves anon hits `permission denied for table X` on every business RPC (SECURITY INVOKER + zero anon DML grants), and anon-key HTTP probes return 401/`42501` with no rows. The wall is real; the grant is a latent footgun, not a live breach.

**Drift.** The shadow-DB `db diff --local` did not complete (port 54420 already allocated at run time — an environmental conflict, not a schema signal). Drift is instead confirmed by three convergent checks: 27=27 migration ledger parity, byte-identical regenerated `database.types.ts`, and — the strongest — normalized md5 equality between each migration file and the ledger's stored `statements[]` (0 of 27 mismatches), which proves no post-apply edits and no unrecorded DDL.

**Caveats.** (1) The global Homebrew `supabase` CLI (2.95.4) cannot parse this repo's `config.toml` (`[local_smtp]`); the repo-pinned `./node_modules/.bin/supabase` (2.109.0), which `npm run` resolves first, parses fine and was used for `db lint`/`gen types`. (2) The `42501` GRANT hint in PostgREST errors is Postgres's own `errhint` and is not suppressible without a PostgREST-level change. (3) Every index/constraint recommendation is tied to a concrete `src/infrastructure/db/*-repository.ts` caller; the 11 FK-without-covering-index candidates are dispositioned explicitly in finding **B1** (4 have equality-filter callers on ≤11-row tables → acceptable at this scale; 7 have no equality caller), not silently dropped. (4) The audit ran as a fan-out of 5 dimension auditors → per-finding adversarial verifiers → synthesis → completeness critic; the critic's one substantive catch (the FK disposition) was folded back in as B1. One verifier agent (of ~23) aborted on a tooling retry-cap and its single finding went to synthesis unverified — immaterial to the P0/P1 picture (there are none) and to the two P2s, which were each independently reproduced.
