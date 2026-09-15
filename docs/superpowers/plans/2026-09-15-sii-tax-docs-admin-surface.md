# Documentos tributarios (SII) como pasos guiados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the admin's raw `tax_documents` rows into guided "what to type into sii.cl next" steps — on the booking ficha, the curso ficha, and a new `/admin/sii` queue — with a correct folio-recording action that logs to the timeline.

**Architecture:** A pure domain function (`describeTaxDocs`) derives each document's SII step (state, role, parent folio, razón, urgency) from the full set of documents of an order. One shared card/row component renders those steps in three places; three thin segment-local server actions call one application service (`TaxDocService.recordFolio`) that validates, refuses blocked NCs, updates the row and best-effort logs a `booking_events` entry. No migration.

**Tech Stack:** Next.js 15 App Router (server components + server actions), React 19, Tailwind v4, Supabase JS (service role), luxon, vitest (unit `*.test.ts`, integration `*.itest.ts` against local Supabase).

**Spec:** `docs/superpowers/specs/2026-09-15-sii-tax-docs-admin-surface-design.md`

## Global Constraints

- **No DB changes.** No new migration, no change to when documents are created or to any RPC.
- **Copy in Spanish (Chile)**, precise and direct. The record button is always **"Registrar folio"** — never "Emitir".
- **Brand:** Gold is the everyday accent; **Sirena only for `atrasada`** (previous-month pending doc). Admin `.tsx` must never use `text-bone-mute` (contract test); secondary text is `text-bone-quiet`, tertiary `text-bone-dim`.
- **Form controls** come from `components/admin/ui/Field.tsx` (`Input`, border `ink-edge`). Form labels/table headers use `.label`; pills/badges `.label-sm`.
- **Server actions are segment-local** (`<segment>/actions.ts`, `"use server"` + `requirePermission`). Shared work lives in `src/application/admin/tax-doc-service.ts`, not in a global actions file.
- **Permission** for reading/recording folios everywhere: `reservations.boleta` (existing). The `/admin/sii` page and its sidebar item are gated by it.
- **Timezone** for age/month logic: `America/Santiago`.
- **git:** use `/opt/homebrew/bin/git` (system git trips the Xcode licence prompt). Conventional Commits. Branch `feat/sii-docs-admin-surface` already exists with the spec committed.
- **Tests:** `npm test` (unit). Integration tests need `npm run db:start` first and run with `npm run test:integration -- <file>`; **always `npm run db:reset` afterwards** (they truncate transactional tables). Never run `npm run build` while a dev server you rely on is up (it breaks `next dev`); restart dev after a build.
- **Before the PR:** `npx eslint .` and `npm run build` must exit 0; `npm test` green (includes `lib/admin-a11y-contract.test.ts` and `lib/chrome-contract.test.ts`).

---

## File map

| File | Responsibility |
|---|---|
| `src/domain/tax/tax-doc-steps.ts` (new) | `TaxDocRaw`, `TaxDocStep` types; `describeTaxDocs()`; `parseFolio()`. Pure. |
| `src/domain/tax/tax-doc-steps.test.ts` (new) | Unit tests for the above. |
| `src/application/ports/tax-docs.ts` (new) | `TaxDocRepository` port used by the service. |
| `src/application/admin/tax-doc-service.ts` (new) | `TaxDocService.recordFolio()` orchestration. |
| `src/application/admin/tax-doc-service.test.ts` (new) | Unit tests with a fake repo. |
| `src/infrastructure/db/admin-repository.ts` (modify) | New reads (`taxDocsForOrders/Order/Reservation/OrderOf`, `pendingTaxDocsQueue`, `pendingTaxDocsSummary`), writes (`recordTaxDocFolio`, `logTaxDocEmitted`), `getBooking().taxDocs` becomes `TaxDocRaw[]`, dashboard gains `oldestPendingDocAt`; old `recordBoleta`/`pendingBoletas`/`PendingBoleta` removed. |
| `src/infrastructure/db/tax-docs.itest.ts` (new) | Integration tests for the reads and the record flow. |
| `src/composition.ts` (modify) | `taxDocService()` factory. |
| `components/admin/ui/StatusPill.tsx` (modify) | `por_emitir`, `bloqueada`, `atrasada` entries. |
| `components/admin/tax-docs/sii-links.ts` (new) | SII URLs (portal + official guides). |
| `components/admin/tax-docs/step-copy.ts` (new) | `stepTitle/stepDetail/stepMeta` — the Spanish instruction per step. Pure. |
| `components/admin/tax-docs/step-copy.test.ts` (new) | Unit tests for the copy. |
| `components/admin/tax-docs/TaxDocStepRow.tsx` (new) | One step: pills, instruction, razón + copy, folio form / blocked state / corregir. |
| `components/admin/tax-docs/TaxDocsCard.tsx` (new) | Card wrapping rows + SII hint. |
| `app/admin/(panel)/reservas/[id]/page.tsx` (modify) | Mount `TaxDocsCard`; timeline label for corrected folio. |
| `app/admin/(panel)/reservas/[id]/actions.ts` (modify) | `recordBoletaAction` → `recordTaxDocFolioAction`. |
| `app/admin/(panel)/curso/inscripciones/[id]/page.tsx` (modify) | Mount `TaxDocsCard` with folio entry. |
| `app/admin/(panel)/curso/actions.ts` (modify) | `recordTaxDocFolioAction`. |
| `src/infrastructure/db/course-repository.ts`, `src/application/ports/course.ts` (modify) | Remove now-unused `taxDocumentsForOrder` / `CourseTaxDoc`. |
| `app/admin/(panel)/sii/page.tsx`, `actions.ts`, `loading.tsx` (new) | The queue page. |
| `components/admin/ui/Sidebar.tsx`, `components/admin/AdminShell.tsx` (modify) | "SII" nav item with badge. |
| `app/admin/(panel)/page.tsx` (modify) | Compact "por emitir" panel linking to `/admin/sii`. |

---

### Task 1: Domain — `describeTaxDocs` and `parseFolio`

**Files:**
- Create: `src/domain/tax/tax-doc-steps.ts`
- Test: `src/domain/tax/tax-doc-steps.test.ts`

**Interfaces:**
- Produces (used by every later task):
  ```ts
  export type TaxDocKind = "boleta" | "nota_credito";
  export type TaxDocStatus = "pendiente" | "emitida";
  export interface TaxDocRaw {
    id: string; orderId: string; kind: TaxDocKind; status: TaxDocStatus;
    folio: string | null; neto: number; iva: number; total: number;
    createdAt: string; emittedAt: string | null;
    reversesDocumentId: string | null; isLive: boolean; settlementOrderId: string | null;
  }
  export type TaxDocStepState = "por_emitir" | "bloqueada" | "emitida" | "anulada";
  export type TaxDocRole = "pago" | "delta" | "saldo" | "nc";
  export interface TaxDocStep {
    id: string; orderId: string; kind: TaxDocKind; state: TaxDocStepState; role: TaxDocRole;
    total: number; neto: number; iva: number; folio: string | null;
    createdAt: string; emittedAt: string | null;
    parentFolio: string | null; parentTotal: number | null;
    reversedByFolio: string | null; reversedByPending: boolean;
    saldoOfFolio: string | null; saldoOfTotal: number | null;
    razonReferencia: string | null;
    ageDays: number; atrasada: boolean; note: string | null; canRecord: boolean;
  }
  export function describeTaxDocs(docs: TaxDocRaw[], opts: { now: string }): TaxDocStep[];
  export function parseFolio(raw: string): { ok: true; folio: string } | { ok: false; error: string };
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/tax/tax-doc-steps.test.ts
import { describe, expect, it } from "vitest";
import { describeTaxDocs, parseFolio, type TaxDocRaw } from "./tax-doc-steps";

const ORDER = "o1";
const NOW = "2026-09-15T18:00:00.000Z"; // 15-09 15:00 Santiago

function doc(over: Partial<TaxDocRaw> & { id: string }): TaxDocRaw {
  return {
    orderId: ORDER,
    kind: "boleta",
    status: "pendiente",
    folio: null,
    neto: 8395,
    iva: 1595,
    total: 9990,
    createdAt: "2026-09-13T15:00:00.000000+00:00",
    emittedAt: null,
    reversesDocumentId: null,
    isLive: true,
    settlementOrderId: ORDER,
    ...over,
  };
}

const stepOf = (steps: ReturnType<typeof describeTaxDocs>, id: string) => {
  const s = steps.find((x) => x.id === id);
  if (!s) throw new Error(`no step ${id}`);
  return s;
};

describe("parseFolio", () => {
  it("rechaza vacío con un mensaje accionable", () => {
    expect(parseFolio("   ")).toEqual({ ok: false, error: "Ingresa el folio que asignó el SII." });
  });
  it("rechaza letras, espacios internos y más de 12 dígitos", () => {
    expect(parseFolio("12a").ok).toBe(false);
    expect(parseFolio("12 34").ok).toBe(false);
    expect(parseFolio("1234567890123").ok).toBe(false);
  });
  it("acepta dígitos y recorta espacios", () => {
    expect(parseFolio(" 001234 ")).toEqual({ ok: true, folio: "001234" });
  });
});

describe("describeTaxDocs — boleta sola", () => {
  it("boleta pendiente → por_emitir, rol pago, sin urgencia dentro del mes", () => {
    const [s] = describeTaxDocs([doc({ id: "b1" })], { now: NOW });
    expect(s.state).toBe("por_emitir");
    expect(s.role).toBe("pago");
    expect(s.ageDays).toBe(2);
    expect(s.atrasada).toBe(false);
    expect(s.canRecord).toBe(true);
    expect(s.note).toBeNull();
  });

  it("boleta emitida y viva → emitida con folio", () => {
    const [s] = describeTaxDocs([doc({ id: "b1", status: "emitida", folio: "1234", emittedAt: "2026-09-13T16:00:00Z" })], { now: NOW });
    expect(s.state).toBe("emitida");
    expect(s.folio).toBe("1234");
    expect(s.canRecord).toBe(true); // corregir
  });

  it("boleta delta (settlement ≠ order) → rol delta", () => {
    const [s] = describeTaxDocs([doc({ id: "b2", settlementOrderId: "delta-order" })], { now: NOW });
    expect(s.role).toBe("delta");
  });

  it("pendiente de un mes anterior → atrasada", () => {
    const [s] = describeTaxDocs([doc({ id: "b1", createdAt: "2026-08-31T23:30:00-04:00" })], { now: "2026-09-01T04:05:00.000Z" }); // 31-08 23:30 vs 01-09 00:05 Santiago (UTC-4 antes del DST de septiembre)
    expect(s.atrasada).toBe(true);
  });

  it("emitida de un mes anterior NO es atrasada (ya está hecha)", () => {
    const [s] = describeTaxDocs([doc({ id: "b1", status: "emitida", folio: "1", createdAt: "2026-08-01T15:00:00Z", emittedAt: "2026-08-01T16:00:00Z" })], { now: NOW });
    expect(s.atrasada).toBe(false);
  });
});

describe("describeTaxDocs — cadena de reembolso parcial", () => {
  const T = "2026-09-14T20:00:00.000000+00:00"; // misma tx: NC + saldo comparten created_at
  const chain = (parentFolio: string | null) => [
    doc({ id: "b1", status: parentFolio ? "emitida" : "pendiente", folio: parentFolio, isLive: false, emittedAt: parentFolio ? "2026-09-13T16:00:00Z" : null }),
    doc({ id: "nc1", kind: "nota_credito", total: 9990, reversesDocumentId: "b1", createdAt: T, settlementOrderId: null }),
    doc({ id: "b2", total: 5990, neto: 5034, iva: 956, createdAt: T }),
  ];

  it("con la boleta emitida: NC por_emitir que nombra el folio, saldo por_emitir no bloqueado", () => {
    const steps = describeTaxDocs(chain("1234"), { now: NOW });
    expect(steps.map((s) => s.id)).toEqual(["b1", "nc1", "b2"]);
    const b1 = stepOf(steps, "b1");
    expect(b1.state).toBe("anulada");
    expect(b1.reversedByPending).toBe(true);
    expect(b1.reversedByFolio).toBeNull();
    const nc = stepOf(steps, "nc1");
    expect(nc.state).toBe("por_emitir");
    expect(nc.role).toBe("nc");
    expect(nc.parentFolio).toBe("1234");
    expect(nc.parentTotal).toBe(9990);
    expect(nc.razonReferencia).toBe("Anula boleta N° 1234. Reembolso parcial: se reemite boleta por el saldo.");
    const saldo = stepOf(steps, "b2");
    expect(saldo.state).toBe("por_emitir");
    expect(saldo.role).toBe("saldo");
    expect(saldo.saldoOfFolio).toBe("1234");
    expect(saldo.saldoOfTotal).toBe(9990);
  });

  it("con la boleta aún pendiente: la boleta sigue por_emitir con nota, la NC queda bloqueada", () => {
    const steps = describeTaxDocs(chain(null), { now: NOW });
    const b1 = stepOf(steps, "b1");
    expect(b1.state).toBe("por_emitir");
    expect(b1.note).toBe("Ya está anulada por una nota de crédito: igual hay que emitirla en el SII y después la nota de crédito.");
    const nc = stepOf(steps, "nc1");
    expect(nc.state).toBe("bloqueada");
    expect(nc.canRecord).toBe(false);
    expect(nc.parentFolio).toBeNull();
    expect(nc.parentTotal).toBe(9990);
    expect(nc.razonReferencia).toBeNull();
    expect(stepOf(steps, "b2").saldoOfFolio).toBeNull();
  });

  it("NC emitida marca la boleta como anulada por ese folio", () => {
    const docs = chain("1234");
    docs[1] = { ...docs[1], status: "emitida", folio: "77", emittedAt: "2026-09-14T21:00:00Z" };
    const steps = describeTaxDocs(docs, { now: NOW });
    expect(stepOf(steps, "b1").reversedByFolio).toBe("77");
    expect(stepOf(steps, "b1").reversedByPending).toBe(false);
    expect(stepOf(steps, "nc1").state).toBe("emitida");
  });

  it("reembolso total: NC sin saldo gemelo → razón 'Anulación total'", () => {
    const steps = describeTaxDocs([
      doc({ id: "b1", status: "emitida", folio: "1234", isLive: false, emittedAt: "2026-09-13T16:00:00Z" }),
      doc({ id: "nc1", kind: "nota_credito", reversesDocumentId: "b1", createdAt: T, settlementOrderId: null }),
    ], { now: NOW });
    expect(stepOf(steps, "nc1").razonReferencia).toBe("Anula boleta N° 1234. Anulación total.");
  });
});

describe("describeTaxDocs — casos raros", () => {
  it("dos boletas del mismo total se distinguen por id, no por monto", () => {
    const T = "2026-09-14T20:00:00.000000+00:00";
    const steps = describeTaxDocs([
      doc({ id: "b1", status: "emitida", folio: "10", isLive: false, emittedAt: "2026-09-13T16:00:00Z" }),
      doc({ id: "b2", status: "emitida", folio: "11", createdAt: "2026-09-13T15:30:00.000000+00:00", emittedAt: "2026-09-13T16:00:00Z" }),
      doc({ id: "nc1", kind: "nota_credito", reversesDocumentId: "b1", createdAt: T, settlementOrderId: null }),
    ], { now: NOW });
    expect(stepOf(steps, "b1").state).toBe("anulada");
    expect(stepOf(steps, "b2").state).toBe("emitida");
    expect(stepOf(steps, "nc1").parentFolio).toBe("10");
  });

  it("NC sin vínculo (legacy) cae a la primera boleta emitida del mismo total", () => {
    const steps = describeTaxDocs([
      doc({ id: "b1", status: "emitida", folio: "10", emittedAt: "2026-09-13T16:00:00Z" }),
      doc({ id: "nc1", kind: "nota_credito", createdAt: "2026-09-14T20:00:00.000000+00:00", settlementOrderId: null }),
    ], { now: NOW });
    const nc = stepOf(steps, "nc1");
    expect(nc.state).toBe("por_emitir");
    expect(nc.parentFolio).toBe("10");
  });

  it("saldo con dos NC en la misma tx elige la NC cuya boleta comparte settlement", () => {
    const T = "2026-09-14T20:00:00.000000+00:00";
    const steps = describeTaxDocs([
      doc({ id: "b1", status: "emitida", folio: "10", isLive: false, emittedAt: "2026-09-13T16:00:00Z" }),
      doc({ id: "bd", status: "emitida", folio: "11", total: 3000, isLive: false, settlementOrderId: "delta", createdAt: "2026-09-13T15:30:00.000000+00:00", emittedAt: "2026-09-13T16:00:00Z" }),
      doc({ id: "nc1", kind: "nota_credito", reversesDocumentId: "b1", createdAt: T, settlementOrderId: null }),
      doc({ id: "nc2", kind: "nota_credito", total: 3000, reversesDocumentId: "bd", createdAt: T, settlementOrderId: null }),
      doc({ id: "bs", total: 1000, settlementOrderId: "delta", createdAt: T }),
    ], { now: NOW });
    expect(stepOf(steps, "bs").role).toBe("saldo");
    expect(stepOf(steps, "bs").saldoOfFolio).toBe("11");
  });

  it("orden cronológico estable por created_at y luego id", () => {
    const steps = describeTaxDocs([
      doc({ id: "z", createdAt: "2026-09-14T20:00:00.000000+00:00" }),
      doc({ id: "a", createdAt: "2026-09-14T20:00:00.000000+00:00" }),
      doc({ id: "m", createdAt: "2026-09-13T20:00:00.000000+00:00" }),
    ], { now: NOW });
    expect(steps.map((s) => s.id)).toEqual(["m", "a", "z"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/tax/tax-doc-steps.test.ts`
Expected: FAIL — "Cannot find module './tax-doc-steps'".

- [ ] **Step 3: Implement the domain module**

```ts
// src/domain/tax/tax-doc-steps.ts
import { DateTime } from "luxon";

/**
 * Cada fila de `tax_documents` traducida al PASO que el dueño tiene que hacer en
 * sii.cl. El modelo de datos ya sigue el procedimiento del SII para boletas
 * electrónicas (guías F1345/F1346/F1347-2025): no se modifica el monto de una
 * boleta — para bajar se anula con nota de crédito (NC) y se reemite por el saldo;
 * para subir se emite otra boleta. Acá solo se DESCRIBE esa cadena; nada se decide.
 *
 * Reglas que este módulo hace explícitas (y testeables, sin I/O):
 *  - Una NC no se puede emitir hasta que la boleta que anula tenga folio → `bloqueada`.
 *  - Una boleta con `is_live = false` está `anulada`, tenga o no folio la NC.
 *  - Una boleta pendiente Y anulada sigue `por_emitir` (el SII espera ambas), con nota.
 *  - Boleta creada en la MISMA transacción que una NC del pedido = boleta de saldo
 *    (`created_at` idéntico: now() es constante dentro de la tx).
 *  - Boleta financiada por otra orden (`settlement_order_id ≠ order_id`) = delta.
 *  - `atrasada` solo si sigue pendiente y nació en un mes calendario anterior
 *    (America/Santiago): período ya declarado → rectificar F29.
 */

const TZ = "America/Santiago";
export const MAX_FOLIO_LEN = 12;

export type TaxDocKind = "boleta" | "nota_credito";
export type TaxDocStatus = "pendiente" | "emitida";

/** Fila de `tax_documents` con las columnas que la UI necesita (espejo 1:1 del esquema). */
export interface TaxDocRaw {
  id: string;
  orderId: string;
  kind: TaxDocKind;
  status: TaxDocStatus;
  folio: string | null;
  neto: number;
  iva: number;
  total: number;
  createdAt: string;
  emittedAt: string | null;
  /** NC: la boleta que anula (`reverses_document_id`). */
  reversesDocumentId: string | null;
  /** Boleta: sigue viva (`reversed_clp < total`). Una NC siempre es `false`. */
  isLive: boolean;
  /** Boleta: qué orden (su pago) la financia. `null` en NC. */
  settlementOrderId: string | null;
}

export type TaxDocStepState = "por_emitir" | "bloqueada" | "emitida" | "anulada";
export type TaxDocRole = "pago" | "delta" | "saldo" | "nc";

export interface TaxDocStep {
  id: string;
  orderId: string;
  kind: TaxDocKind;
  state: TaxDocStepState;
  role: TaxDocRole;
  total: number;
  neto: number;
  iva: number;
  folio: string | null;
  createdAt: string;
  emittedAt: string | null;
  /** NC: folio de la boleta que anula (`null` si esa boleta sigue pendiente). */
  parentFolio: string | null;
  /** NC: total de la boleta que anula (`null` si no se pudo resolver). */
  parentTotal: number | null;
  /** Boleta anulada: folio de la NC que la anula (`null` si la NC sigue pendiente). */
  reversedByFolio: string | null;
  /** Boleta anulada por una NC que aún no tiene folio. */
  reversedByPending: boolean;
  /** Boleta de saldo: folio de la boleta anulada en la misma tx (`null` si pendiente). */
  saldoOfFolio: string | null;
  saldoOfTotal: number | null;
  /** NC por emitir: texto sugerido para "razón de referencia" del formulario del SII. */
  razonReferencia: string | null;
  ageDays: number;
  atrasada: boolean;
  /** Aviso corto cuando el paso tiene una trampa (boleta pendiente ya anulada). */
  note: string | null;
  /** Se puede registrar/corregir folio (todo salvo `bloqueada`). */
  canRecord: boolean;
}

export function parseFolio(raw: string): { ok: true; folio: string } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: false, error: "Ingresa el folio que asignó el SII." };
  if (!new RegExp(`^\\d{1,${MAX_FOLIO_LEN}}$`).test(s)) {
    return { ok: false, error: `El folio es un número (solo dígitos, hasta ${MAX_FOLIO_LEN}).` };
  }
  return { ok: true, folio: s };
}

const byChrono = (a: TaxDocRaw, b: TaxDocRaw) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function describeTaxDocs(docs: TaxDocRaw[], opts: { now: string }): TaxDocStep[] {
  const sorted = [...docs].sort(byChrono);
  const byId = new Map(sorted.map((d) => [d.id, d]));
  const now = DateTime.fromISO(opts.now).setZone(TZ);
  const nowMonth = now.startOf("month");

  // Boleta → la NC que la anula. Una boleta se anula a lo más una vez (las RPC siempre
  // reversan el monto vivo completo), así que el mapa es 1:1.
  const ncByParent = new Map<string, TaxDocRaw>();
  for (const d of sorted) if (d.kind === "nota_credito" && d.reversesDocumentId) ncByParent.set(d.reversesDocumentId, d);

  const sameTxNcs = (d: TaxDocRaw) =>
    sorted.filter((x) => x.kind === "nota_credito" && x.orderId === d.orderId && x.createdAt === d.createdAt);

  /** Boleta padre de una NC: el vínculo duro, o (legacy sin vínculo) la primera boleta emitida del mismo total. */
  const parentOf = (nc: TaxDocRaw): TaxDocRaw | null => {
    if (nc.reversesDocumentId) return byId.get(nc.reversesDocumentId) ?? null;
    return sorted.find((x) => x.kind === "boleta" && x.orderId === nc.orderId && x.total === nc.total && x.status === "emitida") ?? null;
  };

  return sorted.map((d): TaxDocStep => {
    const created = DateTime.fromISO(d.createdAt).setZone(TZ);
    const ageDays = Math.max(0, Math.floor(now.diff(created, "days").days));
    const atrasada = d.status === "pendiente" && created.startOf("month") < nowMonth;
    const base = {
      id: d.id, orderId: d.orderId, kind: d.kind, total: d.total, neto: d.neto, iva: d.iva,
      folio: d.folio, createdAt: d.createdAt, emittedAt: d.emittedAt,
      parentFolio: null, parentTotal: null, reversedByFolio: null, reversedByPending: false,
      saldoOfFolio: null, saldoOfTotal: null, razonReferencia: null, ageDays, atrasada, note: null,
    };

    if (d.kind === "nota_credito") {
      const parent = parentOf(d);
      const state: TaxDocStepState =
        d.status === "emitida" ? "emitida" : parent && !parent.folio ? "bloqueada" : "por_emitir";
      const hasSaldoTwin = sorted.some((x) => x.kind === "boleta" && x.orderId === d.orderId && x.createdAt === d.createdAt);
      const razon =
        state === "por_emitir"
          ? `${parent?.folio ? `Anula boleta N° ${parent.folio}.` : "Anula boleta de este pedido."} ${hasSaldoTwin ? "Reembolso parcial: se reemite boleta por el saldo." : "Anulación total."}`
          : null;
      return { ...base, state, role: "nc", parentFolio: parent?.folio ?? null, parentTotal: parent?.total ?? null, razonReferencia: razon, canRecord: state !== "bloqueada" };
    }

    // Boleta
    const reversedBy = ncByParent.get(d.id) ?? null;
    const twins = sameTxNcs(d);
    const role: TaxDocRole =
      d.settlementOrderId && d.settlementOrderId !== d.orderId && twins.length === 0 ? "delta" : twins.length > 0 ? "saldo" : "pago";
    // Saldo: qué boleta reemplaza. Con varias NC en la misma tx, la que anuló una boleta
    // financiada por el MISMO pago que este saldo (create_boleta_amount(…, v_setts[i])).
    let saldoOf: TaxDocRaw | null = null;
    if (role === "saldo") {
      const parents = twins.map((nc) => parentOf(nc)).filter((p): p is TaxDocRaw => !!p);
      saldoOf = parents.find((p) => p.settlementOrderId === d.settlementOrderId) ?? parents[0] ?? null;
    }
    const state: TaxDocStepState = d.status === "pendiente" ? "por_emitir" : d.isLive ? "emitida" : "anulada";
    const note =
      d.status === "pendiente" && !d.isLive
        ? "Ya está anulada por una nota de crédito: igual hay que emitirla en el SII y después la nota de crédito."
        : null;
    return {
      ...base, state, role,
      reversedByFolio: reversedBy?.folio ?? null,
      reversedByPending: !!reversedBy && !reversedBy.folio,
      saldoOfFolio: saldoOf?.folio ?? null,
      saldoOfTotal: saldoOf?.total ?? null,
      note,
      canRecord: true,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/tax/tax-doc-steps.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
/opt/homebrew/bin/git add src/domain/tax/tax-doc-steps.ts src/domain/tax/tax-doc-steps.test.ts
/opt/homebrew/bin/git commit -m "feat(sii): derivador puro de pasos SII por documento tributario"
```

---

### Task 2: Repository reads — enriched docs, reservation/queue lookups

**Files:**
- Modify: `src/infrastructure/db/admin-repository.ts` (types near line 76-92 and 180-205; `getBooking` block around lines 660-675; add methods after `pendingBoletas()` ~line 771)
- Test: `src/infrastructure/db/tax-docs.itest.ts` (new)

**Interfaces:**
- Consumes: `TaxDocRaw` from Task 1.
- Produces:
  ```ts
  export type PendingTaxDocContext =
    | { kind: "reserva"; reservationId: string; customerName: string | null; startsAt: string }
    | { kind: "curso"; enrollmentId: string; studentName: string; generationCode: string }
    | { kind: "pedido"; customerName: string | null };
  export interface PendingTaxDocGroup { orderId: string; oldestPendingAt: string; docs: TaxDocRaw[]; context: PendingTaxDocContext }
  export interface PendingTaxDocsSummary { count: number; oldestCreatedAt: string | null }
  class SupabaseAdminRepository {
    taxDocsForOrders(orderIds: string[]): Promise<TaxDocRaw[]>
    taxDocsForOrder(orderId: string): Promise<TaxDocRaw[]>
    taxDocsForReservation(reservationId: string, orderId: string | null): Promise<TaxDocRaw[]>
    taxDocsForOrderOf(docId: string): Promise<TaxDocRaw[] | null>
    pendingTaxDocsQueue(): Promise<PendingTaxDocGroup[]>
    pendingTaxDocsSummary(): Promise<PendingTaxDocsSummary>
  }
  // AdminBookingDetail.taxDocs is now TaxDocRaw[]; DashboardData gains oldestPendingDocAt: string | null
  ```

- [ ] **Step 1: Write the failing integration test**

```ts
// src/infrastructure/db/tax-docs.itest.ts
/**
 * Lecturas de documentos tributarios para la superficie SII del admin: columnas
 * completas (vínculo NC→boleta, is_live, settlement), docs por reserva (incluye
 * órdenes delta) y la cola de pendientes agrupada por pedido. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { futureDate } from "@/tests/dates";
import { SupabaseAdminRepository } from "./admin-repository";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseAdminRepository(db);
const checkout = new CheckoutService(new PricingService(new SupabaseRatePlanRepository(db)), new SupabaseCheckoutRepository(db));
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

const cleanup =
  "truncate course_credits, course_enrollments, course_sessions, course_generations, " +
  "reservations, orders, order_lines, tax_documents, payment_intents, reschedules, booking_events, customers cascade";
const MON = futureDate(1);

const reservationOf = async (orderId: string) =>
  (await pg.query<{ id: string }>("select id from reservations where order_id=$1", [orderId])).rows[0].id;

/** Reserva manual pagada en efectivo → 1 boleta pendiente. */
async function paid(start: number, email: string) {
  const b = await checkout.createBooking({ resourceId, date: MON, startMinute: start, durationHours: 1, customer: { email } });
  if (!b.ok) throw new Error(b.error);
  await repo.confirmOffline(b.value.orderId, "efectivo");
  return b.value.orderId;
}

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe("taxDocsForOrder", () => {
  it("boleta del pago con settlement = su pedido, viva, pendiente", async () => {
    const orderId = await paid(600, "a@e.cl");
    const docs = await repo.taxDocsForOrder(orderId);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ orderId, kind: "boleta", status: "pendiente", folio: null, isLive: true, settlementOrderId: orderId, reversesDocumentId: null });
    expect(docs[0].total).toBe(docs[0].neto + docs[0].iva);
  });

  it("reembolso parcial → boleta anulada + NC enlazada + saldo en la misma tx", async () => {
    const orderId = await paid(660, "b@e.cl");
    const [orig] = await repo.taxDocsForOrder(orderId);
    await pg.query("select mark_refunded($1, $2, $3)", [orderId, "rf_1", 4000]);
    const docs = await repo.taxDocsForOrder(orderId);
    expect(docs.map((d) => d.kind)).toEqual(["boleta", "nota_credito", "boleta"]);
    expect(docs[0]).toMatchObject({ id: orig.id, isLive: false });
    expect(docs[1]).toMatchObject({ reversesDocumentId: orig.id, total: orig.total, isLive: false });
    expect(docs[2]).toMatchObject({ total: orig.total - 4000, isLive: true, settlementOrderId: orderId });
    expect(docs[2].createdAt).toBe(docs[1].createdAt);
  });
});

describe("taxDocsForReservation / taxDocsForOrderOf", () => {
  it("resuelve por la orden de la reserva y por el id de un documento", async () => {
    const orderId = await paid(720, "c@e.cl");
    const resId = await reservationOf(orderId);
    const viaRes = await repo.taxDocsForReservation(resId, orderId);
    expect(viaRes).toHaveLength(1);
    const viaDoc = await repo.taxDocsForOrderOf(viaRes[0].id);
    expect(viaDoc?.map((d) => d.id)).toEqual([viaRes[0].id]);
    expect(await repo.taxDocsForOrderOf("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("pendingTaxDocsQueue / pendingTaxDocsSummary", () => {
  it("agrupa por pedido, más antiguo primero, con contexto de reserva y TODOS los docs del pedido", async () => {
    const o1 = await paid(780, "d@e.cl");
    const o2 = await paid(840, "e@e.cl");
    await pg.query("select mark_refunded($1, $2, $3)", [o1, "rf_2", 4000]);
    const q = await repo.pendingTaxDocsQueue();
    expect(q.map((g) => g.orderId)).toEqual([o1, o2]);
    expect(q[0].docs).toHaveLength(3);
    expect(q[0].context).toMatchObject({ kind: "reserva", reservationId: await reservationOf(o1) });
    const s = await repo.pendingTaxDocsSummary();
    // o1: boleta original (pendiente y anulada) + NC + saldo = 3; o2: boleta = 1.
    expect(s.count).toBe(4);
    expect(s.oldestCreatedAt).toBe(q[0].docs[0].createdAt);
  });

  it("sin pendientes → cola vacía y resumen en cero", async () => {
    expect(await repo.pendingTaxDocsQueue()).toEqual([]);
    expect(await repo.pendingTaxDocsSummary()).toEqual({ count: 0, oldestCreatedAt: null });
  });
});
```

- [ ] **Step 2: Run the itest to verify it fails**

Run: `npm run db:start` (once), then `npm run test:integration -- src/infrastructure/db/tax-docs.itest.ts`
Expected: FAIL — `repo.taxDocsForOrder is not a function`.

- [ ] **Step 3: Add types and the `TaxDocRaw` mapper**

In `src/infrastructure/db/admin-repository.ts`, add the import at the top with the other `@/src/domain` imports:

```ts
import type { TaxDocRaw } from "@/src/domain/tax/tax-doc-steps";
```

Replace the inline `taxDocs: { id: string; kind: string; ... }[]` block inside `AdminBookingDetail` (lines ~80-88) with:

```ts
  /** Todos los documentos tributarios de la reserva (su pedido + órdenes delta). */
  taxDocs: TaxDocRaw[];
```

Add after the `PendingBoleta` interface (~line 205):

```ts
export type PendingTaxDocContext =
  | { kind: "reserva"; reservationId: string; customerName: string | null; startsAt: string }
  | { kind: "curso"; enrollmentId: string; studentName: string; generationCode: string }
  | { kind: "pedido"; customerName: string | null };

/** Un pedido con ≥1 documento pendiente, con TODOS sus documentos (la NC bloqueada nombra a su padre). */
export interface PendingTaxDocGroup {
  orderId: string;
  oldestPendingAt: string;
  docs: TaxDocRaw[];
  context: PendingTaxDocContext;
}

export interface PendingTaxDocsSummary {
  count: number;
  oldestCreatedAt: string | null;
}

const TAX_DOC_SELECT =
  "id, order_id, kind, status, folio, neto, iva, total, created_at, emitted_at, reverses_document_id, is_live, reversed_clp, settlement_order_id";

type TaxDocRow = {
  id: string; order_id: string; kind: "boleta" | "nota_credito"; status: "pendiente" | "emitida";
  folio: string | null; neto: number; iva: number; total: number; created_at: string; emitted_at: string | null;
  reverses_document_id: string | null; is_live: boolean | null; reversed_clp: number; settlement_order_id: string | null;
};

const toTaxDocRaw = (d: TaxDocRow): TaxDocRaw => ({
  id: d.id,
  orderId: d.order_id,
  kind: d.kind,
  status: d.status,
  folio: d.folio,
  neto: d.neto,
  iva: d.iva,
  total: d.total,
  createdAt: d.created_at,
  emittedAt: d.emitted_at,
  reversesDocumentId: d.reverses_document_id,
  // Columna generada (tipada nullable por PostgREST): misma expresión que el esquema.
  isLive: d.is_live ?? (d.kind === "boleta" && d.reversed_clp < d.total),
  settlementOrderId: d.settlement_order_id,
});
```

Add `oldestPendingDocAt: string | null;` to `DashboardData` right after `pendingBoletas: number;`.

- [ ] **Step 4: Add the read methods**

Insert right before `async pendingBoletas()` (~line 771):

```ts
  // ── Documentos tributarios (superficie SII) ──────────────────────────────

  async taxDocsForOrders(orderIds: string[]): Promise<TaxDocRaw[]> {
    if (orderIds.length === 0) return [];
    const { data, error } = await this.db
      .from("tax_documents")
      .select(TAX_DOC_SELECT)
      .in("order_id", orderIds)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toTaxDocRaw);
  }

  async taxDocsForOrder(orderId: string): Promise<TaxDocRaw[]> {
    return this.taxDocsForOrders([orderId]);
  }

  /**
   * Documentos de una reserva: los de su pedido + los de sus órdenes delta. La boleta
   * de un encarecimiento con slot tomado vive en la orden de DELTA (apply_reschedule_charge),
   * y sin este fallback la ficha no la mostraría nunca.
   */
  async taxDocsForReservation(reservationId: string, orderId: string | null): Promise<TaxDocRaw[]> {
    const { data, error } = await this.db
      .from("reschedules")
      .select("delta_order_id")
      .eq("reservation_id", reservationId)
      .not("delta_order_id", "is", null);
    if (error) throw new Error(error.message);
    const ids = [...(orderId ? [orderId] : []), ...(data ?? []).map((r) => r.delta_order_id!)];
    return this.taxDocsForOrders([...new Set(ids)]);
  }

  /** Todos los documentos del pedido al que pertenece `docId`; `null` si el doc no existe. */
  async taxDocsForOrderOf(docId: string): Promise<TaxDocRaw[] | null> {
    const { data, error } = await this.db.from("tax_documents").select("order_id").eq("id", docId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return this.taxDocsForOrder(data.order_id);
  }

  /** Cola SII: pedidos con algo pendiente, más antiguo primero, con todos sus docs y a dónde ir. */
  async pendingTaxDocsQueue(): Promise<PendingTaxDocGroup[]> {
    const { data: pend, error } = await this.db
      .from("tax_documents")
      .select("order_id, created_at")
      .eq("status", "pendiente")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const oldest = new Map<string, string>();
    for (const p of pend ?? []) if (!oldest.has(p.order_id)) oldest.set(p.order_id, p.created_at);
    const orderIds = [...oldest.keys()];
    if (orderIds.length === 0) return [];

    const [docs, res, deltas, enr, ords] = await Promise.all([
      this.taxDocsForOrders(orderIds),
      this.db.from("reservations").select("id, order_id, customer_name, starts_at").in("order_id", orderIds).eq("kind", "booking"),
      this.db.from("reschedules").select("delta_order_id, reservation_id").in("delta_order_id", orderIds),
      this.db.from("course_enrollments").select("id, order_id, student_name, course_generations(code)").in("order_id", orderIds),
      this.db.from("orders").select("id, customer_name").in("id", orderIds),
    ]);
    // Reservas alcanzadas solo vía orden delta: segundo lookup por id.
    const deltaResIds = [...new Set((deltas.data ?? []).map((d) => d.reservation_id))];
    const viaDelta = deltaResIds.length
      ? await this.db.from("reservations").select("id, order_id, customer_name, starts_at").in("id", deltaResIds)
      : { data: [] as { id: string; order_id: string | null; customer_name: string | null; starts_at: string }[] };

    const resByOrder = new Map((res.data ?? []).map((r) => [r.order_id, r]));
    const resById = new Map((viaDelta.data ?? []).map((r) => [r.id, r]));
    const deltaToRes = new Map((deltas.data ?? []).map((d) => [d.delta_order_id, d.reservation_id]));
    // Un dúo son dos inscripciones sobre el mismo pedido: con una basta para ir a la ficha.
    const enrByOrder = new Map((enr.data ?? []).map((e) => [e.order_id, e]));
    const orderName = new Map((ords.data ?? []).map((o) => [o.id, o.customer_name]));
    const docsByOrder = new Map<string, TaxDocRaw[]>();
    for (const d of docs) docsByOrder.set(d.orderId, [...(docsByOrder.get(d.orderId) ?? []), d]);

    const context = (orderId: string): PendingTaxDocContext => {
      const r = resByOrder.get(orderId) ?? resById.get(deltaToRes.get(orderId) ?? "");
      if (r) return { kind: "reserva", reservationId: r.id, customerName: r.customer_name, startsAt: r.starts_at };
      const e = enrByOrder.get(orderId);
      if (e) return { kind: "curso", enrollmentId: e.id, studentName: e.student_name, generationCode: e.course_generations?.code ?? "" };
      return { kind: "pedido", customerName: orderName.get(orderId) ?? null };
    };

    return orderIds
      .map((orderId) => ({ orderId, oldestPendingAt: oldest.get(orderId)!, docs: docsByOrder.get(orderId) ?? [], context: context(orderId) }))
      .sort((a, b) => a.oldestPendingAt.localeCompare(b.oldestPendingAt));
  }

  async pendingTaxDocsSummary(): Promise<PendingTaxDocsSummary> {
    const { data, count, error } = await this.db
      .from("tax_documents")
      .select("created_at", { count: "exact" })
      .eq("status", "pendiente")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    return { count: count ?? 0, oldestCreatedAt: data?.[0]?.created_at ?? null };
  }
```

- [ ] **Step 5: Switch `getBooking` to the new read and feed the dashboard field**

In `getBooking` (~lines 660-675) replace the block from `// Todos los documentos tributarios (boletas + NC)…` through the `taxDocs = (docs ?? []).map(...)` closing with:

```ts
      taxDocs = await this.taxDocsForReservation(id, base.orderId);
```

(`let taxDocs: AdminBookingDetail["taxDocs"] = [];` above it stays.) Note `id` is the reservation id parameter of `getBooking`.

In `dashboard()` add `this.pendingTaxDocsSummary()` to the `Promise.all` array (as a fifth element named `docsSummary`) and, in the returned object, `oldestPendingDocAt: docsSummary.oldestCreatedAt`. Keep `boletas` and `pendingBoletas` as they are for now (the dashboard page still reads them; Task 8 removes them).

- [ ] **Step 6: Typecheck and run the itest**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "src/infrastructure/db/reschedule.itest.ts" | head` (that file has 20 pre-existing errors — ignore those)
Expected: no errors in `admin-repository.ts` or the reservas page.

Run: `npm run test:integration -- src/infrastructure/db/tax-docs.itest.ts`
Expected: PASS.

Then: `npm run db:reset`.

- [ ] **Step 7: Commit**

```bash
/opt/homebrew/bin/git add src/infrastructure/db/admin-repository.ts src/infrastructure/db/tax-docs.itest.ts
/opt/homebrew/bin/git commit -m "feat(sii): lecturas enriquecidas de documentos tributarios + cola de pendientes"
```

---

### Task 3: Record folio — port, service, repository writes, timeline event

**Files:**
- Create: `src/application/ports/tax-docs.ts`
- Create: `src/application/admin/tax-doc-service.ts`
- Test: `src/application/admin/tax-doc-service.test.ts`
- Modify: `src/infrastructure/db/admin-repository.ts` (replace `recordBoleta` ~line 1001)
- Modify: `src/composition.ts` (add factory near `adminRepository`)
- Test: `src/infrastructure/db/tax-docs.itest.ts` (append a `describe`)

**Interfaces:**
- Consumes: `describeTaxDocs`, `parseFolio`, `TaxDocRaw` (Task 1); `taxDocsForOrderOf` (Task 2).
- Produces:
  ```ts
  // src/application/ports/tax-docs.ts
  export interface TaxDocRepository {
    taxDocsForOrderOf(docId: string): Promise<TaxDocRaw[] | null>;
    recordTaxDocFolio(docId: string, folio: string, firstTime: boolean): Promise<void>;
    logTaxDocEmitted(doc: TaxDocRaw, folio: string, previousFolio: string | null, actor: string | null): Promise<void>;
  }
  // src/application/admin/tax-doc-service.ts
  export class TaxDocService { recordFolio(docId: string, rawFolio: string, actor: string | null): Promise<{ corrected: boolean }> }
  // src/composition.ts
  export function taxDocService(client?: SupabaseClient<Database>): TaxDocService
  ```

- [ ] **Step 1: Write the failing unit test for the service**

```ts
// src/application/admin/tax-doc-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { TaxDocRaw } from "@/src/domain/tax/tax-doc-steps";
import type { TaxDocRepository } from "@/src/application/ports/tax-docs";
import { TaxDocService } from "./tax-doc-service";

const T = "2026-09-14T20:00:00.000000+00:00";
const boleta: TaxDocRaw = {
  id: "b1", orderId: "o1", kind: "boleta", status: "pendiente", folio: null, neto: 8395, iva: 1595, total: 9990,
  createdAt: "2026-09-13T15:00:00.000000+00:00", emittedAt: null, reversesDocumentId: null, isLive: false, settlementOrderId: "o1",
};
const nc: TaxDocRaw = { ...boleta, id: "nc1", kind: "nota_credito", reversesDocumentId: "b1", createdAt: T, settlementOrderId: null };

function fakeRepo(docs: TaxDocRaw[] | null) {
  const repo: TaxDocRepository = {
    taxDocsForOrderOf: vi.fn(async () => docs),
    recordTaxDocFolio: vi.fn(async () => {}),
    logTaxDocEmitted: vi.fn(async () => {}),
  };
  return repo;
}

describe("TaxDocService.recordFolio", () => {
  it("folio vacío → error del dominio, sin tocar el repo", async () => {
    const repo = fakeRepo([boleta]);
    await expect(new TaxDocService(repo).recordFolio("b1", "  ", null)).rejects.toThrow("Ingresa el folio que asignó el SII.");
    expect(repo.recordTaxDocFolio).not.toHaveBeenCalled();
  });

  it("documento inexistente → error", async () => {
    await expect(new TaxDocService(fakeRepo(null)).recordFolio("x", "1", null)).rejects.toThrow("Documento no encontrado.");
  });

  it("NC bloqueada (boleta padre sin folio) → rechazada nombrando el monto", async () => {
    const repo = fakeRepo([boleta, nc]);
    await expect(new TaxDocService(repo).recordFolio("nc1", "77", null)).rejects.toThrow("Primero registra el folio de la boleta de $9.990.");
    expect(repo.recordTaxDocFolio).not.toHaveBeenCalled();
  });

  it("boleta pendiente → registra (firstTime) y loguea el evento con el actor", async () => {
    const repo = fakeRepo([boleta, nc]);
    const out = await new TaxDocService(repo).recordFolio("b1", " 1234 ", "uid-1");
    expect(out).toEqual({ corrected: false });
    expect(repo.recordTaxDocFolio).toHaveBeenCalledWith("b1", "1234", true);
    expect(repo.logTaxDocEmitted).toHaveBeenCalledWith(boleta, "1234", null, "uid-1");
  });

  it("corregir un folio ya registrado → firstTime=false y previous en el evento", async () => {
    const emitida = { ...boleta, status: "emitida" as const, folio: "1234", isLive: true };
    const repo = fakeRepo([emitida]);
    const out = await new TaxDocService(repo).recordFolio("b1", "1243", null);
    expect(out).toEqual({ corrected: true });
    expect(repo.recordTaxDocFolio).toHaveBeenCalledWith("b1", "1243", false);
    expect(repo.logTaxDocEmitted).toHaveBeenCalledWith(emitida, "1243", "1234", null);
  });

  it("mismo folio de nuevo → no-op sin escritura ni evento", async () => {
    const emitida = { ...boleta, status: "emitida" as const, folio: "1234", isLive: true };
    const repo = fakeRepo([emitida]);
    expect(await new TaxDocService(repo).recordFolio("b1", "1234", null)).toEqual({ corrected: false });
    expect(repo.recordTaxDocFolio).not.toHaveBeenCalled();
    expect(repo.logTaxDocEmitted).not.toHaveBeenCalled();
  });

  it("si el log del evento falla, el folio igual queda registrado y no se lanza", async () => {
    const repo = fakeRepo([boleta]);
    (repo.logTaxDocEmitted as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(new TaxDocService(repo).recordFolio("b1", "1", null)).resolves.toEqual({ corrected: false });
    expect(repo.recordTaxDocFolio).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/application/admin/tax-doc-service.test.ts`
Expected: FAIL — cannot find `./tax-doc-service` / `@/src/application/ports/tax-docs`.

- [ ] **Step 3: Write the port and the service**

```ts
// src/application/ports/tax-docs.ts
import type { TaxDocRaw } from "@/src/domain/tax/tax-doc-steps";

/** Lo que el servicio de folios necesita de la persistencia (lo implementa SupabaseAdminRepository). */
export interface TaxDocRepository {
  /** Todos los documentos del pedido al que pertenece `docId`; `null` si no existe. */
  taxDocsForOrderOf(docId: string): Promise<TaxDocRaw[] | null>;
  /** Marca emitida con folio. `firstTime` fija `emitted_at`; una corrección lo conserva. */
  recordTaxDocFolio(docId: string, folio: string, firstTime: boolean): Promise<void>;
  /** Evento `boleta_emitted` / `nota_credito_emitted` en el timeline de la reserva del pedido (si tiene). */
  logTaxDocEmitted(doc: TaxDocRaw, folio: string, previousFolio: string | null, actor: string | null): Promise<void>;
}
```

```ts
// src/application/admin/tax-doc-service.ts
import type { TaxDocRepository } from "@/src/application/ports/tax-docs";
import { formatCLP } from "@/src/domain/money/money";
import { describeTaxDocs, parseFolio } from "@/src/domain/tax/tax-doc-steps";

/**
 * Registrar el folio que el SII asignó a un documento. La app NO emite nada: el
 * dueño emite en sii.cl y acá se anota el folio. El guard real vive acá (no en el
 * input deshabilitado): una NC cuya boleta sigue sin folio se rechaza porque el
 * SII no puede referenciarla todavía.
 */
export class TaxDocService {
  constructor(private readonly repo: TaxDocRepository) {}

  async recordFolio(docId: string, rawFolio: string, actor: string | null): Promise<{ corrected: boolean }> {
    const parsed = parseFolio(rawFolio);
    if (!parsed.ok) throw new Error(parsed.error);

    const docs = await this.repo.taxDocsForOrderOf(docId);
    const doc = docs?.find((d) => d.id === docId);
    if (!docs || !doc) throw new Error("Documento no encontrado.");

    const step = describeTaxDocs(docs, { now: new Date().toISOString() }).find((s) => s.id === docId)!;
    if (step.state === "bloqueada") {
      throw new Error(`Primero registra el folio de la boleta de ${formatCLP(step.parentTotal ?? 0)}.`);
    }
    const previous = doc.folio;
    if (previous === parsed.folio) return { corrected: false };

    await this.repo.recordTaxDocFolio(docId, parsed.folio, previous === null);
    // Best-effort, NO throw: el folio ya quedó guardado; un fallo del log solo deja un
    // hueco en el timeline (mismo criterio que la cortesía en admin-repository).
    await this.repo.logTaxDocEmitted(doc, parsed.folio, previous, actor).catch((e) => console.error("[taxdoc:event]", e));
    return { corrected: previous !== null };
  }
}
```

- [ ] **Step 4: Run the unit test**

Run: `npx vitest run src/application/admin/tax-doc-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the repository writes (replacing `recordBoleta`)**

In `admin-repository.ts`, replace the whole `async recordBoleta(...)` method (~lines 1001-1007) with:

```ts
  /** Marca emitida con folio. Primera vez fija `emitted_at`; una corrección lo conserva. */
  async recordTaxDocFolio(docId: string, folio: string, firstTime: boolean): Promise<void> {
    const patch = firstTime ? { status: "emitida" as const, folio, emitted_at: new Date().toISOString() } : { folio };
    const { error } = await this.db.from("tax_documents").update(patch).eq("id", docId);
    if (error) throw new Error(error.message);
  }

  /**
   * Evento de timeline al registrar un folio. La reserva se resuelve por la orden del
   * documento, con fallback a `reschedules.delta_order_id` (la boleta delta de un
   * encarecimiento con slot tomado vive en la orden de delta). Un pedido de curso sin
   * reserva no loguea: no tiene timeline. Lanza si el RPC falla; el servicio lo captura.
   */
  async logTaxDocEmitted(doc: TaxDocRaw, folio: string, previousFolio: string | null, actor: string | null): Promise<void> {
    const { data: r } = await this.db
      .from("reservations").select("id").eq("order_id", doc.orderId).eq("kind", "booking").limit(1).maybeSingle();
    let reservationId = r?.id ?? null;
    if (!reservationId) {
      const { data: d } = await this.db
        .from("reschedules").select("reservation_id").eq("delta_order_id", doc.orderId).limit(1).maybeSingle();
      reservationId = d?.reservation_id ?? null;
    }
    if (!reservationId) return;
    const { error } = await this.db.rpc("log_booking_event", {
      p_reservation: reservationId,
      p_type: doc.kind === "boleta" ? "boleta_emitted" : "nota_credito_emitted",
      p_order: doc.orderId,
      p_tax_doc: doc.id,
      p_amount: doc.total,
      p_detail: previousFolio ? { folio, previous_folio: previousFolio } : { folio },
      p_created_by: actor ?? undefined,
    });
    if (error) throw new Error(error.message);
  }
```

Also add `previous_folio?: string | null;` to `BookingTimelineEvent.detail` (right after `folio?: string | null;`, ~line 133).

- [ ] **Step 6: Wire composition**

In `src/composition.ts`, after `adminRepository(...)`:

```ts
import { TaxDocService } from "@/src/application/admin/tax-doc-service";
// …
/** Registro de folios SII (la app no emite; anota lo que el dueño emitió en sii.cl). */
export function taxDocService(client: SupabaseClient<Database> = db()): TaxDocService {
  return new TaxDocService(adminRepository(client));
}
```

- [ ] **Step 7: Append the integration test for the record flow**

Append to `src/infrastructure/db/tax-docs.itest.ts`:

```ts
import { TaxDocService } from "@/src/application/admin/tax-doc-service";

describe("recordFolio (servicio + repo)", () => {
  const svc = new TaxDocService(repo);
  const events = (resId: string) =>
    pg.query<{ type: string; detail: { folio?: string; previous_folio?: string } | null; tax_document_id: string | null }>(
      "select type, detail, tax_document_id from booking_events where reservation_id=$1 and type in ('boleta_emitted','nota_credito_emitted') order by occurred_at, seq",
      [resId]);

  it("boleta: queda emitida con folio + emitted_at y deja boleta_emitted en el timeline", async () => {
    const orderId = await paid(600, "f@e.cl");
    const [b] = await repo.taxDocsForOrder(orderId);
    await svc.recordFolio(b.id, "1234", null);
    const after = (await repo.taxDocsForOrder(orderId))[0];
    expect(after).toMatchObject({ status: "emitida", folio: "1234" });
    expect(after.emittedAt).not.toBeNull();
    const ev = await events(await reservationOf(orderId));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "boleta_emitted", tax_document_id: b.id, detail: { folio: "1234" } });
  });

  it("NC bloqueada se rechaza; tras el folio de la boleta se registra y loguea", async () => {
    const orderId = await paid(660, "g@e.cl");
    await pg.query("select mark_refunded($1, $2, $3)", [orderId, "rf_3", 9990]);
    const [b, nc] = await repo.taxDocsForOrder(orderId);
    await expect(svc.recordFolio(nc.id, "77", null)).rejects.toThrow("Primero registra el folio de la boleta");
    await svc.recordFolio(b.id, "1234", null);
    await svc.recordFolio(nc.id, "77", null);
    const docs = await repo.taxDocsForOrder(orderId);
    expect(docs.find((d) => d.id === nc.id)).toMatchObject({ status: "emitida", folio: "77" });
    const ev = await events(await reservationOf(orderId));
    expect(ev.map((e) => e.type)).toEqual(["boleta_emitted", "nota_credito_emitted"]);
  });

  it("corregir folio conserva emitted_at y loguea previous_folio", async () => {
    const orderId = await paid(720, "h@e.cl");
    const [b] = await repo.taxDocsForOrder(orderId);
    await svc.recordFolio(b.id, "1234", null);
    const first = (await repo.taxDocsForOrder(orderId))[0].emittedAt;
    await svc.recordFolio(b.id, "1243", null);
    const after = (await repo.taxDocsForOrder(orderId))[0];
    expect(after.folio).toBe("1243");
    expect(after.emittedAt).toBe(first);
    const ev = await events(await reservationOf(orderId));
    expect(ev[1].detail).toEqual({ folio: "1243", previous_folio: "1234" });
  });
});
```

(Move the `import { TaxDocService } …` line up with the other imports at the top of the file.)

- [ ] **Step 8: Run the itest, reset, typecheck**

Run: `npm run test:integration -- src/infrastructure/db/tax-docs.itest.ts` → Expected: PASS.
Run: `npm run db:reset`.
Run: `npx tsc --noEmit -p . 2>&1 | grep -v reschedule.itest | head` → Expected: only errors about `recordBoletaAction` in `app/admin/(panel)/reservas/[id]/actions.ts` (it still calls the removed `recordBoleta`; Task 5 fixes it). If you prefer green at every commit, do Task 5's Step 2 now.

- [ ] **Step 9: Commit**

```bash
/opt/homebrew/bin/git add src/application/ports/tax-docs.ts src/application/admin/tax-doc-service.ts src/application/admin/tax-doc-service.test.ts src/infrastructure/db/admin-repository.ts src/infrastructure/db/tax-docs.itest.ts src/composition.ts
/opt/homebrew/bin/git commit -m "feat(sii): servicio de registro de folio con guard de NC bloqueada y evento de timeline"
```

---

### Task 4: Shared UI — StatusPill states, step copy, `TaxDocStepRow`, `TaxDocsCard`

**Files:**
- Modify: `components/admin/ui/StatusPill.tsx` (MAP, after `emitida`)
- Create: `components/admin/tax-docs/sii-links.ts`
- Create: `components/admin/tax-docs/step-copy.ts`
- Test: `components/admin/tax-docs/step-copy.test.ts`
- Create: `components/admin/tax-docs/TaxDocStepRow.tsx`
- Create: `components/admin/tax-docs/TaxDocsCard.tsx`

**Interfaces:**
- Consumes: `TaxDocStep` (Task 1); `ActionForm`, `Input`, `SubmitButton`, `CopyButton`, `StatusPill`, `Card`, `btn`, `fmtDate`, `formatCLP`.
- Produces:
  ```ts
  export type RecordFolioAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  export function TaxDocStepRow(p: { step: TaxDocStep; action: RecordFolioAction; backPath: string; canRecord: boolean }): JSX
  export function TaxDocsCard(p: { steps: TaxDocStep[]; action: RecordFolioAction; backPath: string; canRecord: boolean; title?: string }): JSX | null
  export const SII_LINKS: { eboleta: string; menu: string; guiaEmitir: string; guiaAnularSinFE: string; guiaAnularConFE: string }
  export function stepTitle(s: TaxDocStep): string; export function stepDetail(s: TaxDocStep): string | null; export function stepMeta(s: TaxDocStep): string
  ```
- FormData contract of `action`: fields `docId`, `folio`, `backPath`.

- [ ] **Step 1: Write the failing copy test**

```ts
// components/admin/tax-docs/step-copy.test.ts
import { describe, expect, it } from "vitest";
import type { TaxDocStep } from "@/src/domain/tax/tax-doc-steps";
import { stepDetail, stepMeta, stepTitle } from "./step-copy";

function step(over: Partial<TaxDocStep>): TaxDocStep {
  return {
    id: "x", orderId: "o", kind: "boleta", state: "por_emitir", role: "pago", total: 9990, neto: 8395, iva: 1595,
    folio: null, createdAt: "2026-09-13T15:00:00Z", emittedAt: null, parentFolio: null, parentTotal: null,
    reversedByFolio: null, reversedByPending: false, saldoOfFolio: null, saldoOfTotal: null, razonReferencia: null,
    ageDays: 2, atrasada: false, note: null, canRecord: true, ...over,
  };
}

describe("step copy", () => {
  it("boleta por emitir: instrucción con el total", () => {
    expect(stepTitle(step({}))).toBe("Emitir boleta afecta por $9.990");
    expect(stepDetail(step({}))).toBeNull();
    expect(stepMeta(step({}))).toBe("Neto $8.395 · IVA $1.595 · pagada el dom 13 sept (hace 2 días)");
  });
  it("boleta delta y saldo explican su origen", () => {
    expect(stepDetail(step({ role: "delta" }))).toBe("Cobro adicional por reagendamiento.");
    expect(stepDetail(step({ role: "saldo", saldoOfFolio: "1234", saldoOfTotal: 9990 }))).toBe("Saldo tras anular la boleta folio 1234.");
    expect(stepDetail(step({ role: "saldo", saldoOfTotal: 9990 }))).toBe("Saldo tras anular la boleta de $9.990 (aún sin folio).");
  });
  it("boleta emitida y anulada", () => {
    expect(stepTitle(step({ state: "emitida", folio: "1234" }))).toBe("Boleta $9.990");
    expect(stepMeta(step({ state: "emitida", folio: "1234", emittedAt: "2026-09-13T16:00:00Z" }))).toBe("Folio 1234 · emitida el dom 13 sept");
    expect(stepDetail(step({ state: "anulada", reversedByFolio: "77" }))).toBe("Anulada por nota de crédito folio 77.");
    expect(stepDetail(step({ state: "anulada", reversedByPending: true }))).toBe("Anulada por una nota de crédito aún por emitir.");
  });
  it("NC por emitir, bloqueada y emitida", () => {
    expect(stepTitle(step({ kind: "nota_credito", role: "nc", parentFolio: "1234", parentTotal: 9990 }))).toBe("Emitir nota de crédito por $9.990");
    expect(stepDetail(step({ kind: "nota_credito", role: "nc", parentFolio: "1234", parentTotal: 9990 }))).toBe("Anula la boleta folio 1234.");
    expect(stepDetail(step({ kind: "nota_credito", role: "nc", state: "bloqueada", parentTotal: 9990, canRecord: false }))).toBe("Primero registra el folio de la boleta de $9.990.");
    expect(stepTitle(step({ kind: "nota_credito", role: "nc", state: "emitida", folio: "77", parentFolio: "1234" }))).toBe("Nota de crédito $9.990");
    expect(stepDetail(step({ kind: "nota_credito", role: "nc", parentTotal: 9990 }))).toBe("Anula una boleta de $9.990 de este pedido (sin vínculo).");
  });
  it("meta de la NC dice 'generada', no 'pagada'", () => {
    expect(stepMeta(step({ kind: "nota_credito", role: "nc" }))).toBe("Neto $8.395 · IVA $1.595 · generada el dom 13 sept (hace 2 días)");
    expect(stepMeta(step({ ageDays: 0 }))).toBe("Neto $8.395 · IVA $1.595 · pagada el dom 13 sept (hoy)");
    expect(stepMeta(step({ ageDays: 1 }))).toBe("Neto $8.395 · IVA $1.595 · pagada el dom 13 sept (hace 1 día)");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/admin/tax-docs/step-copy.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Write `sii-links.ts` and `step-copy.ts`**

```ts
// components/admin/tax-docs/sii-links.ts
/** Enlaces oficiales del SII para la corrida de boletas (verificados 2026-09-15). */
export const SII_LINKS = {
  /** App e-Boleta (emisión de boletas y NC sin certificado). */
  eboleta: "https://eboleta.sii.cl/",
  /** Menú "Boleta de ventas y servicios electrónica" en sii.cl. */
  menu: "https://www.sii.cl/servicios_online/3532-.html",
  guiaEmitir: "https://www.sii.cl/ayudas/boleta_electronica/emitir_boletas_electronicas_en_e-boleta.pdf",
  guiaAnularSinFE: "https://www.sii.cl/ayudas/boleta_electronica/anular_boleta_electronica_sin_estar_inscrito_en_facturacion_electronica.pdf",
  guiaAnularConFE: "https://www.sii.cl/ayudas/boleta_electronica/anular_una_boleta_electronica_estando_inscrito_en_facturacion_electronica.pdf",
} as const;
```

```ts
// components/admin/tax-docs/step-copy.ts
import { fmtDate } from "@/components/admin/format";
import { formatCLP } from "@/src/domain/money/money";
import type { TaxDocStep } from "@/src/domain/tax/tax-doc-steps";

/** Copy de cada paso SII en la voz del dueño. Puro: la fila y la cola lo comparten. */

const ago = (d: number) => (d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`);

export function stepTitle(s: TaxDocStep): string {
  const clp = formatCLP(s.total);
  if (s.kind === "nota_credito") return s.state === "por_emitir" || s.state === "bloqueada" ? `Emitir nota de crédito por ${clp}` : `Nota de crédito ${clp}`;
  return s.state === "por_emitir" ? `Emitir boleta afecta por ${clp}` : `Boleta ${clp}`;
}

export function stepDetail(s: TaxDocStep): string | null {
  if (s.kind === "nota_credito") {
    if (s.state === "bloqueada") return `Primero registra el folio de la boleta de ${formatCLP(s.parentTotal ?? 0)}.`;
    if (s.parentFolio) return `Anula la boleta folio ${s.parentFolio}.`;
    return `Anula una boleta de ${formatCLP(s.parentTotal ?? s.total)} de este pedido (sin vínculo).`;
  }
  if (s.state === "anulada") {
    return s.reversedByFolio ? `Anulada por nota de crédito folio ${s.reversedByFolio}.` : "Anulada por una nota de crédito aún por emitir.";
  }
  if (s.role === "delta") return "Cobro adicional por reagendamiento.";
  if (s.role === "saldo") {
    return s.saldoOfFolio
      ? `Saldo tras anular la boleta folio ${s.saldoOfFolio}.`
      : `Saldo tras anular la boleta de ${formatCLP(s.saldoOfTotal ?? 0)} (aún sin folio).`;
  }
  return null;
}

export function stepMeta(s: TaxDocStep): string {
  if (s.state === "emitida" || (s.state === "anulada" && s.folio)) {
    return `Folio ${s.folio}${s.emittedAt ? ` · emitida el ${fmtDate(s.emittedAt)}` : ""}`;
  }
  const verb = s.kind === "boleta" ? "pagada" : "generada";
  return `Neto ${formatCLP(s.neto)} · IVA ${formatCLP(s.iva)} · ${verb} el ${fmtDate(s.createdAt)} (${ago(s.ageDays)})`;
}
```

- [ ] **Step 4: Run the copy test**

Run: `npx vitest run components/admin/tax-docs/step-copy.test.ts` → Expected: PASS. (If `fmtDate` renders "dom 13 sept" differently in your ICU — e.g. "dom 13 sept." — adjust the expected strings to what `fmtDate("2026-09-13T15:00:00Z")` actually prints; the shape is what matters.)

- [ ] **Step 5: Add the pill states**

In `components/admin/ui/StatusPill.tsx`, after the `emitida` line:

```ts
  // Documentos tributarios — pasos SII (src/domain/tax/tax-doc-steps.ts). `anulada`
  // ya existe más abajo (inscripción de curso) con la misma etiqueta y tono.
  por_emitir: { label: "Por emitir", tone: "gold" },
  bloqueada: { label: "Bloqueada", tone: "dim" },
  atrasada: { label: "Atrasada", tone: "sirena" },
```

- [ ] **Step 6: Write the row and the card**

```tsx
// components/admin/tax-docs/TaxDocStepRow.tsx
import type { ActionResult } from "@/components/admin/ui/action";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { Input } from "@/components/admin/ui/Field";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { btn } from "@/components/admin/ui/styles";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import type { TaxDocStep } from "@/src/domain/tax/tax-doc-steps";
import { stepDetail, stepMeta, stepTitle } from "./step-copy";

export type RecordFolioAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Un paso SII: qué emitir, por cuánto, qué referencia lleva, y el folio de vuelta.
 * La app no emite nada — el botón dice "Registrar folio" porque eso es lo único que
 * hace. `bloqueada` pinta el control deshabilitado (se VE deshabilitado, ver inputCls),
 * pero el guard real está en TaxDocService.
 */
export function TaxDocStepRow({
  step,
  action,
  backPath,
  canRecord,
}: {
  step: TaxDocStep;
  action: RecordFolioAction;
  backPath: string;
  canRecord: boolean;
}) {
  const detail = stepDetail(step);
  const showForm = canRecord && step.state === "por_emitir";
  const showBlocked = step.state === "bloqueada";
  const showFix = canRecord && (step.state === "emitida" || (step.state === "anulada" && !!step.folio));

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-bone">{stepTitle(step)}</p>
          {detail && <p className="mt-0.5 text-sm text-bone-dim">{detail}</p>}
          <p className="label-sm mt-1 text-bone-quiet">{stepMeta(step)}</p>
          {step.note && <p className="mt-1.5 text-xs text-bone-dim">{step.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={step.state} />
          {step.atrasada && <StatusPill status="atrasada" />}
        </div>
      </div>

      {step.razonReferencia && step.state === "por_emitir" && (
        <p className="flex flex-wrap items-center gap-2 label-sm text-bone-quiet">
          Razón de referencia:
          <span className="font-mono text-bone-dim">{step.razonReferencia}</span>
          <CopyButton value={step.razonReferencia} label="Razón copiada" />
        </p>
      )}

      {showForm && (
        <ActionForm action={action} success="Folio registrado.">
          <input type="hidden" name="docId" value={step.id} />
          <input type="hidden" name="backPath" value={backPath} />
          <div className="flex items-center gap-2">
            <Input name="folio" inputMode="numeric" pattern="[0-9]*" required aria-label="Folio SII" placeholder="N° folio" className="max-w-40" />
            <SubmitButton size="sm">Registrar folio</SubmitButton>
          </div>
        </ActionForm>
      )}

      {showBlocked && (
        <div className="flex items-center gap-2">
          <Input disabled aria-label="Folio SII (bloqueado)" placeholder="N° folio" className="max-w-40" />
          <button type="button" disabled className={btn("primary", "sm")}>
            Registrar folio
          </button>
        </div>
      )}

      {showFix && (
        <details className="group">
          <summary className="cursor-pointer label-sm text-bone-quiet transition-colors hover:text-gold">Corregir folio</summary>
          <ActionForm action={action} success="Folio corregido." className="mt-2">
            <input type="hidden" name="docId" value={step.id} />
            <input type="hidden" name="backPath" value={backPath} />
            <div className="flex items-center gap-2">
              <Input name="folio" inputMode="numeric" pattern="[0-9]*" required aria-label="Folio SII corregido" defaultValue={step.folio ?? ""} className="max-w-40" />
              <SubmitButton size="sm" variant="secondary">Guardar</SubmitButton>
            </div>
          </ActionForm>
        </details>
      )}
    </li>
  );
}
```

```tsx
// components/admin/tax-docs/TaxDocsCard.tsx
import { Card } from "@/components/admin/ui/Card";
import { Icon } from "@/components/admin/ui/icons";
import type { TaxDocStep } from "@/src/domain/tax/tax-doc-steps";
import { SII_LINKS } from "./sii-links";
import { type RecordFolioAction, TaxDocStepRow } from "./TaxDocStepRow";

/**
 * Card "Documentos tributarios" de una ficha (reserva o inscripción): los pasos SII
 * del pedido en orden cronológico. Sin documentos no se pinta (cortesía, 100 %
 * puntos, cancelación sin reembolso).
 */
export function TaxDocsCard({
  steps,
  action,
  backPath,
  canRecord,
  title = "Documentos tributarios",
}: {
  steps: TaxDocStep[];
  action: RecordFolioAction;
  backPath: string;
  canRecord: boolean;
  title?: string;
}) {
  if (steps.length === 0) return null;
  return (
    <Card title={title}>
      <ul className="flex flex-col divide-y divide-bone/10">
        {steps.map((s) => (
          <TaxDocStepRow key={s.id} step={s} action={action} backPath={backPath} canRecord={canRecord} />
        ))}
      </ul>
      <p className="mt-4 flex flex-wrap items-center gap-x-2 text-xs text-bone-quiet">
        Emítelos en
        <a href={SII_LINKS.eboleta} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold transition-colors hover:text-bone">
          e-Boleta SII <Icon name="external" size={12} />
        </a>
        y registra acá el folio que te asigna.
      </p>
    </Card>
  );
}
```

- [ ] **Step 7: Typecheck and run the a11y contract**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "components/admin/tax-docs|StatusPill" ; npx vitest run lib/admin-a11y-contract.test.ts`
Expected: no type errors in the new files; contract PASS (no `text-bone-mute`, inputs via `Input`).

- [ ] **Step 8: Commit**

```bash
/opt/homebrew/bin/git add components/admin/ui/StatusPill.tsx components/admin/tax-docs/
/opt/homebrew/bin/git commit -m "feat(sii): card y fila compartidas de pasos SII (Registrar folio, razón, bloqueo)"
```

---

### Task 5: Reservas ficha — mount the card, new action, timeline label

**Files:**
- Modify: `app/admin/(panel)/reservas/[id]/actions.ts` (replace `recordBoletaAction`, ~lines 85-94)
- Modify: `app/admin/(panel)/reservas/[id]/page.tsx` (imports lines 4-13; timeline cases ~103-108; card block ~278-310; `taxDocLabel` ~631-633)

**Interfaces:**
- Consumes: `taxDocService()`, `describeTaxDocs`, `TaxDocsCard`, `RecordFolioAction`.
- Produces: `recordTaxDocFolioAction(prev, fd)` in this segment (FormData: `docId`, `folio`, `backPath`).

- [ ] **Step 1: Replace the action**

In `actions.ts`, add `taxDocService` to the `@/src/composition` import, then replace `recordBoletaAction` entirely with:

```ts
/**
 * Registrar el folio que el SII asignó (la app no emite). Validación, guard de NC
 * bloqueada y evento de timeline viven en TaxDocService; acá solo permiso + revalidar.
 * `backPath` es la página que mostró el formulario (ficha o cola): se revalida junto a
 * la cola y el panel, que cuentan pendientes.
 */
export async function recordTaxDocFolioAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.boleta");
    const docId = str(fd, "docId");
    const backPath = str(fd, "backPath");
    if (!/^\/admin(\/|$)/.test(backPath)) throw new Error("Ruta inválida.");
    const actor = (await currentClaims())?.sub ?? null;
    await taxDocService().recordFolio(docId, str(fd, "folio"), actor);
    revalidatePath(backPath);
    revalidatePath("/admin/sii");
    revalidatePath("/admin");
  });
}
```

- [ ] **Step 2: Mount the card on the ficha**

In `page.tsx`:
1. Change the import on line 4 to `import { cancelBookingAction, recordTaxDocFolioAction } from "./actions";`.
2. Add imports: `import { TaxDocsCard } from "@/components/admin/tax-docs/TaxDocsCard";` and `import { describeTaxDocs } from "@/src/domain/tax/tax-doc-steps";`.
3. Where `canManageCustomers` is computed (~line 179) — the claims are already awaited there; change to compute both from one call:
   ```ts
   const claims = await currentClaims();
   const canManageCustomers = hasPermission(claims, "customers.manage");
   const canRecordFolio = hasPermission(claims, "reservations.boleta");
   const taxSteps = describeTaxDocs(b.taxDocs, { now: new Date().toISOString() });
   ```
4. Replace the whole `{b.taxDocs.length > 0 && ( <Card title="Documentos tributarios"> … </Card> )}` block (~lines 278-310) with:
   ```tsx
   <TaxDocsCard steps={taxSteps} action={recordTaxDocFolioAction} backPath={`/admin/reservas/${b.id}`} canRecord={canRecordFolio} />
   ```
5. Delete the `taxDocLabel` helper (~lines 631-633) and remove the now-unused imports `ActionForm`, `Input`, `SubmitButton` **only if** nothing else in the file uses them (grep first: `grep -n "ActionForm\|<Input\|SubmitButton" "app/admin/(panel)/reservas/[id]/page.tsx"`).
6. Timeline: replace the two `_emitted` cases with:
   ```ts
    case "boleta_emitted":
      return e.detail?.previous_folio
        ? { label: "Folio de boleta corregido", detail: `${e.detail.previous_folio} → ${e.detail.folio}` }
        : { label: "Boleta emitida", detail: `${e.detail?.folio ? `Folio ${e.detail.folio} · ` : ""}${clp(e.amountClp)}` };
    case "nota_credito_emitted":
      return e.detail?.previous_folio
        ? { label: "Folio de nota de crédito corregido", detail: `${e.detail.previous_folio} → ${e.detail.folio}` }
        : { label: "Nota de crédito emitida", detail: `${e.detail?.folio ? `Folio ${e.detail.folio} · ` : ""}${clp(e.amountClp)}` };
   ```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v reschedule.itest | head; npx eslint "app/admin/(panel)/reservas/[id]"`
Expected: clean.

- [ ] **Step 4: Manual check (local)**

`npm run db:start` (if not up) → `npm run dev` → `/admin/reservas/nueva` → crear reserva manual pendiente → en su ficha "Marcar pagado · Efectivo" → the card shows one **Por emitir** row "Emitir boleta afecta por $X" with neto/IVA and "pagada el … (hoy)" → type `1234` → **Registrar folio** → row becomes **Emitida · Folio 1234**, timeline shows "Boleta emitida · Folio 1234". Open "Corregir folio", save `1243` → timeline shows "Folio de boleta corregido · 1234 → 1243". Submit an empty folio in another pending doc → inline error "Ingresa el folio…" (no false success).

- [ ] **Step 5: Commit**

```bash
/opt/homebrew/bin/git add "app/admin/(panel)/reservas/[id]/actions.ts" "app/admin/(panel)/reservas/[id]/page.tsx"
/opt/homebrew/bin/git commit -m "feat(sii): ficha de reserva usa la card de pasos SII y la acción Registrar folio"
```

---

### Task 6: Curso ficha — same card with folio entry; drop the dead course query

**Files:**
- Modify: `app/admin/(panel)/curso/actions.ts` (append action)
- Modify: `app/admin/(panel)/curso/inscripciones/[id]/page.tsx` (imports, data load ~line 43-47, card block ~119-141)
- Modify: `src/infrastructure/db/course-repository.ts` (remove `taxDocumentsForOrder` ~581-598 and the `CourseTaxDoc` import ~line 22)
- Modify: `src/application/ports/course.ts` (remove `CourseTaxDoc` interface ~174-182)

- [ ] **Step 1: Add the segment action**

Append to `app/admin/(panel)/curso/actions.ts` (add `taxDocService` to the `@/src/composition` import and `currentClaims` to the `require-admin` import):

```ts
/** Registrar folio SII de un documento del curso — mismo contrato que en reservas (docId, folio, backPath). */
export async function recordTaxDocFolioAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.boleta");
    const docId = str(fd, "docId");
    const backPath = str(fd, "backPath");
    if (!/^\/admin(\/|$)/.test(backPath)) throw new Error("Ruta inválida.");
    const actor = (await currentClaims())?.sub ?? null;
    await taxDocService().recordFolio(docId, str(fd, "folio"), actor);
    revalidatePath(backPath);
    revalidatePath("/admin/sii");
    revalidatePath("/admin");
  });
}
```

- [ ] **Step 2: Mount the card on the inscripción page**

In `inscripciones/[id]/page.tsx`:
1. Imports: add `import { TaxDocsCard } from "@/components/admin/tax-docs/TaxDocsCard";`, `import { describeTaxDocs } from "@/src/domain/tax/tax-doc-steps";`, `import { hasPermission } from "@/src/domain/auth/permissions";`, add `adminRepository` to the `@/src/composition` import, add `currentClaims` to the `require-admin` import, and add `recordTaxDocFolioAction` to the `../../actions` import.
2. In the `Promise.all` (line ~43-47) replace `repo.taxDocumentsForOrder(inscripcion.orderId)` with `adminRepository().taxDocsForOrder(inscripcion.orderId)`.
3. After that `Promise.all`, add:
   ```ts
   const canRecordFolio = hasPermission(await currentClaims(), "reservations.boleta");
   const taxSteps = describeTaxDocs(boletas, { now: new Date().toISOString() });
   ```
4. Replace the whole `{boletas.length > 0 && ( <Card title="Documentos tributarios"> … </Card> )}` block (~119-141) with:
   ```tsx
   <TaxDocsCard steps={taxSteps} action={recordTaxDocFolioAction} backPath={`/admin/curso/inscripciones/${inscripcion.id}`} canRecord={canRecordFolio} />
   ```
5. Remove `StatusPill` / `formatCLP` imports only if now unused (grep the file first).

- [ ] **Step 3: Remove the dead course query**

- `src/infrastructure/db/course-repository.ts`: delete the `taxDocumentsForOrder` method and `CourseTaxDoc` from the `@/src/application/ports/course` import list.
- `src/application/ports/course.ts`: delete the `CourseTaxDoc` interface.
- Verify nothing else references them: `grep -rn "taxDocumentsForOrder\|CourseTaxDoc" app src lib` → no output.

- [ ] **Step 4: Typecheck + lint + manual check**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v reschedule.itest | head; npx eslint "app/admin/(panel)/curso" src/infrastructure/db/course-repository.ts`
Expected: clean.

Manual: in `/admin/curso` create a generación + inscripción, cobrar en efectivo → the inscripción ficha shows the boleta **Por emitir** with a folio input (there was none before) → register → **Emitida · Folio …**. (No timeline on this page — expected.)

- [ ] **Step 5: Commit**

```bash
/opt/homebrew/bin/git add "app/admin/(panel)/curso/actions.ts" "app/admin/(panel)/curso/inscripciones/[id]/page.tsx" src/infrastructure/db/course-repository.ts src/application/ports/course.ts
/opt/homebrew/bin/git commit -m "feat(sii): la inscripción de curso registra folios con la misma card"
```

---

### Task 7: `/admin/sii` queue page + sidebar item

**Files:**
- Create: `app/admin/(panel)/sii/page.tsx`, `app/admin/(panel)/sii/actions.ts`, `app/admin/(panel)/sii/loading.tsx`
- Modify: `components/admin/ui/Sidebar.tsx` (`groups()` signature/items, `Sidebar` props ~lines 13-50 and ~100-110)
- Modify: `components/admin/AdminShell.tsx`

**Interfaces:**
- Consumes: `pendingTaxDocsQueue()`, `pendingTaxDocsSummary()` (Task 2), `describeTaxDocs`, `TaxDocStepRow`, `SII_LINKS`, `fmtDateTime`.
- Sidebar: `show.sii: boolean`, new prop `pendientesSii: number`.

- [ ] **Step 1: The action (identical contract to the other two)**

```ts
// app/admin/(panel)/sii/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { taxDocService } from "@/src/composition";
import { currentClaims, requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Registrar folio desde la cola SII — mismo contrato que en reservas/curso (docId, folio, backPath). */
export async function recordTaxDocFolioAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.boleta");
    const docId = str(fd, "docId");
    const backPath = str(fd, "backPath");
    if (!/^\/admin(\/|$)/.test(backPath)) throw new Error("Ruta inválida.");
    const actor = (await currentClaims())?.sub ?? null;
    await taxDocService().recordFolio(docId, str(fd, "folio"), actor);
    revalidatePath(backPath);
    revalidatePath("/admin/sii");
    revalidatePath("/admin");
  });
}
```

- [ ] **Step 2: The page**

```tsx
// app/admin/(panel)/sii/page.tsx
import Link from "next/link";
import { recordTaxDocFolioAction } from "./actions";
import { fmtDateTime } from "@/components/admin/format";
import { SII_LINKS } from "@/components/admin/tax-docs/sii-links";
import { TaxDocStepRow } from "@/components/admin/tax-docs/TaxDocStepRow";
import { Card } from "@/components/admin/ui/Card";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon } from "@/components/admin/ui/icons";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { btn } from "@/components/admin/ui/styles";
import { adminRepository } from "@/src/composition";
import type { PendingTaxDocGroup } from "@/src/infrastructure/db/admin-repository";
import { describeTaxDocs } from "@/src/domain/tax/tax-doc-steps";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "SII — Admin", robots: { index: false } };

/** Cabecera del grupo: quién y qué, para ubicar el pedido sin abrir la ficha. */
function groupTitle(g: PendingTaxDocGroup): string {
  const c = g.context;
  if (c.kind === "reserva") return `${c.customerName ?? "Sin nombre"} · ${fmtDateTime(c.startsAt)}`;
  if (c.kind === "curso") return `Curso ${c.generationCode} · ${c.studentName}`;
  return c.customerName ?? "Pedido sin ficha";
}

function groupHref(g: PendingTaxDocGroup): string | null {
  const c = g.context;
  if (c.kind === "reserva") return `/admin/reservas/${c.reservationId}`;
  if (c.kind === "curso") return `/admin/curso/inscripciones/${c.enrollmentId}`;
  return null;
}

/**
 * La corrida del SII: todo lo pendiente, más antiguo primero, agrupado por pedido.
 * Los documentos ya emitidos del pedido entran al derivador (la NC bloqueada tiene
 * que poder nombrar a su boleta) pero no se pintan: acá solo lo que falta.
 */
export default async function SiiPage() {
  await requirePermission("reservations.boleta");
  const groups = await adminRepository().pendingTaxDocsQueue();
  const now = new Date().toISOString();
  const pending = groups
    .map((g) => ({ g, steps: describeTaxDocs(g.docs, { now }).filter((s) => s.state === "por_emitir" || s.state === "bloqueada") }))
    .filter((x) => x.steps.length > 0);
  const total = pending.reduce((n, x) => n + x.steps.length, 0);

  return (
    <>
      <PageHeader
        kicker="Documentos tributarios"
        title="SII"
        action={
          <a href={SII_LINKS.eboleta} target="_blank" rel="noreferrer" className={btn("primary")}>
            <Icon name="external" size={16} /> Abrir e-Boleta
          </a>
        }
      />

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-bone-dim">
        {total === 0 ? "Nada por emitir." : `${total} ${total === 1 ? "documento" : "documentos"} por emitir.`} Cada pago genera su boleta; cada
        reembolso, una nota de crédito que anula la boleta (y, si queda saldo, una boleta nueva). Guías del SII:{" "}
        <a href={SII_LINKS.guiaEmitir} target="_blank" rel="noreferrer" className="text-gold hover:text-bone">emitir boleta</a>,{" "}
        <a href={SII_LINKS.guiaAnularSinFE} target="_blank" rel="noreferrer" className="text-gold hover:text-bone">anular (sin factura electrónica)</a>,{" "}
        <a href={SII_LINKS.guiaAnularConFE} target="_blank" rel="noreferrer" className="text-gold hover:text-bone">anular (con factura electrónica)</a>.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {pending.length === 0 ? (
          <EmptyState icon="doc" title="Nada por emitir" hint="Cuando entre un pago o salga un reembolso, su documento aparece acá." />
        ) : (
          pending.map(({ g, steps }) => {
            const href = groupHref(g);
            return (
              <Card
                key={g.orderId}
                title={groupTitle(g)}
                action={
                  href ? (
                    <Link href={href} className="label-sm -my-2 inline-block py-2 text-gold transition-colors hover:text-bone">
                      Ir a la ficha
                    </Link>
                  ) : undefined
                }
              >
                <ul className="flex flex-col divide-y divide-bone/10">
                  {steps.map((s) => (
                    <TaxDocStepRow key={s.id} step={s} action={recordTaxDocFolioAction} backPath="/admin/sii" canRecord />
                  ))}
                </ul>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: The loading fallback**

```tsx
// app/admin/(panel)/sii/loading.tsx
import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/sii: encabezado + tres grupos de pendientes. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando documentos por emitir">
      <SkeletonPageHeader action />
      <div className="mt-8 flex flex-col gap-6">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
```

- [ ] **Step 4: Sidebar item and shell wiring**

In `components/admin/ui/Sidebar.tsx`:
- Extend the `show` type in **both** places (the `groups()` parameter and the `Sidebar` props) with `sii: boolean`.
- `groups()` gains a third parameter `pendientesSii: number`; after the `if (show.course) …` line add:
  ```ts
  // SII después de Curso: es la cola de la plata que ya entró (boletas y NC por emitir),
  // con el mismo permiso que el botón "Registrar folio". Sin permiso, sin enlace.
  if (show.sii) operacion.push({ href: "/admin/sii", label: "SII", icon: "doc", badge: pendientesSii });
  ```
- `Sidebar` gains prop `pendientesSii = 0` and passes it: `const data = groups(show, porHacer, solicitudes, pendientesSii);`.

In `components/admin/AdminShell.tsx`:
- Add to the `Promise.all`: `adminRepository().pendingTaxDocsSummary().then((s) => s.count).catch(() => 0),` and destructure it as `pendientesSii`.
- Add `sii: hasPermission(claims, "reservations.boleta"),` to `show`.
- Pass `pendientesSii={pendientesSii}` to `<Sidebar … />`.

- [ ] **Step 5: Typecheck, lint, contracts, manual**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v reschedule.itest | head; npx eslint "app/admin/(panel)/sii" components/admin; npx vitest run lib/admin-a11y-contract.test.ts lib/chrome-contract.test.ts`
Expected: all clean/green.

Manual: with the dev server up, sidebar shows **SII** with a badge = pending count. `/admin/sii` lists groups oldest-first; a partially refunded booking shows the NC **Por emitir** ("Anula la boleta folio …" + razón with copy) and the saldo boleta; a booking whose boleta was never recorded shows the boleta **Por emitir** with the "ya está anulada…" note and the NC **Bloqueada** with a disabled input. Register the boleta's folio from the queue → the NC unblocks in place; register it → the group disappears when nothing is left. Kill the dev server, `npm run build` passes, restart dev.

- [ ] **Step 6: Commit**

```bash
/opt/homebrew/bin/git add "app/admin/(panel)/sii" components/admin/ui/Sidebar.tsx components/admin/AdminShell.tsx
/opt/homebrew/bin/git commit -m "feat(sii): cola /admin/sii con todos los pendientes + ítem SII en el menú"
```

---

### Task 8: Dashboard — compact panel; remove the old pending list from the repo

**Files:**
- Modify: `app/admin/(panel)/page.tsx` (`pendientes` href line ~33; panel block ~123-160; imports)
- Modify: `src/infrastructure/db/admin-repository.ts` (`DashboardData.boletas`, `PendingBoleta`, `pendingBoletas()`, `dashboard()`)

- [ ] **Step 1: Replace the dashboard panel**

In `app/admin/(panel)/page.tsx`:
1. Change the first `pendientes` entry to `{ n: d.pendingBoletas, icon: "doc", label: "Documentos por emitir en el SII", href: "/admin/sii" },`.
2. Replace the whole `{d.boletas.length > 0 && ( <div id="boletas" …> … </div> )}` block with:
   ```tsx
      {d.pendingBoletas > 0 && (
        <div className="mt-10">
          <Card title="Documentos por emitir en el SII">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-3xl text-bone">
                  {d.pendingBoletas} <span className="text-base text-bone-dim">{d.pendingBoletas === 1 ? "documento" : "documentos"}</span>
                </p>
                {d.oldestPendingDocAt && (
                  <p className="mt-1 text-sm text-bone-dim">El más antiguo espera desde el {fmtDate(d.oldestPendingDocAt)}.</p>
                )}
              </div>
              <Button href="/admin/sii" icon="doc">
                Ir a SII
              </Button>
            </div>
          </Card>
        </div>
      )}
   ```
3. Add `fmtDate` to the `@/components/admin/format` import. Remove `formatCLP` / `Link` imports only if now unused (grep the file).

- [ ] **Step 2: Remove the dead repository code**

In `admin-repository.ts`: delete `boletas: PendingBoleta[];` from `DashboardData`, delete the `PendingBoleta` interface, delete the `pendingBoletas()` method, and in `dashboard()` drop `this.pendingBoletas()` from the `Promise.all` (and `boletas` from the returned object). `pendingBoletas: number` stays — set it from `docsSummary.count` instead of `boletas.length`.

Verify: `grep -rn "PendingBoleta\|pendingBoletas()\|d\.boletas" app src lib` → no output.

- [ ] **Step 3: Typecheck, lint, manual**

Run: `npx tsc --noEmit -p . 2>&1 | grep -v reschedule.itest | head; npx eslint "app/admin/(panel)/page.tsx" src/infrastructure/db/admin-repository.ts`
Expected: clean.

Manual: `/admin` shows the stat "Boletas pendientes", the "por hacer" row "Documentos por emitir en el SII" linking to `/admin/sii`, and the compact panel with count + oldest date + "Ir a SII".

- [ ] **Step 4: Commit**

```bash
/opt/homebrew/bin/git add "app/admin/(panel)/page.tsx" src/infrastructure/db/admin-repository.ts
/opt/homebrew/bin/git commit -m "feat(sii): panel compacto de pendientes en Hoy que lleva a /admin/sii"
```

---

### Task 9: Full verification, end-to-end local pass, PR

**Files:** none new.

- [ ] **Step 1: Unit + contract tests**

Run: `npm test`
Expected: all green, including `lib/admin-a11y-contract.test.ts`, `lib/chrome-contract.test.ts`, `src/domain/tax/tax-doc-steps.test.ts`, `src/application/admin/tax-doc-service.test.ts`, `components/admin/tax-docs/step-copy.test.ts`.

- [ ] **Step 2: Integration tests**

Run: `npm run db:start` (if down) → `npm run test:integration -- src/infrastructure/db/tax-docs.itest.ts src/infrastructure/db/admin.itest.ts src/infrastructure/db/tax-reversal.itest.ts`
Expected: green (`admin.itest` and `tax-reversal.itest` guard the untouched DB model). Then **`npm run db:reset`**.

- [ ] **Step 3: Lint + build**

Stop any running dev server, then: `npx eslint . && npm run build`
Expected: both exit 0. Restart `npm run dev` afterwards.

- [ ] **Step 4: End-to-end manual pass (spec §Pruebas)**

With `npm run dev` on local Supabase:
1. Reserva manual → marcar pagada (efectivo) → `/admin/sii` shows the boleta → registrar folio `1001` → ficha timeline: "Boleta emitida · Folio 1001".
2. Cancelar esa reserva con reembolso parcial (custom, e.g. 50 %) → `/admin/sii` shows NC **Por emitir** ("Anula la boleta folio 1001", razón "Anula boleta N° 1001. Reembolso parcial: se reemite boleta por el saldo.") and the saldo boleta **Por emitir** ("Saldo tras anular la boleta folio 1001") → registrar both → ficha: original boleta reads **Anulada** "Anulada por nota de crédito folio …", group gone from the queue.
3. Another reserva manual → marcar pagada → cancel with full refund **before** recording the folio → queue shows boleta **Por emitir** with the "ya está anulada" note + NC **Bloqueada** (disabled input) → record the boleta → NC unblocks → record it.
4. Curso: inscripción cobrada en efectivo → ficha shows the boleta with folio entry → register → **Emitida**.
5. Sidebar badge and dashboard count drop to 0 when the queue is empty; `/admin/sii` shows the empty state.

Record anything that deviates from the spec as a finding before opening the PR.

- [ ] **Step 5: Push and open the PR**

```bash
/opt/homebrew/bin/git push -u origin feat/sii-docs-admin-surface
gh pr create --title "feat(sii): documentos tributarios como pasos guiados en el admin" --body "$(cat <<'EOF'
## Qué

La superficie del admin para boletas/NC ahora le dice al dueño exactamente qué teclear en sii.cl y en qué orden; el modelo de datos no cambia (ya seguía el procedimiento del SII).

- Ficha de reserva y de inscripción de curso: card de pasos SII (Por emitir / Bloqueada / Emitida / Anulada), NC nombra el folio que anula y queda bloqueada hasta que su boleta lo tenga, razón de referencia sugerida, "Registrar folio" (la app no emite), corregir folio.
- Nueva cola `/admin/sii` (+ ítem "SII" en el menú con badge): todo lo pendiente, más antiguo primero, agrupado por pedido, reservas y curso.
- Panel Hoy: resumen compacto que lleva a la cola.
- Registrar folio ahora valida (folio vacío era un éxito falso), rechaza NC bloqueadas en el servidor y deja `boleta_emitted` / `nota_credito_emitted` en el timeline.
- Los documentos del curso por fin pueden marcarse emitidos.

Spec: `docs/superpowers/specs/2026-09-15-sii-tax-docs-admin-surface-design.md`.

## Verificación

- `npm test`, `npx eslint .`, `npm run build` en verde.
- `tax-docs.itest.ts` (nuevo) + `admin.itest.ts` + `tax-reversal.itest.ts` en verde contra Supabase local.
- Pasada manual local: pago → boleta → reembolso parcial (NC + saldo) → reembolso total antes de emitir (bloqueo) → curso → cola vacía.

Sin migraciones.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (done while writing)

- **Spec coverage:** Parte 1 → Task 1 (states, roles, parent/reversedBy/saldo, razón, atrasada, note, parseFolio). Parte 2 → Tasks 4-8 (shared component, three mounts, `/admin/sii`, sidebar, dashboard, repository reads, record action incl. blocked guard, event logging with delta fallback, corregir folio + timeline label, "Registrar folio" copy). Parte 3 → tests in Tasks 1-3 and the manual pass in Task 9; error toasts come from `ActionForm` (persistent inline `role=alert`).
- **Types:** `TaxDocRaw`/`TaxDocStep` defined once in Task 1 and imported everywhere; `RecordFolioAction` FormData contract (`docId`, `folio`, `backPath`) identical across the three actions and the row; `PendingTaxDocGroup` shape used by Task 7 matches Task 2.
- **Order safety:** Task 3 removes `recordBoleta`, which `recordBoletaAction` still calls until Task 5 — noted in Task 3 Step 8; do Task 5 Step 2 early if you want every commit to typecheck. Task 8 is the only one that removes `boletas`/`PendingBoleta`, after the dashboard stops reading them.
