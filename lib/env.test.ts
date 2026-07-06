import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertBaseEnv,
  BASE_REQUIRED,
  missingBaseEnv,
  missingProdEnv,
  PROD_RECOMMENDED,
  requireEnv,
  warnMissingProdEnv,
} from "./env";

const snapshot = { ...process.env };
afterEach(() => {
  process.env = { ...snapshot };
  vi.restoreAllMocks();
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

describe("missingProdEnv / warnMissingProdEnv", () => {
  it("lista las recomendadas faltantes sin lanzar", () => {
    for (const n of PROD_RECOMMENDED) delete process.env[n];
    expect(missingProdEnv()).toEqual([...PROD_RECOMMENDED]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => warnMissingProdEnv()).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/CRON_SECRET/);
  });
  it("no avisa cuando todas las recomendadas están presentes", () => {
    for (const n of PROD_RECOMMENDED) process.env[n] = "set";
    expect(missingProdEnv()).toEqual([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnMissingProdEnv();
    expect(warn).not.toHaveBeenCalled();
  });
});
