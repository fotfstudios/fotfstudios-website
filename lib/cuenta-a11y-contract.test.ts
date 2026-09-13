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

describe("login por código (/cuenta/login)", () => {
  const src = read(LOGIN);

  it("el 'código enviado' se anuncia en una región role=status presente desde el primer render", () => {
    // Una live region creada junto con su texto no se anuncia: existe siempre.
    expect(src).toContain('role="status"');
  });

  it("pide el código en la misma página: campo de 6 dígitos con one-time-code y foco al montar", () => {
    const tag = inputTag(src, 'autoComplete="one-time-code"');
    expect(tag).toContain('inputMode="numeric"');
    expect(tag).toContain("maxLength={6}");
    expect(tag).toContain("autoFocus");
    // Los pasos van con key: misma forma JSX → React reutilizaría el <input>.
    expect(src).toMatch(/<Fragment key="email">[\s\S]*<Fragment key="code">/);
  });

  it("el enlace del correo sigue siendo la vía secundaria y hay salida si el correo estaba mal", () => {
    expect(src).toContain("emailRedirectTo");
    expect(src).toMatch(/enlace del correo/i);
    expect(src).toMatch(/Cambiar correo/);
    expect(src).toMatch(/Reenviar/);
  });
});

describe("un solo gesto de acceso (login + widget)", () => {
  it("las dos superficies usan el mismo hook useOtpLogin", () => {
    for (const f of [LOGIN, WIDGET]) expect(read(f), f).toMatch(/from "@\/components\/cuenta\/useOtpLogin"/);
  });

  it("el widget tiene UN solo campo de correo: el de la reserva (no hay bk-login-email)", () => {
    const src = read(WIDGET);
    expect(src).not.toContain("bk-login-email");
    expect(src).not.toContain("loginEmail");
  });

  it("el panel del código no es una tarjeta anidada ni repite el mensaje de éxito", () => {
    const src = read(WIDGET);
    expect(src).not.toContain('className="mt-3 border hairline p-4"');
    expect(src).not.toContain("¡Sesión iniciada!");
    expect(src).toContain("Sesión iniciada como");
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

  it("DataTable acepta caption (nombre accesible sr-only)", () => {
    expect(read("components/admin/ui/DataTable.tsx")).toContain("<caption");
  });
});

describe("layout de teléfono del área de clientes", () => {
  const RESERVAS = "app/cuenta/(panel)/reservas/page.tsx";
  const RESUMEN = "app/cuenta/(panel)/page.tsx";

  it("reservas e historial son listas con nombre accesible, no tablas con scroll lateral", () => {
    // A 375px la tabla de reservas medía 512px en 333px: "Ver estado →" y el total
    // quedaban fuera de pantalla sin ninguna pista de que se podía arrastrar.
    for (const f of [RESERVAS, RESUMEN]) {
      expect(read(f), f).not.toMatch(/from "@\/components\/admin\/ui\/DataTable"/);
      expect(read(f), f).not.toContain("min-w-[");
    }
    expect(read("components/cuenta/BookingList.tsx")).toMatch(/<ul[^>]*aria-label=/);
    expect(read("components/cuenta/MovementList.tsx")).toMatch(/<ul[^>]*aria-label=/);
  });

  it("la fila de una reserva es un enlace estirado con nombre accesible (mismo patrón que el admin)", () => {
    const src = read("components/cuenta/BookingList.tsx");
    expect(src).toContain("after:absolute after:inset-0");
    expect(src).toMatch(/aria-label=\{`Ver estado/);
  });

  it("el shell: CTA Reservar visible en teléfono y objetivos táctiles de 40px+", () => {
    const src = read("components/cuenta/CuentaShell.tsx");
    expect(src).not.toContain("hidden sm:inline-block");
    // Logo (24×24), chip de puntos (27px) y Salir (33px) medían por debajo de 40px.
    const controls = src.match(/<(?:Link|SignOutButton)\b[^>]*>/gs) ?? [];
    const small = controls.filter((c) => !/min-h-10|min-h-11|py-2\.5|h-10/.test(c));
    expect(small, "controles del header sin alto táctil").toEqual([]);
  });

  it("las tabs miden 44px de alto (py-3 + label)", () => {
    expect(read("components/cuenta/CuentaTabs.tsx")).toMatch(/className=\{`label[^`]*py-3/);
  });

  it("btn md mide ≥ 44px (min-h-11): las CTA primarias del cliente medían 38px", () => {
    expect(read("components/admin/ui/styles.ts")).toMatch(/md: "[^"]*min-h-11/);
  });
});
