import { describe, expect, it, vi } from "vitest";
import type { GuideCatalog, GuideEmailCopy, GuideFileStore, GuideLeadRepository } from "@/src/application/ports/guide";
import type { GuideLeadInput } from "@/src/domain/guide/lead";
import { GUIDE_DOWNLOAD_TTL_S, GuideService } from "./guide-service";

const TOKEN = "a".repeat(48);
const PDF = "guia-iniciacion-djing.pdf";
const DOWNLOAD_NAME = "Guia-Iniciacion-DJing-FOTF-Studios.pdf";

const COPY: GuideEmailCopy = {
  templateKey: "guideDelivery:guia-dj",
  subject: "Tu guía (PDF)",
  preheader: "Tu guía, en PDF.",
  h1: "Acá está tu guía",
  blurb: "Ocho páginas.",
  ctaLabel: "Descargar",
  name: "Guía de iniciación al DJing",
};

/** Un input ya normalizado por parseGuideLead. */
const input = (over: Partial<GuideLeadInput> = {}): GuideLeadInput => ({
  email: "dj@correo.cl",
  source: "hero",
  guide: "guia-dj",
  utm: { source: null, medium: null, campaign: null, content: null, term: null },
  referrerHost: null,
  ...over,
});

function makeService(over: { guideSlug?: string | null; url?: string | null; known?: boolean } = {}) {
  const leads: GuideLeadRepository = {
    request: vi.fn(async () => ({ id: "lead-1", token: TOKEN, isNew: true })),
    touchDownload: vi.fn(async () => (over.known === false ? null : { guideSlug: over.guideSlug ?? "guia-dj" })),
    list: vi.fn(async () => ({ rows: [], total: 0, grandTotal: 0 })),
    exportAll: vi.fn(async () => []),
  };
  const files: GuideFileStore = {
    signedDownloadUrl: vi.fn(async () => (over.url === undefined ? "https://signed.example/x" : over.url)),
  };
  const notifier = { notifyGuideLead: vi.fn(async () => {}) };
  // El catálogo conoce guia-dj y nada más: así se puede probar una guía retirada.
  const catalog: GuideCatalog = {
    pdfFile: (slug) => (slug === "guia-dj" ? { object: PDF, downloadName: DOWNLOAD_NAME } : null),
    emailCopy: (slug) => (slug === "guia-dj" ? COPY : null),
    landingPath: (slug) => (slug === "guia-dj" ? "/guia-dj" : null),
  };
  return { service: new GuideService(leads, files, notifier, catalog), leads, files, notifier, catalog };
}

describe("GuideService.request", () => {
  it("guarda el lead y manda el correo con el token estable y el copy de SU guía", async () => {
    const { service, leads, notifier } = makeService();
    const r = await service.request(input());
    expect(r).toEqual({ isNew: true });
    expect(leads.request).toHaveBeenCalledWith(input());
    expect(notifier.notifyGuideLead).toHaveBeenCalledWith({
      email: "dj@correo.cl",
      token: TOKEN,
      copy: COPY,
      landingPath: "/guia-dj",
    });
  });

  it("un re-pedido devuelve isNew:false y vuelve a mandar el correo (mismo link)", async () => {
    const { service, leads, notifier } = makeService();
    vi.mocked(leads.request).mockResolvedValueOnce({ id: "lead-1", token: TOKEN, isNew: false });
    const r = await service.request(input({ source: "cierre" }));
    expect(r).toEqual({ isNew: false });
    expect(notifier.notifyGuideLead).toHaveBeenCalledTimes(1);
  });

  it("si el correo falla, el error se propaga: el lead ya quedó guardado y reintentar es idempotente", async () => {
    const { service, notifier } = makeService();
    vi.mocked(notifier.notifyGuideLead).mockRejectedValueOnce(new Error("resend down"));
    await expect(service.request(input())).rejects.toThrow("resend down");
  });

  it("una guía fuera del registro no llega a tocar la DB: es una invariante rota", async () => {
    // El route ya la validó contra el registro, así que esto solo pasa por un bug nuestro.
    const { service, leads } = makeService();
    await expect(service.request(input({ guide: "no-existe" }))).rejects.toThrow(/no-existe/);
    expect(leads.request).not.toHaveBeenCalled();
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
    expect(await service.resolveDownload(TOKEN)).toEqual({ kind: "unavailable", guide: "guia-dj" });
    expect(leads.touchDownload).toHaveBeenCalledWith(TOKEN);
  });

  it("una guía retirada del registro con leads vivos es unavailable, no un 404", async () => {
    // El token es válido y la persona lo pidió de verdad; lo que ya no está es el PDF.
    const { service, files } = makeService({ guideSlug: "guia-retirada" });
    expect(await service.resolveDownload(TOKEN)).toEqual({ kind: "unavailable", guide: "guia-retirada" });
    expect(files.signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("firma el PDF de la guía QUE DICE EL TOKEN, con TTL corto y como adjunto", async () => {
    const { service, files } = makeService();
    expect(await service.resolveDownload(TOKEN)).toEqual({
      kind: "ok",
      url: "https://signed.example/x",
      guide: "guia-dj",
    });
    expect(files.signedDownloadUrl).toHaveBeenCalledWith(PDF, GUIDE_DOWNLOAD_TTL_S, DOWNLOAD_NAME);
    expect(GUIDE_DOWNLOAD_TTL_S).toBeLessThanOrEqual(300);
  });
});
