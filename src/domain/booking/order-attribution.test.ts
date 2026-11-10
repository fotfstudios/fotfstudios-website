import { describe, expect, it } from "vitest";
import {
  EMPTY_ORDER_ATTRIBUTION,
  hasOrderAttribution,
  parseOrderAttribution,
} from "./order-attribution";

describe("parseOrderAttribution", () => {
  it("un crudo vacío / no-objeto da la atribución vacía", () => {
    expect(parseOrderAttribution(undefined)).toEqual(EMPTY_ORDER_ATTRIBUTION);
    expect(parseOrderAttribution(null)).toEqual(EMPTY_ORDER_ATTRIBUTION);
    expect(parseOrderAttribution("meta")).toEqual(EMPTY_ORDER_ATTRIBUTION);
    expect(parseOrderAttribution([1, 2])).toEqual(EMPTY_ORDER_ATTRIBUTION);
    expect(parseOrderAttribution({})).toEqual(EMPTY_ORDER_ATTRIBUTION);
  });

  it("UTM se recortan, se limpian y respetan el tope de 120", () => {
    const a = parseOrderAttribution({
      utmSource: "  meta  ",
      utmMedium: "paid\u0000social",
      utmCampaign: "x".repeat(200),
      utmContent: "",
      utmTerm: 42,
    });
    expect(a.utmSource).toBe("meta");
    expect(a.utmMedium).toBe("paidsocial");
    expect(a.utmCampaign).toHaveLength(120);
    expect(a.utmContent).toBeNull();
    expect(a.utmTerm).toBeNull();
  });

  it("referrerHost se pasa a minúsculas y se recorta a 253", () => {
    expect(parseOrderAttribution({ referrerHost: "Instagram.com" }).referrerHost).toBe("instagram.com");
    expect(parseOrderAttribution({ referrerHost: "h".repeat(300) }).referrerHost).toHaveLength(253);
  });

  it("landingPath conserva / ? & = % y solo se recorta (sin charset)", () => {
    const a = parseOrderAttribution({ landingPath: "/reservar?utm_source=meta&x=1%202" });
    expect(a.landingPath).toBe("/reservar?utm_source=meta&x=1%202");
    expect(parseOrderAttribution({ landingPath: "/" + "a".repeat(600) }).landingPath).toHaveLength(512);
  });

  it("click IDs válidos (base64url + punto) pasan; raros o largos se descartan ENTEROS", () => {
    const a = parseOrderAttribution({
      gclid: "EAIaIQ.obChMI-1_2",
      gbraid: "0AAAA.123",
      wbraid: "Cj0KCQ",
      fbclid: "IwAR0abc",
    });
    expect(a.gclid).toBe("EAIaIQ.obChMI-1_2");
    expect(a.gbraid).toBe("0AAAA.123");
    expect(a.wbraid).toBe("Cj0KCQ");
    expect(a.fbclid).toBe("IwAR0abc");

    const bad = parseOrderAttribution({
      gclid: "tiene espacio",
      gbraid: "signo$",
      wbraid: "z".repeat(513),
      fbclid: "",
    });
    expect(bad.gclid).toBeNull();
    expect(bad.gbraid).toBeNull();
    expect(bad.wbraid).toBeNull();
    expect(bad.fbclid).toBeNull();
  });

  it("cookies de Meta (_fbc/_fbp) pasan con su formato fb.1.<ts>.<id>", () => {
    const a = parseOrderAttribution({ fbc: "fb.1.1699900000.IwAR0abc", fbp: "fb.1.1699900000.1234567890" });
    expect(a.fbc).toBe("fb.1.1699900000.IwAR0abc");
    expect(a.fbp).toBe("fb.1.1699900000.1234567890");
    expect(parseOrderAttribution({ fbp: "fb 1" }).fbp).toBeNull();
  });

  it("GA4: client_id ≤128 y session_id ≤64, ambos con charset", () => {
    const a = parseOrderAttribution({ gaClientId: "1234567890.1699900000", gaSessionId: "1699900000" });
    expect(a.gaClientId).toBe("1234567890.1699900000");
    expect(a.gaSessionId).toBe("1699900000");
    expect(parseOrderAttribution({ gaClientId: "9".repeat(129) }).gaClientId).toBeNull();
    expect(parseOrderAttribution({ gaSessionId: "9".repeat(65) }).gaSessionId).toBeNull();
    expect(parseOrderAttribution({ gaClientId: "GA1.1.x y" }).gaClientId).toBeNull();
  });
});

describe("hasOrderAttribution", () => {
  it("falso cuando no hay ninguna señal (reserva directa)", () => {
    expect(hasOrderAttribution(EMPTY_ORDER_ATTRIBUTION)).toBe(false);
    expect(hasOrderAttribution(parseOrderAttribution({ utmSource: "" }))).toBe(false);
  });

  it("verdadero con una sola señal, incluso solo la landing", () => {
    expect(hasOrderAttribution(parseOrderAttribution({ landingPath: "/reservar" }))).toBe(true);
    expect(hasOrderAttribution(parseOrderAttribution({ gclid: "EAIaIQ" }))).toBe(true);
  });
});
