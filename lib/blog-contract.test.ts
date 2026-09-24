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
    expect(cta).toMatch(/href=\{href\}/);
    expect(cta).not.toMatch(/\?ref=|\?utm_/);
  });

  /**
   * NINGÚN client component puede importar el registro de guías.
   *
   * `GUIDES` se indexa de forma dinámica (`GUIDES[slug]`), así que ningún bundler puede
   * podar sus propiedades: basta un import desde un componente "use client" para que al
   * navegador viajen las claves del bucket de Supabase, los `templateKey` y cada asunto,
   * preheader y blurb de correo. Pasó con `GuiaCta` y con `LeadForm`; ambos ahora reciben
   * por props lo que pintan. lib/guides.ts dice en su primera línea que ahí vive solo lo
   * que necesita el SERVIDOR — esto lo mantiene cierto.
   *
   * Comprobado contra los artefactos del build: tras el arreglo, ni la clave del PDF ni
   * los templateKey ni los asuntos aparecen en .next/static.
   */
  it("ningún componente de cliente importa el registro de guías", () => {
    const clientes: string[] = [];
    const walk = (d: string) => {
      if (!existsSync(join(ROOT, d))) return;
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (rel.endsWith(".tsx") && read(rel).startsWith('"use client"')) clientes.push(rel);
      }
    };
    walk("components");
    walk("app");
    expect(clientes.length, "no se encontró ningún client component: el escaneo falló").toBeGreaterThan(5);

    const culpables = clientes.filter((f) => /from "@\/lib\/(guides|lead-magnets)"/.test(readCode(f)));
    expect(culpables, "arrastran GUIDES al bundle del cliente").toEqual([]);
  });

  it("todo href de artículo pasa por articleHref: el path nace en un archivo del disco", () => {
    // Antes esto miraba una lista de DOS archivos escrita a mano, así que no vio el href
    // nuevo del footer y lo tuvo que atajar CodeQL en CI. Ahora barre los archivos que
    // leen datos de artículos, que son los únicos donde un path viene del disco.
    //
    // El path de una GUÍA no entra: es un literal `/${string}` de lib/guides.ts, o sea
    // código del repo, no contenido. Por eso GUIDES[...] y guia.path están permitidos.
    const DE_GUIA = /GUIDES\[|\bguia\.path\b/;
    const sospechosos: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx$/.test(e.name) && !e.name.includes(".test.")) {
          const src = readCode(rel);
          if (!src.includes('@/lib/articles/')) continue;
          for (const [, expr] of src.matchAll(/href=\{([^}]*(?:\}[^}]*)??)\}/g)) {
            if (/\.(path|href)\b/.test(expr) && !expr.includes("articleHref(") && !DE_GUIA.test(expr)) {
              sospechosos.push(`${rel}: href={${expr.trim()}}`);
            }
          }
        }
      }
    };
    walk("components");
    walk("app");
    expect(sospechosos, "href de artículo sin articleHref()").toEqual([]);
  });

  it("el barrido de articleHref mira de verdad los archivos que debe", () => {
    // Un barrido que no encuentra nada pasa siempre. Esto fija que el escaneo llega a los
    // componentes de artículo y que ahí SÍ se está llamando a articleHref.
    for (const f of ["components/article/ArticleCard.tsx", "components/article/RelatedArticles.tsx", "components/Footer.tsx"]) {
      expect(readCode(f), `${f} dejó de envolver sus href`).toContain("articleHref(");
    }
  });

  it("el clic del CTA se mide por lib/analytics, no a mano", () => {
    const cta = readCode("components/article/GuiaCta.tsx");
    expect(cta).toContain("trackGuideCtaClick");
    expect(cta).not.toContain("dataLayer");
  });
});

/**
 * La regla que costó una regresión en producción: declarar `openGraph` corta la herencia
 * de la imagen del segmento ancestro. Una página que usa pageMetadata y NO tiene su propio
 * opengraph-image.tsx sale sin og:image — y nada falla, simplemente no hay tarjeta.
 */
describe("toda página con pageMetadata trae su propia tarjeta OG", () => {
  it("no hay ninguna sin opengraph-image.tsx al lado", () => {
    const pages: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (e.name === "page.tsx") pages.push(p);
      }
    };
    walk("app");

    const huerfanas = pages.filter((p) => {
      if (!readCode(p).includes("pageMetadata(")) return false;
      return !existsSync(join(ROOT, p.replace(/page\.tsx$/, "opengraph-image.tsx")));
    });
    expect(huerfanas, "usan pageMetadata pero heredarían una imagen que ya no llega").toEqual([]);
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
