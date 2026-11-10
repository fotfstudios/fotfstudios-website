import { afterEach, describe, expect, it } from "vitest";
import { collectBookingAttribution, rememberBookingOrigin } from "./booking-attribution";

type Win = {
  location: { pathname: string; search: string; hostname: string };
  sessionStorage: Storage;
};

function fakeStore(throwing = false): Storage {
  const m = new Map<string, string>();
  const guard = () => {
    if (throwing) throw new Error("storage bloqueado");
  };
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => {
      guard();
      return m.get(k) ?? null;
    },
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => {
      guard();
      m.set(k, v);
    },
  };
}

function stub(opts: {
  pathname?: string;
  search?: string;
  hostname?: string;
  cookie?: string;
  referrer?: string;
  storage?: Storage;
}): Storage {
  const storage = opts.storage ?? fakeStore();
  (globalThis as { window?: Win }).window = {
    location: { pathname: opts.pathname ?? "/reservar", search: opts.search ?? "", hostname: opts.hostname ?? "fotfstudios.cl" },
    sessionStorage: storage,
  };
  (globalThis as { document?: { cookie: string; referrer: string } }).document = {
    cookie: opts.cookie ?? "",
    referrer: opts.referrer ?? "",
  };
  return storage;
}

afterEach(() => {
  delete (globalThis as { window?: Win }).window;
  delete (globalThis as { document?: unknown }).document;
});

describe("collectBookingAttribution", () => {
  it("toma UTM / click IDs de ESTA URL y la landing (path + query)", () => {
    stub({ search: "?utm_source=meta&utm_medium=paid&gclid=EAIaIQ", pathname: "/reservar" });
    const a = collectBookingAttribution();
    expect(a.utmSource).toBe("meta");
    expect(a.utmMedium).toBe("paid");
    expect(a.gclid).toBe("EAIaIQ");
    expect(a.landingPath).toBe("/reservar?utm_source=meta&utm_medium=paid&gclid=EAIaIQ");
  });

  it("lee client_id/session_id de GA (_ga, _ga_<stream>) y _fbp/_fbc de Meta", () => {
    stub({
      cookie:
        "_ga=GA1.1.1234567890.1699900000; _ga_5K07LY6W3N=GS1.1.1699900500.3.1.1699900550.0; _fbp=fb.1.1699900000.111; _fbc=fb.1.1699900000.IwAR0",
    });
    const a = collectBookingAttribution();
    expect(a.gaClientId).toBe("1234567890.1699900000");
    expect(a.gaSessionId).toBe("1699900500");
    expect(a.fbp).toBe("fb.1.1699900000.111");
    expect(a.fbc).toBe("fb.1.1699900000.IwAR0");
  });

  it("sin cookies no inventa campos", () => {
    stub({ search: "?utm_source=meta" });
    const a = collectBookingAttribution();
    expect(a.gaClientId).toBeUndefined();
    expect(a.gaSessionId).toBeUndefined();
    expect(a.fbp).toBeUndefined();
    expect(a.fbc).toBeUndefined();
  });

  it("recuerda el origen pagado y lo resuelve tras navegar a una URL sin señal", () => {
    const storage = stub({ search: "?utm_source=meta&utm_campaign=lanzamiento&gclid=EAIaIQ", pathname: "/reservar" });
    rememberBookingOrigin();
    // Navega al home y vuelve a /reservar sin query: la URL ya no trae el origen.
    stub({ search: "", pathname: "/reservar", storage });
    const a = collectBookingAttribution();
    expect(a.utmSource).toBe("meta");
    expect(a.utmCampaign).toBe("lanzamiento");
    expect(a.gclid).toBe("EAIaIQ");
    expect(a.landingPath).toBe("/reservar?utm_source=meta&utm_campaign=lanzamiento&gclid=EAIaIQ");
  });

  it("sin señal ni memoria usa la URL actual (al menos la landing)", () => {
    stub({ search: "", pathname: "/reservar" });
    const a = collectBookingAttribution();
    expect(a.utmSource).toBeUndefined();
    expect(a.gclid).toBeUndefined();
    expect(a.landingPath).toBe("/reservar");
  });

  it("una navegación interna sin señal NO pisa el origen recordado", () => {
    const storage = stub({ search: "?gclid=EAIaIQ", pathname: "/reservar" });
    rememberBookingOrigin();
    stub({ search: "", pathname: "/reservar", storage });
    rememberBookingOrigin(); // sin señal: no guarda nada nuevo
    expect(collectBookingAttribution().gclid).toBe("EAIaIQ");
  });

  it("sessionStorage que revienta no tumba nada (degrada a la URL)", () => {
    stub({ search: "?gclid=EAIaIQ", storage: fakeStore(true) });
    expect(() => rememberBookingOrigin()).not.toThrow();
    expect(collectBookingAttribution().gclid).toBe("EAIaIQ");
  });

  it("en el servidor (sin window) es un no-op silencioso", () => {
    delete (globalThis as { window?: Win }).window;
    delete (globalThis as { document?: unknown }).document;
    expect(() => rememberBookingOrigin()).not.toThrow();
    expect(collectBookingAttribution()).toEqual({});
  });
});
