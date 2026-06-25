import { describe, expect, it } from "vitest";
import { err, isErr, isOk, map, ok, type Result, unwrapOr } from "./result";

describe("Result", () => {
  it("ok lleva el valor", () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(r.ok && r.value).toBe(42);
  });

  it("err lleva el error", () => {
    const r = err("boom");
    expect(isErr(r)).toBe(true);
    expect(!r.ok && r.error).toBe("boom");
  });

  it("map transforma solo el ok", () => {
    expect(unwrapOr(map(ok(2), (n) => n * 3), 0)).toBe(6);
    const e: Result<number, string> = err("x");
    expect(unwrapOr(map(e, (n) => n * 3), -1)).toBe(-1);
  });
});
