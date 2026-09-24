import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARTICLE_MODULES } from "@/content/articles/modules";
import {
  ArticleFrontmatterError,
  articleBySlug,
  articlesByCategory,
  blogSlugs,
  categoryCounts,
  draftsVisible,
  getArticles,
  publishedArticles,
  relatedArticles,
} from "./registry";
import { STATIC_ROUTES } from "@/lib/sitemap";
import type { ArticleMeta } from "./schema";

const base: ArticleMeta = {
  slug: "a",
  title: "Título de prueba",
  description: "d".repeat(60),
  excerpt: "e",
  category: "equipo",
  tags: [],
  publishedAt: "2026-09-01",
  updatedAt: "2026-09-01",
  guide: "guia-dj",
  related: [],
  draft: false,
  path: "/blog/a",
  legacyPath: false,
};
const art = (over: Partial<ArticleMeta>): ArticleMeta => ({ ...base, ...over });

describe("selectores (puros)", () => {
  const all = [
    art({ slug: "a", publishedAt: "2026-09-01" }),
    art({ slug: "c", publishedAt: "2026-09-10", category: "aprender" }),
    art({ slug: "b", publishedAt: "2026-09-10" }),
    art({ slug: "d", draft: true, publishedAt: "2026-09-20" }),
    art({ slug: "viejo", path: "/aprender-dj", legacyPath: true, publishedAt: "2026-08-17" }),
  ];

  it("ordena por fecha desc y rompe los empates por slug: el build es determinista", () => {
    expect(publishedArticles(all, false).map((a) => a.slug)).toEqual(["b", "c", "a", "viejo"]);
  });

  it("los borradores solo aparecen si se piden", () => {
    expect(publishedArticles(all, false).some((a) => a.slug === "d")).toBe(false);
    expect(publishedArticles(all, true).some((a) => a.slug === "d")).toBe(true);
  });

  it("blogSlugs excluye los path override: /blog/viejo nunca se genera", () => {
    expect(blogSlugs(all)).toEqual(["a", "c", "b", "d"]);
    expect(blogSlugs(all)).not.toContain("viejo");
  });

  it("articleBySlug y articlesByCategory filtran lo esperado", () => {
    expect(articleBySlug(all, "c")?.category).toBe("aprender");
    expect(articleBySlug(all, "nope")).toBeUndefined();
    expect(articlesByCategory(all, "aprender").map((a) => a.slug)).toEqual(["c"]);
  });

  it("categoryCounts devuelve las cuatro categorías, incluidas las vacías", () => {
    const counts = categoryCounts(all);
    expect(counts.map((c) => c.category)).toEqual(["aprender", "equipo", "precios", "estudio"]);
    expect(counts.find((c) => c.category === "equipo")?.count).toBe(4);
    expect(counts.find((c) => c.category === "precios")?.count).toBe(0);
  });

  it("relacionados: primero los declarados, después la misma categoría, nunca él mismo ni borradores", () => {
    const a = art({ slug: "a", related: ["c"] });
    const r = relatedArticles([a, ...all.filter((x) => x.slug !== "a")], a, 2);
    expect(r[0].slug).toBe("c");
    expect(r.map((x) => x.slug)).not.toContain("a");
    expect(r.map((x) => x.slug)).not.toContain("d");
  });

  it("los borradores se ven fuera de producción, para revisarlos en un preview", () => {
    expect(draftsVisible({ VERCEL_ENV: "production" })).toBe(false);
    expect(draftsVisible({ VERCEL_ENV: "preview" })).toBe(true);
    expect(draftsVisible({})).toBe(true);
  });
});

describe("informe de errores", () => {
  it("nombra archivo, campo, código y pista, para poder arreglarlo sin abrir el parser", () => {
    const e = new ArticleFrontmatterError([
      { file: "x.mdx", issues: [{ field: "guide", code: "unknown_guide", hint: '"guia-djing" no existe' }] },
      { file: "y.mdx", issues: [{ field: "publishedAt", code: "bad_date" }] },
    ]);
    expect(e.message).toContain("2 artículos con frontmatter inválido");
    expect(e.message).toContain("content/articles/x.mdx");
    expect(e.message).toContain("· guide: unknown_guide — \"guia-djing\" no existe");
    expect(e.message).toContain("· publishedAt: bad_date");
    expect(e.message).toContain("lib/articles/schema.ts");
  });

  it("concuerda el singular", () => {
    expect(new ArticleFrontmatterError([{ file: "x.mdx", issues: [] }]).message).toContain("1 artículo con");
  });
});

/** La compuerta real: corre contra content/articles/ de verdad, no contra fixtures. */
describe("contenido en disco", () => {
  const DIR = join(process.cwd(), "content", "articles");
  const mdx = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".mdx")) : [];

  it("todos los .mdx parsean: getArticles() no lanza", () => {
    // Esto adelanta la validación del build a `npm test`, que corre antes y es ~200× más rápido.
    expect(() => getArticles()).not.toThrow();
  });

  it("las claves de ARTICLE_MODULES son EXACTAMENTE los .mdx en disco", () => {
    // El guardia del import olvidado: sin esto, un artículo nuevo compila y revienta al
    // renderizar con un "Cannot find module".
    expect(Object.keys(ARTICLE_MODULES).sort()).toEqual(mdx.map((f) => f.replace(/\.mdx$/, "")).sort());
  });

  it("no hay slugs repetidos ni rutas canónicas repetidas", () => {
    const all = getArticles();
    expect(new Set(all.map((a) => a.slug)).size).toBe(all.length);
    expect(new Set(all.map((a) => a.path)).size).toBe(all.length);
  });

  /**
   * Un `path` override se valida por FORMA (kebab-case absoluto) pero nada comprobaba que
   * apuntara a una ruta REAL. Dos agujeros simétricos:
   *
   *  - `path: "/no-existe"` → tarjeta en /blog hacia un 404, y una entrada en el sitemap
   *    invitando a Google a rastrearlo.
   *  - `path: "/curso-dj"` → pasa la validación, pinta una tarjeta que enlaza a la landing
   *    del curso, y articleHref lo deja pasar porque la forma es válida.
   *
   * La migración de los artículos rankeados descansa entera en este mecanismo, así que
   * acá se cierra.
   */
  it("todo path override apunta a una carpeta de ruta que existe", () => {
    const GRUPO = join(process.cwd(), "app", "(marketing)", "(articulos)");
    for (const a of getArticles().filter((x) => x.legacyPath)) {
      const page = join(GRUPO, a.path.replace(/^\//, ""), "page.tsx");
      expect(existsSync(page), `${a.slug}: falta ${a.path}/page.tsx`).toBe(true);
    }
  });

  /**
   * La ruta de un artículo NUNCA debe estar además en STATIC_ROUTES.
   *
   * Antes de migrar, las tres rankeadas viven ahí como filas fijas. Al convertirlas a MDX
   * pasan a derivarse del registro, y la fila tiene que salir en el MISMO commit: si no,
   * la misma URL queda declarada dos veces con dos fechas distintas (la fija usa la del
   * build; el artículo, su updatedAt real). buildSitemap deduplica y la fija gana, así que
   * el artículo se publica con la fecha equivocada y nada falla.
   *
   * También caza lo simétrico: un artículo que se apropie de una ruta que no le toca
   * (`path: "/curso-dj"`).
   */
  it("la ruta de un artículo no está además en STATIC_ROUTES", () => {
    const fijas = new Set(STATIC_ROUTES.map((r) => r.path));
    for (const a of getArticles()) {
      expect(fijas.has(a.path), `${a.slug} (${a.path}) está fija y derivada a la vez`).toBe(false);
    }
  });

  it("cada slug de `related` existe", () => {
    const all = getArticles();
    const slugs = new Set(all.map((a) => a.slug));
    for (const a of all) {
      for (const r of a.related) expect(slugs.has(r), `${a.slug} → related: ${r}`).toBe(true);
    }
  });
});
