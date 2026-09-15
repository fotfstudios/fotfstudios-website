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
