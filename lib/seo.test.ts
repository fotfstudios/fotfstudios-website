import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site";
import { canonicalUrl, pageMetadata } from "./seo";

describe("pageMetadata", () => {
  /**
   * El bloque que /guia-dj escribe a mano hoy. Si esta prueba pasa, migrar esa página
   * al helper es un no-op de markup — que es la condición para tocarla.
   */
  it("reproduce exactamente el bloque a mano de una landing", () => {
    expect(
      pageMetadata({
        title: "Guía de iniciación al DJing",
        description: "Ocho páginas en PDF, gratis.",
        path: "/guia-dj",
      }),
    ).toEqual({
      title: "Guía de iniciación al DJing",
      description: "Ocho páginas en PDF, gratis.",
      alternates: { canonical: "/guia-dj" },
      openGraph: {
        title: "Guía de iniciación al DJing · FOTF Studios",
        description: "Ocho páginas en PDF, gratis.",
        url: "/guia-dj",
        siteName: "FOTF Studios",
        locale: "es_CL",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "Guía de iniciación al DJing · FOTF Studios",
        description: "Ocho páginas en PDF, gratis.",
      },
    });
  });

  /**
   * LA prueba que protege todas las tarjetas del sitio: setear openGraph.images anula
   * la convención de archivo opengraph-image.tsx. Este helper no debe hacerlo jamás.
   */
  it("nunca setea openGraph.images: eso anularía opengraph-image.tsx", () => {
    for (const m of [
      pageMetadata({ title: "A", description: "d", path: "/a" }),
      pageMetadata({ title: "B", description: "d", path: "/b", type: "article" }),
      pageMetadata({ description: "d", path: "/c", noIndex: true }),
    ]) {
      expect(m.openGraph).not.toHaveProperty("images");
      expect(m.twitter).not.toHaveProperty("images");
    }
  });

  it("la canónica es relativa: metadataBase la resuelve contra producción", () => {
    const m = pageMetadata({ title: "A", description: "d", path: "/blog/x" });
    expect(m.alternates?.canonical).toBe("/blog/x");
    expect(String(m.alternates?.canonical)).not.toContain("https://");
  });

  it("el sufijo de marca va solo en og y twitter, nunca en title (lo pone el template)", () => {
    const m = pageMetadata({ title: "Cómo elegir audífonos", description: "d", path: "/blog/x" });
    expect(m.title).toBe("Cómo elegir audífonos");
    expect(m.openGraph).toMatchObject({ title: "Cómo elegir audífonos · FOTF Studios" });
    expect(m.twitter).toMatchObject({ title: "Cómo elegir audífonos · FOTF Studios" });
  });

  it("sin title no inventa uno: el home es el único caso y hereda title.default", () => {
    const m = pageMetadata({ description: "d", path: "/" });
    expect(m).not.toHaveProperty("title");
    expect(m.openGraph).not.toHaveProperty("title");
    expect(m.twitter).not.toHaveProperty("title");
  });

  it("type article arrastra fechas, sección y tags; website no los emite", () => {
    const art = pageMetadata({
      title: "A",
      description: "d",
      path: "/blog/x",
      type: "article",
      publishedTime: "2026-09-23",
      modifiedTime: "2026-10-02",
      section: "Equipo",
      tags: ["audífonos", "presupuesto"],
    });
    expect(art.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-09-23",
      modifiedTime: "2026-10-02",
      section: "Equipo",
      tags: ["audífonos", "presupuesto"],
    });

    const web = pageMetadata({
      title: "A",
      description: "d",
      path: "/a",
      publishedTime: "2026-09-23",
      section: "Equipo",
    });
    expect(web.openGraph).toMatchObject({ type: "website" });
    expect(web.openGraph).not.toHaveProperty("publishedTime");
    expect(web.openGraph).not.toHaveProperty("section");
  });

  it("tags vacío no crea la clave", () => {
    const m = pageMetadata({ title: "A", description: "d", path: "/a", type: "article", tags: [] });
    expect(m.openGraph).not.toHaveProperty("tags");
  });

  it("noIndex apaga index y follow; sin él no emite robots", () => {
    expect(pageMetadata({ title: "A", description: "d", path: "/a", noIndex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
    expect(pageMetadata({ title: "A", description: "d", path: "/a" })).not.toHaveProperty("robots");
  });

  it("locale es_CL en toda página: el sitio es una sola lengua", () => {
    expect(pageMetadata({ title: "A", description: "d", path: "/a" }).openGraph).toMatchObject({
      locale: "es_CL",
    });
  });
});

describe("canonicalUrl", () => {
  it("absolutiza contra SITE_URL, que siempre apunta a producción", () => {
    expect(canonicalUrl("/blog/x")).toBe(`${SITE_URL}/blog/x`);
    expect(canonicalUrl("/")).toBe(`${SITE_URL}/`);
  });
});
