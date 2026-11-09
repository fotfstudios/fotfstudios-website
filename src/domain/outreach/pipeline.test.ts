import { describe, it, expect } from "vitest";
import { isLeadStage, advanceStage, LEAD_STAGES } from "./pipeline";

describe("isLeadStage", () => {
  it("acepta las etapas válidas", () => {
    for (const s of LEAD_STAGES) expect(isLeadStage(s)).toBe(true);
  });
  it("rechaza cualquier otra cosa", () => {
    expect(isLeadStage("won")).toBe(false);
    expect(isLeadStage("")).toBe(false);
    expect(isLeadStage(null)).toBe(false);
    expect(isLeadStage(3)).toBe(false);
  });
});

describe("advanceStage (solo hacia adelante)", () => {
  it("avanza cuando el destino está más adelante", () => {
    expect(advanceStage("nuevo", "contactado")).toBe("contactado");
    expect(advanceStage("nuevo", "ganado")).toBe("ganado");
    expect(advanceStage("contactado", "ganado")).toBe("ganado");
  });

  it("no retrocede ni se queda en el mismo lugar", () => {
    expect(advanceStage("interesado", "contactado")).toBeNull();
    expect(advanceStage("contactado", "contactado")).toBeNull();
  });

  it("no toca una ficha terminal (ganado/perdido)", () => {
    expect(advanceStage("ganado", "ganado")).toBeNull();
    expect(advanceStage("perdido", "ganado")).toBeNull();
  });
});
