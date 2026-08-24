import { describe, expect, it } from "vitest";
import { COURSE_LEAD_CAPS, parseCourseLead } from "./lead";

/** Cuerpo válido mínimo; los tests lo mutan campo a campo. */
const valid = () => ({
  name: "Camila Rojas",
  email: "Cami@Correo.CL",
  phone: "+56 9 1234 5678",
  plan: "duo",
  experience: "cero",
  availability: "Martes y jueves en la tarde",
  message: "Voy con una amiga.",
  website: "",
});

function issuesOf(raw: unknown): { field: string; code: string }[] {
  const r = parseCourseLead(raw);
  return r.kind === "invalid" ? r.issues : [];
}

describe("parseCourseLead — camino feliz y normalización", () => {
  it("un cuerpo válido devuelve kind:ok con valores normalizados", () => {
    const r = parseCourseLead(valid());
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.value).toEqual({
      name: "Camila Rojas",
      email: "cami@correo.cl", // minúsculas
      phone: "+56912345678", // sin espacios
      plan: "duo",
      experience: "cero",
      availability: "Martes y jueves en la tarde",
      message: "Voy con una amiga.",
    });
  });

  it("el mensaje es opcional: vacío viaja como null", () => {
    const r = parseCourseLead({ ...valid(), message: "" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.value.message).toBeNull();
  });

  it("acepta los cuatro intereses, incluido 'aún no sé'", () => {
    for (const plan of ["duo", "individual", "prueba", "no_se"]) {
      expect(parseCourseLead({ ...valid(), plan }).kind).toBe("ok");
    }
  });
});

describe("parseCourseLead — honeypot", () => {
  it("website no vacío → kind:spam, aun si todo lo demás es inválido", () => {
    expect(parseCourseLead({ website: "http://spam.example", name: "", email: "x" }).kind).toBe("spam");
  });

  it("website vacío no afecta al camino feliz", () => {
    expect(parseCourseLead(valid()).kind).toBe("ok");
  });
});

describe("parseCourseLead — devuelve TODOS los issues, no solo el primero", () => {
  it("un cuerpo vacío reporta cada campo requerido", () => {
    const fields = issuesOf({}).map((i) => i.field).sort();
    expect(fields).toEqual(["availability", "email", "experience", "name", "phone", "plan"]);
  });

  it("no es objeto → inválido, sin reventar", () => {
    expect(parseCourseLead(null).kind).toBe("invalid");
    expect(parseCourseLead("texto").kind).toBe("invalid");
    expect(parseCourseLead([]).kind).toBe("invalid");
  });
});

describe("parseCourseLead — validación por campo", () => {
  it("email sin dominio es inválido", () => {
    expect(issuesOf({ ...valid(), email: "cami@correo" })).toContainEqual({ field: "email", code: "invalid" });
  });

  it("un teléfono demasiado corto es inválido", () => {
    expect(issuesOf({ ...valid(), phone: "1234567" })).toContainEqual({ field: "phone", code: "invalid" });
  });

  it("un teléfono largo con separadores se normaliza igual", () => {
    const r = parseCourseLead({ ...valid(), phone: "(+56) 9-6280 3298" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.value.phone).toBe("+56962803298");
  });

  it("plan y experiencia fuera del catálogo son inválidos", () => {
    expect(issuesOf({ ...valid(), plan: "trio" })).toContainEqual({ field: "plan", code: "invalid" });
    expect(issuesOf({ ...valid(), experience: "experto" })).toContainEqual({
      field: "experience",
      code: "invalid",
    });
  });

  it("cada tope de largo se respeta", () => {
    for (const [field, cap] of Object.entries(COURSE_LEAD_CAPS)) {
      const over = { ...valid(), [field]: "x".repeat(cap + 1) };
      expect(issuesOf(over)).toContainEqual({ field, code: "too_long" });
    }
  });

  it("justo en el tope todavía es válido", () => {
    const r = parseCourseLead({ ...valid(), name: "x".repeat(COURSE_LEAD_CAPS.name) });
    expect(r.kind).toBe("ok");
  });
});
