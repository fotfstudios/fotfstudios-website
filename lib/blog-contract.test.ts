import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El grupo (articulos) y las rutas de /blog, fijados desde el archivo.
 *
 * vitest.config.ts NO recoge app/**, así que esta es la única forma de vigilar las rutas.
 * Las aserciones de token leen el código SIN comentarios: si no, explicar en un comentario
 * por qué NO se monta PublicChrome bastaría para ponerlas rojas.
 */
const ROOT = process.cwd();
const GRUPO = "app/(marketing)/(articulos)";
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("chrome del grupo (articulos)", () => {
  const layout = readCode(`${GRUPO}/layout.tsx`);

  it("monta su propio Nav y Footer: el layout de (marketing) es un fragmento pelado", () => {
    expect(layout).toMatch(/<Nav\s*\/>/);
    expect(layout).toMatch(/<Footer\s*\/>/);
    expect(layout).toMatch(/<main\b/);
  });

  it("no monta NADA de la chrome de dueño único", () => {
    // Las cinco aserciones de array exacto de chrome-contract se caerían si acá apareciera
    // cualquiera de estos: el grupo los hereda de (marketing)/layout.tsx.
    for (const prohibido of [
      "<CustomCursor",
      'className="scroll-meter"',
      "<PublicChrome",
      'id="gtm-init"',
      "<ConsentBanner",
      "<Analytics",
      'strategy="beforeInteractive"',
    ]) {
      expect(layout, `el layout no debe montar ${prohibido}`).not.toContain(prohibido);
    }
  });
});

describe("rutas de /blog", () => {
  it("el artículo se prerenderiza y un slug inexistente da 404 limpio", () => {
    const src = readCode(`${GRUPO}/blog/[slug]/page.tsx`);
    expect(src).toMatch(/export const dynamicParams = false/);
    expect(src).toMatch(/export function generateStaticParams/);
    expect(src).toMatch(/export async function generateMetadata/);
    // blogSlugs excluye los path override: si se generaran acá habría contenido duplicado.
    expect(src).toContain("blogSlugs(");
  });

  it("las categorías son rutas estáticas, no un query param", () => {
    const src = readCode(`${GRUPO}/blog/categoria/[categoria]/page.tsx`);
    expect(src).toMatch(/export const dynamicParams = false/);
    expect(src).toMatch(/export function generateStaticParams/);
    expect(src).toMatch(/export async function generateMetadata/);
  });

  it("las tres rutas existen donde el contrato de chrome las permite", () => {
    for (const p of [
      `${GRUPO}/blog/page.tsx`,
      `${GRUPO}/blog/[slug]/page.tsx`,
      `${GRUPO}/blog/categoria/[categoria]/page.tsx`,
    ]) {
      expect(existsSync(join(ROOT, p)), p).toBe(true);
    }
    // app/blog/ en la raíz rompería la aserción de "toda page decide su chrome".
    expect(existsSync(join(ROOT, "app/blog"))).toBe(false);
  });

  it("el índice y la categoría emiten JSON-LD, escapado", () => {
    // JSON.stringify crudo NO escapa "<": un valor con </script> cierra la etiqueta.
    // Con frontmatter leído del disco eso es una entrada de verdad, no una hipótesis.
    for (const p of [`${GRUPO}/blog/page.tsx`, `${GRUPO}/blog/categoria/[categoria]/page.tsx`]) {
      const src = readCode(p);
      expect(src).toContain("application/ld+json");
      expect(src).toContain("jsonLdHtml(");
      expect(src, `${p} serializa JSON-LD sin escapar`).not.toMatch(/__html:\s*JSON\.stringify/);
    }
  });
});

describe("el artículo cierra con su guía", () => {
  const view = readCode("components/article/ArticleView.tsx");

  it("ArticleView monta el CTA y el JSON-LD del artículo", () => {
    expect(view).toMatch(/<GuiaCta\b/);
    expect(view).toContain("application/ld+json");
    expect(view).toContain("articleJsonLd(");
    expect(view).toContain("jsonLdHtml(");
    expect(view).not.toMatch(/__html:\s*JSON\.stringify/);
  });

  it("el CTA enlaza sin query string: no fragmenta la canónica de la guía", () => {
    const cta = readCode("components/article/GuiaCta.tsx");
    expect(cta).toMatch(/href=\{m\.href\}/);
    expect(cta).not.toMatch(/\?ref=|\?utm_/);
  });

  it("todo href de artículo pasa por articleHref: el path nace en un archivo del disco", () => {
    for (const f of ["components/article/ArticleCard.tsx", "components/article/RelatedArticles.tsx"]) {
      const src = readCode(f);
      expect(src, `${f} usa el path crudo en un href`).not.toMatch(/href=\{\s*\w+\.path\s*\}/);
      expect(src).toContain("articleHref(");
    }
  });

  it("el clic del CTA se mide por lib/analytics, no a mano", () => {
    const cta = readCode("components/article/GuiaCta.tsx");
    expect(cta).toContain("trackGuideCtaClick");
    expect(cta).not.toContain("dataLayer");
  });
});

describe("marca", () => {
  it("Sirena no aparece en el grupo ni en los componentes de artículo", () => {
    // Sirena es solo urgencia. Un acento decorativo en un artículo la gasta.
    const files: string[] = [];
    const walk = (d: string) => {
      if (!existsSync(join(ROOT, d))) return;
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".tsx")) files.push(p);
      }
    };
    walk(GRUPO);
    walk("components/article");
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(readCode(f), `${f} usa sirena`).not.toMatch(/sirena/i);
  });
});
