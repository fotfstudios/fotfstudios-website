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
    expect(stepOf(steps, "nc2").razonReferencia).toBe("Anula boleta N° 11. Reembolso parcial: se reemite boleta por el saldo.");
    expect(stepOf(steps, "nc1").razonReferencia).toBe("Anula boleta N° 10. Anulación total.");
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
