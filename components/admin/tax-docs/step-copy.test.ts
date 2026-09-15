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
