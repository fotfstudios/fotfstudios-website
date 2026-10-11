import { describe, expect, it } from "vitest";
import { suggestsCheckoutLogin } from "./checkout-login";

describe("suggestsCheckoutLogin", () => {
  it("sugiere entrar solo si el correo tiene Beatcoins para canjear", () => {
    expect(suggestsCheckoutLogin({ pointsBalance: 1200 })).toBe(true);
    expect(suggestsCheckoutLogin({ pointsBalance: 0 })).toBe(false);
  });

  it("un correo sin ficha no sugiere nada", () => {
    expect(suggestsCheckoutLogin(null)).toBe(false);
  });
});
