import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Badge from "./Badge";
import Checkbox from "./Checkbox";
import Input from "./Input";
import Switch from "./Switch";

/** Cableado de accesibilidad del DS: controles nativos y descripciones enlazadas. */
describe("design system: controles", () => {
  it("Checkbox es un checkbox nativo dentro de su label", () => {
    const html = renderToStaticMarkup(h(Checkbox, { name: "terms", defaultChecked: true, children: "Acepto" }));
    expect(html).toMatch(/^<label class="ds-check">/);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="terms"');
    expect(html).toContain("Acepto");
  });

  it("Switch expone role=switch", () => {
    const html = renderToStaticMarkup(h(Switch, { "aria-label": "Usar Beatcoins" }));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Usar Beatcoins"');
  });

  it("Input enlaza ayuda y error por aria-describedby", () => {
    const html = renderToStaticMarkup(h(Input, { id: "bk-email", label: "Email", help: "Te enviamos el comprobante", error: "Falta" }));
    expect(html).toContain('aria-describedby="bk-email-help bk-email-err"');
    expect(html).toContain('id="bk-email-help"');
    expect(html).toContain('id="bk-email-err"');
  });

  it("Input sin ayuda ni error no declara aria-describedby", () => {
    expect(renderToStaticMarkup(h(Input, { id: "x", label: "Nombre" }))).not.toContain("aria-describedby");
  });

  it("Badge aplica la variante y el punto decorativo", () => {
    const html = renderToStaticMarkup(h(Badge, { variant: "gold", dot: true, children: "−10%" }));
    expect(html).toContain('class="ds-badge ds-badge--gold"');
    expect(html).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(h(Badge, { children: "x" }))).toContain('class="ds-badge"');
  });
});
