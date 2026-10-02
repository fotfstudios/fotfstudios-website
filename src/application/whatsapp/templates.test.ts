import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRANSFER } from "@/lib/site";
import { WA_PARAM_MAX, WA_TEMPLATES, waParam, waTemplate, type WaButton } from "./templates";

/**
 * Contrato catálogo ↔ docs/whatsapp-templates.md. El texto de las plantillas vive en Meta; el doc
 * es su copia de referencia y lo que el dueño pega al crearlas. Si un parámetro del código no
 * existe en la plantilla aprobada, Meta rechaza el envío (132000) en producción, minutos después.
 */
const DOC = readFileSync(join(process.cwd(), "docs/whatsapp-templates.md"), "utf8");

interface DocTemplate {
  name: string;
  body: string;
  params: string[];
  section: string;
}

function parseDoc(): Map<string, DocTemplate> {
  const out = new Map<string, DocTemplate>();
  for (const chunk of DOC.split(/^### `/m).slice(1)) {
    const name = chunk.slice(0, chunk.indexOf("`"));
    const body = /```body\n([\s\S]*?)\n```/.exec(chunk)?.[1] ?? "";
    const params = [...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    out.set(name, { name, body, params, section: chunk });
  }
  return out;
}
const docs = parseDoc();

function docButton(t: DocTemplate, seen = new Set<string>()): WaButton {
  if (/Sin botón/.test(t.section)) return null;
  if (t.section.includes("/reserva/estado?b={{1}}")) return "estado";
  if (t.section.includes("/admin/reservas/{{1}}")) return "admin";
  const ref = /(?:misma URL que|igual que) `(\w+)`/.exec(t.section)?.[1];
  if (!ref || seen.has(ref) || !docs.has(ref)) throw new Error(`${t.name}: botón sin URL ni referencia válida`);
  return docButton(docs.get(ref)!, seen.add(t.name));
}

const entries = Object.entries(WA_TEMPLATES);

describe("catálogo ↔ docs/whatsapp-templates.md", () => {
  it("el doc y el catálogo tienen exactamente las mismas plantillas", () => {
    expect([...docs.keys()].sort()).toEqual(entries.map(([, d]) => d.name).sort());
  });

  it.each(entries)("%s: mismos parámetros que la plantilla del doc", (_e, def) => {
    expect([...new Set(docs.get(def.name)!.params)].sort()).toEqual([...def.params].sort());
  });

  it.each(entries)("%s: mismo tipo de botón que el doc", (_e, def) => {
    expect(docButton(docs.get(def.name)!)).toBe(def.button);
  });

  it.each(entries)("%s: cada parámetro tiene ejemplo (Meta los exige en la revisión)", (_e, def) => {
    for (const p of def.params) expect(docs.get(def.name)!.section).toMatch(new RegExp(`^\\| ${p} \\| .+ \\|$`, "m"));
  });
});

describe("reglas de Meta sobre el cuerpo", () => {
  it.each(entries)("%s: nombre en minúsculas, dígitos y _", (_e, def) => {
    expect(def.name).toMatch(/^[a-z0-9_]+$/);
    for (const p of def.params) expect(p).toMatch(/^[a-z_]+$/);
  });

  it.each(entries)("%s: ≤ 1024 caracteres, sin parámetro al inicio/fin ni dos pegados", (_e, def) => {
    const body = docs.get(def.name)!.body.trim();
    expect(body.length).toBeLessThanOrEqual(1024);
    expect(body.startsWith("{{")).toBe(false);
    expect(body.endsWith("}}")).toBe(false);
    expect(body).not.toMatch(/\}\}\s*\{\{/);
  });

  it.each(entries)("%s: sin lenguaje promocional (Meta la reclasificaría como Marketing) ni efectivo", (_e, def) => {
    expect(docs.get(def.name)!.body).not.toMatch(/oferta|descuento|promo|efectivo/i);
  });

  it("los datos de transferencia de fotf_pago_pendiente calzan con TRANSFER (lib/site.ts)", () => {
    const body = docs.get("fotf_pago_pendiente")!.body;
    for (const v of [TRANSFER.holder, TRANSFER.rut, TRANSFER.bank, TRANSFER.accountType, TRANSFER.accountNumber, TRANSFER.email]) {
      expect(body).toContain(v);
    }
  });
});

describe("waParam", () => {
  it("aplana saltos de línea, tabs y espacios repetidos (error 132018 de Meta)", () => {
    expect(waParam("Los Chercanes\n78a,\t  Viña     del Mar ")).toBe("Los Chercanes 78a, Viña del Mar");
  });
  it("un dato que falta sale como — (Meta rechaza parámetros vacíos)", () => {
    expect(waParam(null)).toBe("—");
    expect(waParam("   ")).toBe("—");
  });
  it("recorta lo que excede el tope", () => {
    const v = waParam("x".repeat(500));
    expect(v).toHaveLength(WA_PARAM_MAX);
    expect(v.endsWith("…")).toBe(true);
  });
});

describe("waTemplate", () => {
  it("arma nombre, idioma, parámetros saneados y sufijo del botón", () => {
    expect(waTemplate("booking_confirmed", { nombre: " Ana ", fecha: "sábado 4 de octubre, 18:00–20:00", total: "$30.000" }, "ord-1")).toEqual({
      name: "fotf_reserva_confirmada",
      language: "es",
      params: { nombre: "Ana", fecha: "sábado 4 de octubre, 18:00–20:00", total: "$30.000" },
      buttonSuffix: "ord-1",
    });
  });

  it("el sufijo va codificado para URL", () => {
    expect(waTemplate("owner_new_booking", { cliente: "A", fecha: "B", total: "C" }, "a b").buttonSuffix).toBe("a%20b");
  });

  it("sin botón no lleva buttonSuffix", () => {
    expect(waTemplate("access_pin", { nombre: "Ana", hora: "18:00", pin: "482913" })).not.toHaveProperty("buttonSuffix");
  });

  it("exige el sufijo cuando la plantilla tiene botón, y lo rechaza cuando no", () => {
    expect(() => waTemplate("payment_pending", { nombre: "A", fecha: "B", total: "C", plazo: "D" })).toThrow(/sufijo/);
    expect(() => waTemplate("test_ping", { fecha: "hoy" }, "x")).toThrow(/no tiene botón/);
  });
});
