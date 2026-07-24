import { describe, expect, it } from "vitest";
import {
  APPLICATION_CAPS,
  APPLICATION_STATUSES,
  SESSION_FORMATS,
  isApplicationStatus,
  isSessionFormat,
  parseApplication,
} from "./application";

/** Cuerpo válido mínimo; los tests lo mutan campo a campo. */
const valid = () => ({
  name: "Valentina Díaz",
  email: "Vale@Correo.CL",
  phone: "+56 9 1234 5678",
  format: "ambas",
  availability: "Tardes de semana y sábados",
  mixUrl: "soundcloud.com/vale/set",
  instagram: "@vale.dj",
  genres: "House, techno",
  pitch: "Llevo 5 años pinchando y ya he hecho clases a principiantes.",
  website: "",
});

function issuesOf(raw: unknown): { field: string; code: string }[] {
  const r = parseApplication(raw);
  return r.kind === "invalid" ? r.issues : [];
}

describe("parseApplication — camino feliz y normalización", () => {
  it("un cuerpo válido devuelve kind:ok con valores normalizados", () => {
    const r = parseApplication(valid());
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.value).toEqual({
      name: "Valentina Díaz",
      email: "vale@correo.cl", // minúsculas
      phone: "+56912345678", // sin espacios
      format: "ambas",
      availability: "Tardes de semana y sábados",
      mixUrl: "https://soundcloud.com/vale/set", // esquema agregado
      instagram: "vale.dj", // sin @
      genres: "House, techno",
      pitch: "Llevo 5 años pinchando y ya he hecho clases a principiantes.",
    });
  });

  it("instagram y genres vacíos → null (opcionales)", () => {
    const r = parseApplication({ ...valid(), instagram: "  ", genres: "" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.value.instagram).toBeNull();
    expect(r.value.genres).toBeNull();
  });

  it("recorta espacios en los campos de texto", () => {
    const r = parseApplication({ ...valid(), name: "  Vale  ", pitch: "  hola  " });
    if (r.kind !== "ok") return;
    expect(r.value.name).toBe("Vale");
    expect(r.value.pitch).toBe("hola");
  });
});

describe("parseApplication — honeypot", () => {
  it("website no vacío → kind:spam, aun si todo lo demás es inválido", () => {
    const r = parseApplication({ website: "http://spam.example", name: "", email: "x" });
    expect(r.kind).toBe("spam");
  });

  it("website vacío no gatilla spam", () => {
    expect(parseApplication(valid()).kind).toBe("ok");
  });
});

describe("parseApplication — requeridos", () => {
  it.each(["name", "email", "phone", "mixUrl", "availability", "pitch"] as const)(
    "%s vacío → issue required",
    (field) => {
      const codes = issuesOf({ ...valid(), [field]: "   " });
      expect(codes).toContainEqual({ field, code: "required" });
    },
  );

  it("recolecta TODOS los issues a la vez, no solo el primero", () => {
    const codes = issuesOf({ ...valid(), name: "", email: "", pitch: "" });
    expect(codes).toEqual(
      expect.arrayContaining([
        { field: "name", code: "required" },
        { field: "email", code: "required" },
        { field: "pitch", code: "required" },
      ]),
    );
  });
});

describe("parseApplication — topes de largo", () => {
  it("cada campo acepta exactamente el tope y rechaza tope+1", () => {
    // name en el tope pasa
    const atCap = parseApplication({ ...valid(), name: "a".repeat(APPLICATION_CAPS.name) });
    expect(atCap.kind).toBe("ok");
    // name en tope+1 → too_long
    const overCap = issuesOf({ ...valid(), name: "a".repeat(APPLICATION_CAPS.name + 1) });
    expect(overCap).toContainEqual({ field: "name", code: "too_long" });
  });

  it("pitch sobre el tope → too_long", () => {
    const codes = issuesOf({ ...valid(), pitch: "x".repeat(APPLICATION_CAPS.pitch + 1) });
    expect(codes).toContainEqual({ field: "pitch", code: "too_long" });
  });
});

describe("parseApplication — format (qué puede ofrecer)", () => {
  it("acepta cada formato del catálogo", () => {
    for (const f of SESSION_FORMATS) {
      expect(parseApplication({ ...valid(), format: f }).kind).toBe("ok");
    }
  });

  it("vacío → required", () => {
    expect(issuesOf({ ...valid(), format: "" })).toContainEqual({ field: "format", code: "required" });
  });

  it("valor fuera del catálogo → invalid", () => {
    expect(issuesOf({ ...valid(), format: "otro" })).toContainEqual({ field: "format", code: "invalid" });
  });
});

describe("parseApplication — availability", () => {
  it("sobre el tope → too_long", () => {
    const codes = issuesOf({ ...valid(), availability: "x".repeat(APPLICATION_CAPS.availability + 1) });
    expect(codes).toContainEqual({ field: "availability", code: "too_long" });
  });
});

describe("parseApplication — email", () => {
  it.each(["sin-arroba", "a@b", "a@b.c", "espacio @correo.cl"])(
    "email inválido %s → issue invalid",
    (email) => {
      expect(issuesOf({ ...valid(), email })).toContainEqual({ field: "email", code: "invalid" });
    },
  );

  it("acepta un email normal y lo pasa a minúsculas", () => {
    const r = parseApplication({ ...valid(), email: "ABC@Gmail.Com" });
    if (r.kind !== "ok") return;
    expect(r.value.email).toBe("abc@gmail.com");
  });
});

describe("parseApplication — phone", () => {
  it("normaliza a + y dígitos, quitando espacios/guiones/paréntesis", () => {
    const r = parseApplication({ ...valid(), phone: "(+56) 9-1234-5678" });
    if (r.kind !== "ok") return;
    expect(r.value.phone).toBe("+56912345678");
  });

  it.each(["12345", "+1234567890123456"])("phone fuera de 8–15 dígitos → invalid (%s)", (phone) => {
    expect(issuesOf({ ...valid(), phone })).toContainEqual({ field: "phone", code: "invalid" });
  });
});

describe("parseApplication — mixUrl", () => {
  it("agrega https:// cuando falta el esquema", () => {
    const r = parseApplication({ ...valid(), mixUrl: "youtu.be/abc" });
    if (r.kind !== "ok") return;
    expect(r.value.mixUrl).toBe("https://youtu.be/abc");
  });

  it.each(["javascript:alert(1)", "ftp://host/x", "no-es-url", "http://sindominio"])(
    "url no http(s) o sin dominio → invalid (%s)",
    (mixUrl) => {
      expect(issuesOf({ ...valid(), mixUrl })).toContainEqual({ field: "mixUrl", code: "invalid" });
    },
  );
});

describe("parseApplication — entradas hostiles / no-objeto", () => {
  it.each([null, undefined, "texto", 42, []])("raw no-objeto (%s) → invalid, no lanza", (raw) => {
    const r = parseApplication(raw);
    expect(r.kind).toBe("invalid");
  });

  it("campos no-string se tratan como vacíos (required), no lanzan", () => {
    const codes = issuesOf({ name: 123, email: {}, phone: null, mixUrl: [], pitch: true, website: "" });
    expect(codes).toContainEqual({ field: "name", code: "required" });
  });
});

describe("isApplicationStatus", () => {
  it("acepta los estados del catálogo y rechaza otros", () => {
    for (const s of APPLICATION_STATUSES) expect(isApplicationStatus(s)).toBe(true);
    expect(isApplicationStatus("cualquier")).toBe(false);
    expect(isApplicationStatus("")).toBe(false);
  });
});

describe("isSessionFormat", () => {
  it("acepta los formatos del catálogo y rechaza otros", () => {
    for (const f of SESSION_FORMATS) expect(isSessionFormat(f)).toBe(true);
    expect(isSessionFormat("otro")).toBe(false);
    expect(isSessionFormat("")).toBe(false);
  });
});
