import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSiteUrl } from "./urls";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveSiteUrl", () => {
  it("prefiere NEXT_PUBLIC_SITE_URL cuando está seteada (local con túnel / prod)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "ignored.vercel.app");
    expect(resolveSiteUrl()).toBe("http://localhost:3000");
  });

  it("en preview sin NEXT_PUBLIC_SITE_URL usa la URL del deployment", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "fotfstudios-website-abc123.vercel.app");
    expect(resolveSiteUrl()).toBe("https://fotfstudios-website-abc123.vercel.app");
  });

  it("fuera de preview y sin NEXT_PUBLIC_SITE_URL cae al dominio canónico", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "fotfstudios-website.vercel.app");
    expect(resolveSiteUrl()).toBe("https://www.fotfstudios.cl");
  });

  it("preview sin VERCEL_URL cae al dominio canónico (no rompe)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "");
    expect(resolveSiteUrl()).toBe("https://www.fotfstudios.cl");
  });
});
