import { afterEach, describe, expect, it } from "vitest";
import { assertBaseEnv, BASE_REQUIRED, missingBaseEnv, requireEnv } from "./env";

const snapshot = { ...process.env };
afterEach(() => {
  process.env = { ...snapshot };
});

describe("requireEnv", () => {
  it("devuelve el valor cuando está presente", () => {
    process.env.SOME_VAR = "x";
    expect(requireEnv("SOME_VAR")).toBe("x");
  });
  it("lanza con el nombre cuando falta o está vacía", () => {
    delete process.env.SOME_VAR;
    expect(() => requireEnv("SOME_VAR")).toThrow(/SOME_VAR/);
    process.env.SOME_VAR = "";
    expect(() => requireEnv("SOME_VAR")).toThrow(/SOME_VAR/);
  });
});

describe("missingBaseEnv / assertBaseEnv", () => {
  it("lista TODAS las base faltantes a la vez (agregado)", () => {
    for (const n of BASE_REQUIRED) delete process.env[n];
    expect(missingBaseEnv()).toEqual([...BASE_REQUIRED]);
    expect(() => assertBaseEnv()).toThrow(/SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/s);
  });
  it("no lanza cuando todas las base están presentes", () => {
    for (const n of BASE_REQUIRED) process.env[n] = "set";
    expect(missingBaseEnv()).toEqual([]);
    expect(() => assertBaseEnv()).not.toThrow();
  });
});
