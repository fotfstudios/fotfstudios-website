import { describe, expect, it } from "vitest";
import { clMobileDigits, formatClMobile, isValidClMobile, toE164ClMobile } from "./phone-input";

describe("clMobileDigits", () => {
  it("deja solo los 9 dígitos locales al teclear", () => {
    expect(clMobileDigits("9 1234 5678")).toBe("912345678");
    expect(clMobileDigits("91234567890")).toBe("912345678"); // tope de 9
  });

  it("acepta pegado con +56 / 56 / 0056", () => {
    expect(clMobileDigits("+56 9 6280 3298")).toBe("962803298");
    expect(clMobileDigits("56962803298")).toBe("962803298");
    expect(clMobileDigits("0056 9 6280 3298")).toBe("962803298");
  });

  it("no confunde un 56 al inicio de lo que se está tecleando", () => {
    expect(clMobileDigits("56")).toBe("56");
  });
});

describe("formatClMobile", () => {
  it("formatea progresivo como 9 1234 5678", () => {
    expect(formatClMobile("9")).toBe("9");
    expect(formatClMobile("912")).toBe("9 12");
    expect(formatClMobile("912345")).toBe("9 1234 5");
    expect(formatClMobile("912345678")).toBe("9 1234 5678");
  });
});

describe("isValidClMobile / toE164ClMobile", () => {
  it("celular chileno de 9 dígitos que empieza con 9", () => {
    expect(isValidClMobile("9 1234 5678")).toBe(true);
    expect(isValidClMobile("+56 9 6280 3298")).toBe(true);
    expect(toE164ClMobile("9 6280 3298")).toBe("+56962803298");
  });

  it("rechaza fijos, cortos y vacíos", () => {
    expect(isValidClMobile("2 2345 6789")).toBe(false); // fijo de Santiago
    expect(isValidClMobile("123")).toBe(false);
    expect(isValidClMobile("")).toBe(false);
    expect(toE164ClMobile("123")).toBeNull();
  });
});
