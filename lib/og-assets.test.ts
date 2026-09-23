import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Los recortes de public/og/ y su uso.
 *
 * Cada tarjeta OG inlinea su JPEG en base64 para que satori lo decodifique. Con las fotos
 * originales de public/photos/ (3–10 MB cada una) eso es ~5,6 MB de string JS por tarjeta,
 * y el sitio ya tiene ocho. Los recortes pesan ~20–50 KB y se ven idénticos a tamaño de
 * tarjeta —comparado a ojo y al 1:1 antes de cambiarlos—.
 */
const ROOT = process.cwd();
const OG_DIR = join(ROOT, "public", "og");

const ogRoutes = (() => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name === "opengraph-image.tsx") out.push(p);
    }
  };
  walk("app");
  return out;
})();

describe("recortes de public/og", () => {
  it("hay tarjetas OG que verificar", () => {
    expect(ogRoutes.length).toBeGreaterThanOrEqual(6);
  });

  it("ninguna tarjeta usa una foto cruda de public/photos", () => {
    // Un `photo: "photos/…"` vuelve a meter megabytes en el build sin que nada falle.
    for (const p of ogRoutes) {
      expect(readFileSync(join(ROOT, p), "utf8"), `${p} usa una foto sin recortar`).not.toMatch(
        /photo:\s*"photos\//,
      );
    }
  });

  it("cada recorte mide exactamente 1200×630 y pesa poco", () => {
    const jpgs = readdirSync(OG_DIR).filter((f) => f.endsWith(".jpg"));
    expect(jpgs.length).toBeGreaterThanOrEqual(5);
    for (const f of jpgs) {
      const buf = readFileSync(join(OG_DIR, f));
      // Cabecera SOF0/SOF2 del JPEG: alto y ancho en big-endian.
      let i = 2;
      let w = 0;
      let h = 0;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          h = buf.readUInt16BE(i + 5);
          w = buf.readUInt16BE(i + 7);
          break;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
      expect([w, h], `${f} no está recortado a la medida de la tarjeta`).toEqual([1200, 630]);
      expect(statSync(join(OG_DIR, f)).size, `${f} pesa de más`).toBeLessThan(120 * 1024);
    }
  });

  it("todo recorte referenciado existe en disco", () => {
    const refs = new Set<string>();
    for (const p of ogRoutes) {
      for (const m of readFileSync(join(ROOT, p), "utf8").matchAll(/"(og\/[a-z0-9-]+\.jpg)"/g)) {
        refs.add(m[1]);
      }
    }
    for (const m of readFileSync(join(ROOT, "lib/articles/og-photo.ts"), "utf8").matchAll(
      /"(og\/[a-z0-9-]+\.jpg)"/g,
    )) {
      refs.add(m[1]);
    }
    expect(refs.size).toBeGreaterThanOrEqual(5);
    for (const r of refs) {
      expect(existsSync(join(ROOT, "public", r)), `falta public/${r}`).toBe(true);
    }
  });
});
