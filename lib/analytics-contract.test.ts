import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contrato de medición: un solo punto habla con GTM/GA4 y con Vercel Analytics.
 * - `dataLayer.push` / `gtag(` solo en lib/analytics.ts (eventos), lib/consent.ts y
 *   components/ConsentBanner.tsx (Consent Mode) y components/PublicChrome.tsx (loader de GTM).
 *   Nunca gtag.js propio: GA4 entra por el contenedor GTM.
 * - El checkout y la confirmación miden solo vía @/lib/analytics (nada de `track` directo).
 */
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const codeUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(tsx?)$/.test(f) && !/\.(test|itest)\.tsx?$/.test(f))
    .map((f) => join(dir, f));

const ALLOWED = ["lib/analytics.ts", "lib/consent.ts", "components/ConsentBanner.tsx", "components/PublicChrome.tsx"];

describe("contrato de medición", () => {
  it("solo los puntos permitidos empujan a dataLayer o llaman a gtag", () => {
    const offenders = [...codeUnder("app"), ...codeUnder("components"), ...codeUnder("lib"), ...codeUnder("src")]
      .filter((f) => !ALLOWED.includes(f))
      .filter((f) => /dataLayer\??\.push|gtag\(/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("el checkout y la confirmación no importan @vercel/analytics directo", () => {
    const booking = codeUnder("components/booking").filter((f) => /@vercel\/analytics/.test(read(f)));
    expect(booking).toEqual([]);
  });

  it("las vías de pago del checkout mandan begin_checkout y la confirmación manda purchase", () => {
    expect(read("components/booking/BookingWidget.tsx")).toMatch(/trackBeginCheckout\(/);
    expect(read("components/booking/EstadoClient.tsx")).toMatch(/trackPurchase\(/);
  });
});
