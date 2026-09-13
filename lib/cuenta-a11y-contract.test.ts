import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contrato de accesibilidad del área de clientes y del acceso (login + widget).
 * Complementa lib/admin-a11y-contract.test.ts (tokens, escala tipográfica) con lo
 * que la auditoría de /cuenta (2026-09-13) encontró fuera de su alcance:
 *  - los inputs de identidad declaran su propósito (WCAG 1.3.5): autocomplete
 *  - el estado "enlace enviado" del login se anuncia (WCAG 4.1.3) y recibe el foco
 *  - la pestaña activa se expone con aria-current, no solo con color (1.4.1)
 *  - el widget de reserva no escribe texto con bone-mute (3.78:1, falla AA)
 *  - un input deshabilitado se ve deshabilitado
 *  - las tablas del cliente tienen nombre accesible (caption)
 */
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const LOGIN = "app/cuenta/login/page.tsx";
const PERFIL = "app/cuenta/(panel)/perfil/page.tsx";
const WIDGET = "components/booking/BookingWidget.tsx";

/** El bloque JSX del <input>/<Input> cuyo `id`/`name`/`type` contiene `needle`. */
function inputTag(src: string, needle: string): string {
  const re = /<(?:input|Input)\b[^>]*?\/?>/gs;
  const tag = [...src.matchAll(re)].map((m) => m[0]).find((t) => t.includes(needle));
  expect(tag, `input con "${needle}"`).toBeDefined();
  return tag!;
}

describe("inputs de identidad declaran su propósito (autocomplete)", () => {
  it("login: el correo lleva autoComplete=email e inputMode=email", () => {
    const tag = inputTag(read(LOGIN), 'type="email"');
    expect(tag).toContain('autoComplete="email"');
    expect(tag).toContain('inputMode="email"');
  });

  it("perfil: nombre y teléfono llevan autoComplete=name / tel", () => {
    const src = read(PERFIL);
    expect(inputTag(src, 'name="name"')).toContain('autoComplete="name"');
    expect(inputTag(src, 'name="phone"')).toContain('autoComplete="tel"');
  });

  it("widget: nombre, email y teléfono de la reserva llevan autoComplete", () => {
    const src = read(WIDGET);
    expect(inputTag(src, 'id="bk-name"')).toContain('autoComplete="name"');
    expect(inputTag(src, 'id="bk-email"')).toContain('autoComplete="email"');
    expect(inputTag(src, 'id="bk-phone"')).toContain('autoComplete="tel"');
  });
});

describe("login por enlace (/cuenta/login)", () => {
  const src = read(LOGIN);

  it("el mensaje de 'enlace enviado' vive en una región role=status enfocable", () => {
    // Existe desde el primer render (una live region creada junto con su texto no
    // se anuncia) y recibe el foco tras enviar: el botón que lo tenía desaparece.
    expect(src).toMatch(/role="status"[^>]*tabIndex=\{-1\}|tabIndex=\{-1\}[^>]*role="status"/);
    expect(src).toContain(".focus()");
  });
});

describe("widget de reserva — acceso con código", () => {
  const src = read(WIDGET);

  it("el campo del código se enfoca solo y acepta 6 dígitos", () => {
    const tag = inputTag(src, 'id="bk-login-code"');
    expect(tag).toContain("autoFocus");
    expect(tag).toContain("maxLength={6}");
  });

  it("no escribe texto con bone-mute (3.78:1 sobre ink falla AA)", () => {
    const hits = src.match(/[\w:-]*text-bone-mute(\/\d+)?/g) ?? [];
    expect([...new Set(hits)]).toEqual([]);
  });

  it("las instrucciones del acceso no van en versalitas de 10px (label-sm)", () => {
    // "Te enviamos un código…" / "Escribe el código que enviamos a…" son frases:
    // se leen en caja normal y ≥ 12px, no como etiqueta tracked uppercase.
    for (const phrase of ["Te enviamos un código", "Escribe el código que enviamos"]) {
      const i = src.indexOf(phrase);
      expect(i, phrase).toBeGreaterThan(0);
      const openingTag = src.slice(src.lastIndexOf("<", i), i);
      expect(openingTag, phrase).not.toContain("label-sm");
    }
  });
});

describe("navegación y controles del área de clientes", () => {
  it("la pestaña activa se expone con aria-current=page", () => {
    expect(read("components/cuenta/CuentaTabs.tsx")).toContain('aria-current={');
  });

  it("inputCls tiene estado deshabilitado visible (no idéntico al editable)", () => {
    const src = read("components/admin/ui/styles.ts");
    const inputCls = src.match(/export const inputCls =\s*([\s\S]*?);/)![1];
    expect(inputCls).toMatch(/disabled:(text|border|bg)-/);
  });

  it("las tablas del cliente tienen nombre accesible (caption)", () => {
    expect(read("components/admin/ui/DataTable.tsx")).toContain("<caption");
    expect(read("app/cuenta/(panel)/page.tsx")).toMatch(/<DataTable[^>]*caption=/);
    expect(read("app/cuenta/(panel)/reservas/page.tsx")).toMatch(/<DataTable[^>]*caption=/);
  });
});
