import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "./request-ip";

const h = (obj: Record<string, string>) => new Headers(obj);

describe("clientIpFromHeaders", () => {
  it("toma el primer IP de x-forwarded-for (el cliente, antes de los proxies)", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.9.9.9" }))).toBe("1.2.3.4");
  });

  it("recorta espacios", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "  200.1.2.3  " }))).toBe("200.1.2.3");
  });

  it("cae a x-real-ip cuando no hay x-forwarded-for", () => {
    expect(clientIpFromHeaders(h({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("sin headers de IP → null", () => {
    expect(clientIpFromHeaders(h({}))).toBeNull();
  });

  it("x-forwarded-for vacío o solo comas → cae a x-real-ip / null", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "  ,  ", "x-real-ip": "7.7.7.7" }))).toBe("7.7.7.7");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "" }))).toBeNull();
  });
});
