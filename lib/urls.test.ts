import { afterEach, describe, expect, it, vi } from "vitest";
import { hostFromHeaders, isAllowedBackUrlHost, resolveSiteUrl } from "./urls";

afterEach(() => {
  vi.unstubAllEnvs();
});

const PREVIEW = "fotfstudios-website-j8zg182gy-fotf-studios.vercel.app";

describe("resolveSiteUrl", () => {
  it("en producción fija el dominio canónico aunque la request llegue por un alias vercel.app", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(resolveSiteUrl(PREVIEW)).toBe("https://www.fotfstudios.cl");
  });

  it("el host de la request (preview) gana sobre NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.fotfstudios.cl");
    expect(resolveSiteUrl(PREVIEW)).toBe(`https://${PREVIEW}`);
  });

  it("un host de prod permitido resuelve a sí mismo", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(resolveSiteUrl("www.fotfstudios.cl")).toBe("https://www.fotfstudios.cl");
  });

  it("un host NO permitido (túnel) cae a NEXT_PUBLIC_SITE_URL (escape hatch)", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mi-tunel.ngrok.io");
    expect(resolveSiteUrl("abc123.ngrok.io")).toBe("https://mi-tunel.ngrok.io");
  });

  it("sin host usa NEXT_PUBLIC_SITE_URL si está seteada (local con túnel)", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(resolveSiteUrl()).toBe("http://localhost:3000");
    expect(resolveSiteUrl(null)).toBe("http://localhost:3000");
  });

  it("sin host y sin NEXT_PUBLIC_SITE_URL cae al dominio canónico", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(resolveSiteUrl()).toBe("https://www.fotfstudios.cl");
  });
});

describe("isAllowedBackUrlHost", () => {
  it("acepta el dominio de prod (www y apex)", () => {
    expect(isAllowedBackUrlHost("www.fotfstudios.cl")).toBe(true);
    expect(isAllowedBackUrlHost("fotfstudios.cl")).toBe(true);
  });

  it("acepta previews del proyecto (forma commit y forma branch)", () => {
    expect(isAllowedBackUrlHost("fotfstudios-website-j8zg182gy-fotf-studios.vercel.app")).toBe(true);
    expect(isAllowedBackUrlHost("fotfstudios-website-git-feat-x-fotf-studios.vercel.app")).toBe(true);
  });

  it("es case-insensitive", () => {
    expect(isAllowedBackUrlHost("WWW.FOTFSTUDIOS.CL")).toBe(true);
  });

  it("rechaza vercel.app ajenos y dominios arbitrarios", () => {
    expect(isAllowedBackUrlHost("evil.vercel.app")).toBe(false); // proyecto distinto
    expect(isAllowedBackUrlHost("otro-proyecto-x-fotf-studios.vercel.app")).toBe(false); // no es nuestro proyecto
    expect(isAllowedBackUrlHost("fotfstudios-website-x-otro-team.vercel.app")).toBe(false); // team distinto
    expect(isAllowedBackUrlHost("evil.com")).toBe(false);
  });

  it("rechaza null/undefined/vacío", () => {
    expect(isAllowedBackUrlHost(null)).toBe(false);
    expect(isAllowedBackUrlHost(undefined)).toBe(false);
    expect(isAllowedBackUrlHost("")).toBe(false);
  });
});

describe("hostFromHeaders", () => {
  const fake = (map: Record<string, string>) => ({ get: (k: string) => map[k] ?? null });

  it("prefiere x-forwarded-host sobre host", () => {
    expect(hostFromHeaders(fake({ "x-forwarded-host": "a.vercel.app", host: "b.internal" }))).toBe(
      "a.vercel.app",
    );
  });

  it("cae a host si no hay x-forwarded-host", () => {
    expect(hostFromHeaders(fake({ host: "b.internal" }))).toBe("b.internal");
  });

  it("null si no hay ninguno", () => {
    expect(hostFromHeaders(fake({}))).toBe(null);
  });
});
