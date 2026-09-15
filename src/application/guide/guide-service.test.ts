import { describe, expect, it, vi } from "vitest";
import type { GuideFileStore, GuideLeadRepository } from "@/src/application/ports/guide";
import { GUIDE_DOWNLOAD_TTL_S, GUIDE_PDF_OBJECT, GuideService } from "./guide-service";

const TOKEN = "a".repeat(48);

function makeService(over: { known?: boolean; url?: string | null } = {}) {
  const leads: GuideLeadRepository = {
    request: vi.fn(async () => ({ id: "lead-1", token: TOKEN, isNew: true })),
    touchDownload: vi.fn(async () => over.known ?? true),
  };
  const files: GuideFileStore = {
    signedDownloadUrl: vi.fn(async () => (over.url === undefined ? "https://signed.example/x" : over.url)),
  };
  const notifier = { notifyGuideLead: vi.fn(async () => {}) };
  return { service: new GuideService(leads, files, notifier), leads, files, notifier };
}

describe("GuideService.request", () => {
  it("guarda el lead y manda el correo con el token estable", async () => {
    const { service, leads, notifier } = makeService();
    const r = await service.request({ email: "dj@correo.cl", source: "hero" });
    expect(r).toEqual({ isNew: true });
    expect(leads.request).toHaveBeenCalledWith({ email: "dj@correo.cl", source: "hero" });
    expect(notifier.notifyGuideLead).toHaveBeenCalledWith({ email: "dj@correo.cl", token: TOKEN });
  });

  it("un re-pedido devuelve isNew:false y vuelve a mandar el correo (mismo link)", async () => {
    const { service, leads, notifier } = makeService();
    vi.mocked(leads.request).mockResolvedValueOnce({ id: "lead-1", token: TOKEN, isNew: false });
    const r = await service.request({ email: "dj@correo.cl", source: "cierre" });
    expect(r).toEqual({ isNew: false });
    expect(notifier.notifyGuideLead).toHaveBeenCalledTimes(1);
  });

  it("si el correo falla, el error se propaga: el lead ya quedó guardado y reintentar es idempotente", async () => {
    const { service, notifier } = makeService();
    vi.mocked(notifier.notifyGuideLead).mockRejectedValueOnce(new Error("resend down"));
    await expect(service.request({ email: "dj@correo.cl", source: "hero" })).rejects.toThrow("resend down");
  });
});

describe("GuideService.resolveDownload", () => {
  it("un token con forma inválida es not_found sin tocar la DB", async () => {
    const { service, leads } = makeService();
    for (const bad of ["", "abc", "A".repeat(48), "z".repeat(48), TOKEN + "0"]) {
      expect(await service.resolveDownload(bad)).toEqual({ kind: "not_found" });
    }
    expect(leads.touchDownload).not.toHaveBeenCalled();
  });

  it("un token desconocido es not_found", async () => {
    const { service, files } = makeService({ known: false });
    expect(await service.resolveDownload(TOKEN)).toEqual({ kind: "not_found" });
    expect(files.signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("con el archivo ausente en el bucket es unavailable (el token igual se marcó)", async () => {
    const { service, leads } = makeService({ url: null });
    expect(await service.resolveDownload(TOKEN)).toEqual({ kind: "unavailable" });
    expect(leads.touchDownload).toHaveBeenCalledWith(TOKEN);
  });

  it("con todo en orden devuelve la URL firmada del PDF con TTL corto", async () => {
    const { service, files } = makeService();
    expect(await service.resolveDownload(TOKEN)).toEqual({ kind: "ok", url: "https://signed.example/x" });
    expect(files.signedDownloadUrl).toHaveBeenCalledWith(GUIDE_PDF_OBJECT, GUIDE_DOWNLOAD_TTL_S);
    expect(GUIDE_PDF_OBJECT).toBe("guia-iniciacion-djing.pdf");
    expect(GUIDE_DOWNLOAD_TTL_S).toBeLessThanOrEqual(300);
  });
});
