import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@vercel/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

import { pageFromPathname, pushEvent, trackBookingCta, trackGuideLead, trackWhatsAppClick } from "./analytics";

type TestWindow = { dataLayer?: unknown[]; location: { pathname: string } };

function stubWindow(pathname = "/", dataLayer: unknown[] | undefined = []) {
  (globalThis as { window?: TestWindow }).window = { dataLayer, location: { pathname } };
  return dataLayer;
}

beforeEach(() => {
  track.mockClear();
});

afterEach(() => {
  delete (globalThis as { window?: TestWindow }).window;
});

describe("pageFromPathname", () => {
  it("mapea la raíz a 'home'", () => {
    expect(pageFromPathname("/")).toBe("home");
  });

  it("quita el slash inicial y el final", () => {
    expect(pageFromPathname("/curso-dj")).toBe("curso-dj");
    expect(pageFromPathname("/terminos/")).toBe("terminos");
  });

  it("conserva rutas anidadas", () => {
    expect(pageFromPathname("/reserva/estado")).toBe("reserva/estado");
  });
});

describe("pushEvent", () => {
  it("empuja a dataLayer y dispara el evento de Vercel", () => {
    const dl = stubWindow("/curso-dj");
    pushEvent("whatsapp_click", { source: "hero", page: "curso-dj" });
    expect(dl).toEqual([{ event: "whatsapp_click", source: "hero", page: "curso-dj" }]);
    expect(track).toHaveBeenCalledWith("whatsapp_click", { source: "hero", page: "curso-dj" });
  });

  it("sin dataLayer (GTM aún no cargó) no lanza y aun así trackea en Vercel", () => {
    stubWindow("/", undefined);
    expect(() => pushEvent("whatsapp_click", { source: "footer", page: "home" })).not.toThrow();
    expect(track).toHaveBeenCalledOnce();
  });

  it("en el servidor (sin window) es un no-op silencioso", () => {
    delete (globalThis as { window?: TestWindow }).window;
    expect(() => pushEvent("whatsapp_click", { source: "x", page: "y" })).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("trackWhatsAppClick", () => {
  it("deriva `page` del pathname cuando no se pasa", () => {
    const dl = stubWindow("/terminos");
    trackWhatsAppClick("terminos-contacto");
    expect(dl).toEqual([
      { event: "whatsapp_click", source: "terminos-contacto", page: "terminos" },
    ]);
  });

  it("respeta un `page` explícito (continuidad con los datos existentes)", () => {
    const dl = stubWindow("/curso-dj");
    trackWhatsAppClick("hero", "curso-dj");
    expect(dl).toEqual([{ event: "whatsapp_click", source: "hero", page: "curso-dj" }]);
  });
});

describe("trackBookingCta", () => {
  it("emite booking_cta_click con mode, placement y page", () => {
    const dl = stubWindow("/");
    trackBookingCta("online", "nav");
    expect(dl).toEqual([
      { event: "booking_cta_click", mode: "online", placement: "nav", page: "home" },
    ]);
    expect(track).toHaveBeenCalledWith("booking_cta_click", {
      mode: "online",
      placement: "nav",
      page: "home",
    });
  });
});

describe("trackGuideLead", () => {
  it("emite guide_lead_start / guide_lead_submit con page fija y el formulario de origen", () => {
    const dl = stubWindow("/guia-dj");
    trackGuideLead("start", "hero");
    trackGuideLead("submit", "cierre");
    expect(dl).toEqual([
      { event: "guide_lead_start", page: "guia-dj", source: "hero" },
      { event: "guide_lead_submit", page: "guia-dj", source: "cierre" },
    ]);
    expect(track).toHaveBeenCalledWith("guide_lead_submit", { page: "guia-dj", source: "cierre" });
  });

  it("sin window (SSR) no hace nada ni lanza", () => {
    delete (globalThis as { window?: TestWindow }).window;
    expect(() => trackGuideLead("start", "hero")).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});
