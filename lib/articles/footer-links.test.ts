import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOOTER_ARTICLE_CAP, PENDING_ARTICLES, footerArticleLinks } from "./footer-links";
import { getArticles } from "./registry";
import type { ArticleMeta } from "./schema";

const ROOT = process.cwd();

const art = (over: Partial<ArticleMeta> & { slug: string }): ArticleMeta => ({
  title: `Título de ${over.slug}`,
  description: "d".repeat(60),
  excerpt: "e",
  category: "aprender",
  tags: [],
  publishedAt: "2026-01-01",
  updatedAt: "2026-01-01",
  guide: "guia-dj",
  related: [],
  draft: false,
  featured: false,
  path: `/blog/${over.slug}`,
  legacyPath: false,
  ...over,
});

const sinPendientes: never[] = [];

describe("footerArticleLinks", () => {
  it("los pendientes de migrar van primero y siempre", () => {
    // Son las rankeadas que todavía no están en el registro: derivar solo del registro las
    // borraría del footer, o sea de TODAS las páginas del sitio.
    const links = footerArticleLinks([art({ slug: "nuevo" })]);
    expect(links.slice(0, PENDING_ARTICLES.length).map((l) => l.href)).toEqual(
      PENDING_ARTICLES.map((p) => p.path),
    );
  });

  it("ordena por fecha descendente y desempata por slug", () => {
    const links = footerArticleLinks(
      [
        art({ slug: "viejo", publishedAt: "2026-01-01" }),
        art({ slug: "b", publishedAt: "2026-05-01" }),
        art({ slug: "a", publishedAt: "2026-05-01" }),
      ],
      sinPendientes,
    );
    expect(links.map((l) => l.href)).toEqual(["/blog/a", "/blog/b", "/blog/viejo"]);
  });

  it("un artículo fijado no se cae del footer por más nuevos que se publiquen", () => {
    // Es el motivo entero del campo `featured`: una página que rankea no puede perder su
    // enlace interno sitewide solo porque el mes siguiente se publicaron cuatro artículos.
    const rankeada = art({ slug: "rankeada", publishedAt: "2024-01-01", featured: true });
    const nuevos = Array.from({ length: 20 }, (_, i) =>
      art({ slug: `nuevo-${i}`, publishedAt: `2026-06-${String(i + 1).padStart(2, "0")}` }),
    );
    const links = footerArticleLinks([rankeada, ...nuevos], sinPendientes);
    expect(links[0].href, "la fijada va primero").toBe("/blog/rankeada");
    expect(links).toHaveLength(FOOTER_ARTICLE_CAP);
  });

  it("respeta el tope con los que NO están fijados", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => art({ slug: `a-${i}` }));
    expect(footerArticleLinks(muchos, sinPendientes)).toHaveLength(FOOTER_ARTICLE_CAP);
  });

  it("nunca esconde un fijado, aunque los fijados solos pasen el tope", () => {
    // Esconderlo sería reintroducir el bug que este módulo viene a arreglar, solo que en
    // silencio y con el tope como excusa.
    const fijados = Array.from({ length: 9 }, (_, i) => art({ slug: `f-${i}`, featured: true }));
    const links = footerArticleLinks([...fijados, art({ slug: "suelto" })], sinPendientes);
    expect(links).toHaveLength(9);
    expect(links.some((l) => l.href === "/blog/suelto"), "el suelto no entra").toBe(false);
  });

  it("usa la ruta real del artículo, no /blog/<slug> a la fuerza", () => {
    // Las migradas conservan su URL de raíz; enlazar /blog/aprender-dj sería un 404.
    const links = footerArticleLinks(
      [art({ slug: "aprender-dj", path: "/aprender-dj", legacyPath: true })],
      sinPendientes,
    );
    expect(links[0].href).toBe("/aprender-dj");
  });

  it("no inventa enlaces cuando no hay nada que mostrar", () => {
    expect(footerArticleLinks([], sinPendientes)).toEqual([]);
  });
});

describe("PENDING_ARTICLES", () => {
  it("ninguna ruta pendiente está ADEMÁS en el registro", () => {
    // La trampa de la migración: si una PR agrega el .mdx y olvida borrar su línea de acá,
    // el footer enlaza el artículo dos veces y React reclama por la key duplicada.
    const rutas = new Set(getArticles().map((a) => a.path));
    for (const p of PENDING_ARTICLES) {
      expect(rutas.has(p.path), `${p.path} ya está en content/articles: borra su línea`).toBe(false);
    }
  });

  it("cada ruta pendiente tiene su carpeta de ruta en disco", () => {
    // Una entrada mal escrita sería un enlace a 404 en todas las páginas del sitio.
    for (const p of PENDING_ARTICLES) {
      const page = join(ROOT, "app/(marketing)/(articulos)", p.path.slice(1), "page.tsx");
      expect(() => readFileSync(page), `${p.path} no existe como ruta`).not.toThrow();
    }
  });
});

describe("components/Footer.tsx", () => {
  const src = readFileSync(join(ROOT, "components/Footer.tsx"), "utf8");

  it("no escribe a mano ningún enlace de artículo ni de guía", () => {
    // Es el bug original: la lista escrita a mano se quedó sin el artículo más nuevo.
    for (const ruta of ["/aprender-dj", "/guia-dj", "/guia-pendrive-dj", "/xdj-vs-controlador"]) {
      expect(src, `${ruta} escrito a mano en el footer`).not.toContain(`href="${ruta}"`);
    }
  });

  it("sigue siendo componente de servidor", () => {
    // Con "use client" el registro de guías se iría al bundle del navegador, que es
    // exactamente lo que se sacó en #214.
    expect(src.trimStart().startsWith('"use client"')).toBe(false);
  });

  it("conserva el enlace al índice", () => {
    expect(src).toContain('href="/blog"');
  });
});
