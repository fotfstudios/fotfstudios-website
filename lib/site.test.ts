import { describe, expect, it } from "vitest";
import { PRICING } from "./site";
import { RATES, formatCLP } from "./pricing";

describe("PRICING marketing const", () => {
  it("derives the JSON-LD price range from the real rates", () => {
    expect(PRICING.priceRange).toBe(`${formatCLP(RATES.valle)} – ${formatCLP(RATES.puntaFinde)}`);
    expect(PRICING.priceRange).toBe("$9.990 – $19.990");
  });
});
