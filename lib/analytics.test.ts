import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@vercel/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

import {
  pageFromPathname,
  pushEvent,
  trackAddon,
  trackBeginCheckout,
  trackBookingCta,
  trackBookingStep,
  trackCheckoutError,
  trackGuideCtaClick,
  trackGuideLead,
  trackLogin,
  trackNewsletter,
  trackPurchase,
  trackSlotSelected,
  trackViewItem,
  trackWhatsAppClick,
} from "./analytics";

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

describe("trackNewsletter", () => {
  it("emite newsletter_start / newsletter_submit con el formulario de origen", () => {
    const dl = stubWindow("/curso-dj");
    trackNewsletter("start", "curso_dj");
    trackNewsletter("submit", "curso_dj");
    expect(dl).toEqual([
      { event: "newsletter_start", page: "curso-dj", source: "curso_dj" },
      { event: "newsletter_submit", page: "curso-dj", source: "curso_dj" },
    ]);
  });
});

describe("trackGuideLead", () => {
  it("emite guide_lead_start / guide_lead_submit con la guía y el formulario de origen", () => {
    const dl = stubWindow("/guia-dj");
    trackGuideLead("start", "guia-dj", "hero");
    trackGuideLead("submit", "guia-dj", "cierre");
    // `page` sigue valiendo "guia-dj" como antes: ningún informe de GA4 existente se corta.
    expect(dl).toEqual([
      { event: "guide_lead_start", page: "guia-dj", guide: "guia-dj", source: "hero" },
      { event: "guide_lead_submit", page: "guia-dj", guide: "guia-dj", source: "cierre" },
    ]);
    expect(track).toHaveBeenCalledWith("guide_lead_submit", {
      page: "guia-dj",
      guide: "guia-dj",
      source: "cierre",
    });
  });

  it("una guía distinta cambia guide y page juntos", () => {
    const dl = stubWindow("/guia-mezcla");
    trackGuideLead("submit", "guia-mezcla", "hero");
    expect(dl).toEqual([{ event: "guide_lead_submit", page: "guia-mezcla", guide: "guia-mezcla", source: "hero" }]);
  });

  it("sin window (SSR) no hace nada ni lanza", () => {
    delete (globalThis as { window?: TestWindow }).window;
    expect(() => trackGuideLead("start", "guia-dj", "hero")).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("trackGuideCtaClick", () => {
  it("lleva la guía, el lugar y el artículo desde el que se saltó", () => {
    const dl = stubWindow("/blog/primera-hora-en-cabina");
    trackGuideCtaClick("guia-dj", "cierre");
    expect(dl).toEqual([
      { event: "guide_cta_click", guide: "guia-dj", placement: "cierre", page: "blog/primera-hora-en-cabina" },
    ]);
  });

  it("sin window (SSR) no hace nada ni lanza", () => {
    delete (globalThis as { window?: TestWindow }).window;
    expect(() => trackGuideCtaClick("guia-dj", "cierre")).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("embudo de reserva (GA4 ecommerce)", () => {
  const ITEM = { item_id: "sala-ensayo", item_name: "Sala de ensayo DJ", price: 9990, quantity: 2 };

  it("begin_checkout limpia ecommerce antes y empuja el objeto ecommerce estándar", () => {
    const dl = stubWindow("/reservar");
    trackBeginCheckout({ orderId: "ord-1", value: 17990, items: [ITEM], coupon: "first_booking", paymentType: "mercadopago" });
    expect(dl).toEqual([
      { ecommerce: null },
      {
        event: "begin_checkout",
        payment_type: "mercadopago",
        ecommerce: { currency: "CLP", value: 17990, transaction_id: "ord-1", coupon: "first_booking", items: [ITEM] },
      },
    ]);
    // Vercel Analytics solo acepta primitivos: copia plana sin items.
    expect(track).toHaveBeenCalledWith("begin_checkout", {
      currency: "CLP",
      value: 17990,
      transaction_id: "ord-1",
      payment_type: "mercadopago",
      coupon: "first_booking",
    });
  });

  it("purchase lleva transaction_id, value e items; sin cupón no manda coupon", () => {
    const dl = stubWindow("/reserva/estado");
    trackPurchase({ orderId: "ord-1", value: 0, items: [ITEM], paymentType: "beatcoins" });
    expect(dl[1]).toEqual({
      event: "purchase",
      payment_type: "beatcoins",
      ecommerce: { currency: "CLP", value: 0, transaction_id: "ord-1", items: [ITEM] },
    });
  });

  it("view_item y add_to_cart usan ecommerce; slot/step/login/error son eventos simples", () => {
    const dl = stubWindow("/reservar");
    trackViewItem({ item_id: "sala-ensayo", item_name: "Sala de ensayo DJ", price: 9990, quantity: 1 });
    trackAddon({ item_id: "rec_audio", item_name: "Grabación de audio", price: 9990, quantity: 1 });
    trackSlotSelected({ date: "2026-10-21", start: "10:00", durationHours: 2, tier: "Tarifa diurna" });
    trackBookingStep("datos");
    trackLogin();
    trackCheckoutError("slot_taken");
    const events = dl.filter((e) => (e as { event?: string }).event).map((e) => e as Record<string, unknown>);
    expect(events.map((e) => e.event)).toEqual([
      "view_item",
      "add_to_cart",
      "booking_slot_selected",
      "booking_step",
      "login",
      "checkout_error",
    ]);
    expect(events[1].ecommerce).toEqual({ currency: "CLP", value: 9990, items: [expect.objectContaining({ item_id: "rec_audio" })] });
    expect(events[2]).toMatchObject({ date: "2026-10-21", start: "10:00", duration_hours: "2", tier: "Tarifa diurna", page: "reservar" });
    expect(events[3]).toMatchObject({ step: "datos", page: "reservar" });
    expect(events[4]).toMatchObject({ method: "email_otp", page: "reservar" });
    expect(events[5]).toMatchObject({ code: "slot_taken", page: "reservar" });
  });
});
