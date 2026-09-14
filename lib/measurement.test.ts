import { afterEach, describe, expect, it, vi } from "vitest";
import { measurementEnabled } from "./measurement";

afterEach(() => vi.unstubAllEnvs());

describe("measurementEnabled", () => {
  it("producción en Vercel → mide", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(measurementEnabled()).toBe(true);
  });
  it("preview y local → no mide (no es tráfico real)", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(measurementEnabled()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "");
    expect(measurementEnabled()).toBe(false);
  });
  it("NEXT_PUBLIC_GTM_FORCE=true fuerza la medición fuera de prod (verificar un tag en local)", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_GTM_FORCE", "true");
    expect(measurementEnabled()).toBe(true);
  });
});
