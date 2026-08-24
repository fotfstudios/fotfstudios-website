import { describe, expect, it } from "vitest";
import { courseErrorMessage, courseFieldMessage } from "./course-form";
import { COURSE_LEAD_CAPS, type CourseLeadField, type CourseLeadIssueCode } from "@/src/domain/course/lead";

const FIELDS: CourseLeadField[] = [...(Object.keys(COURSE_LEAD_CAPS) as CourseLeadField[]), "plan", "experience"];
const CODES: CourseLeadIssueCode[] = ["required", "too_long", "invalid"];

describe("courseFieldMessage", () => {
  // Si alguien agrega un campo al parser y olvida su etiqueta, esto lo caza:
  // el usuario vería "Completa undefined.".
  it("todo campo × código produce una frase en es-CL, nunca 'undefined'", () => {
    for (const field of FIELDS) {
      for (const code of CODES) {
        const msg = courseFieldMessage(field, code);
        expect(msg.length).toBeGreaterThan(0);
        expect(msg).not.toMatch(/undefined/);
        expect(msg).toMatch(/\.$|…$/);
      }
    }
  });

  it("email y teléfono tienen ayuda específica, no genérica", () => {
    expect(courseFieldMessage("email", "invalid")).toMatch(/incompleto/);
    expect(courseFieldMessage("phone", "invalid")).toMatch(/\+56/);
  });
});

describe("courseErrorMessage", () => {
  it("cubre red, rate limit y validación", () => {
    expect(courseErrorMessage("network")).toMatch(/conexión/i);
    expect(courseErrorMessage("rate_limited")).toMatch(/Demasiados/);
    expect(courseErrorMessage("validacion")).toMatch(/Revisa/);
  });

  it("el fallback ofrece WhatsApp: el curso se vende conversando", () => {
    expect(courseErrorMessage(undefined)).toMatch(/WhatsApp/);
    expect(courseErrorMessage("cualquier_cosa")).toMatch(/WhatsApp/);
  });
});
