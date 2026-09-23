import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site";
import { ARTICLE_PRIORITY, CATEGORY_PRIORITY, buildSitemap } from "./sitemap";
import type { ArticleMeta } from "@/lib/articles/schema";

const NOW = new Date("2026-09-23T12:00:00Z");

const art = (over: Partial<ArticleMeta>): ArticleMeta => ({
  slug: "a",
  title: "Título",
  description: "d".repeat(60),
  excerpt: "e",
  category: "aprender",
  tags: [],
  publishedAt: "2026-09-01",
  updatedAt: "2026-09-01",
  guide: "guia-dj",
  related: [],
  draft: false,
  path: "/blog/a",
  legacyPath: false,
  ...over,
});

const byUrl = (m: ReturnType<typeof buildSitemap>, url: string) => m.find((e) => e.url === url);

describe("buildSitemap", () => {
  /**
   * La continuidad es lo que importa: el sitemap anterior tenía diez entradas con
   * prioridades afinadas a mano. Ninguna puede cambiar de valor ni desaparecer.
   */
  it("conserva las diez URLs originales con su prioridad exacta", () => {
    const m = buildSitemap([], NOW);
    const originales: [string, number][] = [
      ["", 1],
      ["/curso-dj", 0.8],
      ["/guia-dj", 0.7],
      ["/grabacion", 0.8],
      ["/aprender-dj", 0.6],
      ["/cuanto-cuesta-un-curso-de-dj", 0.6],
      ["/xdj-vs-controlador", 0.6],
      ["/unete", 0.5],
      ["/privacidad", 0.3],
      ["/terminos", 0.3],
    ];
    for (const [path, priority] of originales) {
      const e = byUrl(m, `${SITE_URL}${path}`);
      expect(e, `falta ${path || "/"}`).toBeDefined();
      expect(e?.priority, `prioridad de ${path || "/"}`).toBe(priority);
    }
  });

  it("la raíz no lleva barra final", () => {
    expect(byUrl(buildSitemap([], NOW), SITE_URL)).toBeDefined();
    expect(byUrl(buildSitemap([], NOW), `${SITE_URL}/`)).toBeUndefined();
  });

  it("/blog entra nueva, semanal", () => {
    const e = byUrl(buildSitemap([], NOW), `${SITE_URL}/blog`);
    expect(e).toMatchObject({ priority: 0.7, changeFrequency: "weekly" });
  });

  it("un artículo trae su fecha REAL, no la del build", () => {
    const m = buildSitemap([art({ slug: "x", path: "/blog/x", updatedAt: "2026-10-02" })], NOW);
    const e = byUrl(m, `${SITE_URL}/blog/x`);
    expect(e?.priority).toBe(ARTICLE_PRIORITY);
    expect((e?.lastModified as Date).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    // Las páginas fijas sí usan la fecha del build, como antes.
    expect((byUrl(m, SITE_URL)?.lastModified as Date).toISOString()).toBe(NOW.toISOString());
  });

  it("un artículo con path override NO se duplica: sale en su URL de raíz y nada más", () => {
    // Es el caso de las tres guías rankeadas cuando se migren a MDX en la fase 3.
    const m = buildSitemap([art({ slug: "aprender-dj", path: "/aprender-dj", legacyPath: true })], NOW);
    expect(byUrl(m, `${SITE_URL}/blog/aprender-dj`)).toBeUndefined();
    expect(byUrl(m, `${SITE_URL}/aprender-dj`)?.priority).toBe(0.6);
    expect(m.filter((e) => e.url === `${SITE_URL}/aprender-dj`)).toHaveLength(1);
  });

  it("migrar una guía a MDX no le cambia la prioridad", () => {
    // ARTICLE_PRIORITY vale lo mismo que la fila fija: la migración es invisible para Google.
    expect(ARTICLE_PRIORITY).toBe(0.6);
  });

  it("solo entran las categorías que tienen artículos", () => {
    const m = buildSitemap([art({ category: "aprender" })], NOW);
    expect(byUrl(m, `${SITE_URL}/blog/categoria/aprender`)?.priority).toBe(CATEGORY_PRIORITY);
    // Una categoría vacía en el sitemap es pedirle a Google que indexe contenido delgado.
    for (const c of ["equipo", "precios", "estudio"]) {
      expect(byUrl(m, `${SITE_URL}/blog/categoria/${c}`), c).toBeUndefined();
    }
  });

  it("no repite ninguna URL", () => {
    const m = buildSitemap(
      [art({ slug: "x", path: "/blog/x" }), art({ slug: "y", path: "/blog/y", category: "equipo" })],
      NOW,
    );
    expect(new Set(m.map((e) => e.url)).size).toBe(m.length);
  });

  it("toda URL es absoluta y cuelga de SITE_URL", () => {
    const m = buildSitemap([art({ slug: "x", path: "/blog/x" })], NOW);
    for (const e of m) expect(e.url.startsWith(`${SITE_URL}`), e.url).toBe(true);
  });

  it("no lista las rutas que no se indexan", () => {
    const m = buildSitemap([], NOW);
    for (const p of ["/curso-dj/pago", "/guia-dj/descarga", "/reservar", "/cuenta", "/admin"]) {
      expect(m.some((e) => e.url.includes(p)), p).toBe(false);
    }
  });
});
