import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site";
import { articleJsonLd } from "./jsonld";

const BASE = {
  path: "/aprender-dj",
  headline: "Cómo aprender a ser DJ",
  description: "Qué es mezclar, cuánto demora y con qué equipo empezar.",
  datePublished: "2026-08-17",
} as const;

describe("articleJsonLd", () => {
  /**
   * El contrato que hace que mover guideJsonLd() a lib/ sea un refactor PURO: una
   * llamada sin campos opcionales tiene que producir exactamente el JSON que las tres
   * guías rankeadas ya emiten. Si esta prueba se cae, el markup cambió.
   */
  it("sin campos opcionales emite el mismo JSON que emitía guideJsonLd", () => {
    expect(articleJsonLd(BASE)).toEqual([
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Cómo aprender a ser DJ",
        description: "Qué es mezclar, cuánto demora y con qué equipo empezar.",
        inLanguage: "es-CL",
        datePublished: "2026-08-17",
        mainEntityOfPage: `${SITE_URL}/aprender-dj`,
        author: { "@type": "Organization", name: "FOTF Studios", url: SITE_URL },
        publisher: {
          "@type": "LocalBusiness",
          "@id": `${SITE_URL}/#negocio`,
          name: "FOTF Studios",
          url: SITE_URL,
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: "Cómo aprender a ser DJ",
            item: `${SITE_URL}/aprender-dj`,
          },
        ],
      },
    ]);
  });

  it("el orden de las claves tampoco cambia: se compara el string serializado", () => {
    const [article] = articleJsonLd(BASE);
    expect(JSON.stringify(article)).toBe(
      '{"@context":"https://schema.org","@type":"Article",' +
        '"headline":"Cómo aprender a ser DJ",' +
        '"description":"Qué es mezclar, cuánto demora y con qué equipo empezar.",' +
        '"inLanguage":"es-CL","datePublished":"2026-08-17",' +
        `"mainEntityOfPage":"${SITE_URL}/aprender-dj",` +
        `"author":{"@type":"Organization","name":"FOTF Studios","url":"${SITE_URL}"},` +
        `"publisher":{"@type":"LocalBusiness","@id":"${SITE_URL}/#negocio",` +
        `"name":"FOTF Studios","url":"${SITE_URL}"}}`,
    );
  });

  it("acepta una ruta anidada: el @id del publisher no depende de dónde viva el artículo", () => {
    const [article] = articleJsonLd({ ...BASE, path: "/blog/como-elegir-audifonos" });
    expect(article.mainEntityOfPage).toBe(`${SITE_URL}/blog/como-elegir-audifonos`);
    expect(article.publisher["@id"]).toBe(`${SITE_URL}/#negocio`);
  });

  it("dateModified se omite cuando es igual a datePublished: repetirla no aporta nada", () => {
    const [igual] = articleJsonLd({ ...BASE, dateModified: "2026-08-17" });
    expect(igual).not.toHaveProperty("dateModified");

    const [distinta] = articleJsonLd({ ...BASE, dateModified: "2026-10-02" });
    expect(distinta).toHaveProperty("dateModified", "2026-10-02");
  });

  it("section y keywords entran solo si vienen, y keywords vacío no crea la clave", () => {
    const [sin] = articleJsonLd({ ...BASE, keywords: [] });
    expect(sin).not.toHaveProperty("keywords");
    expect(sin).not.toHaveProperty("articleSection");

    const [con] = articleJsonLd({ ...BASE, section: "Equipo", keywords: ["audífonos"] });
    expect(con).toMatchObject({ articleSection: "Equipo", keywords: ["audífonos"] });
  });

  it("un nivel intermedio renumera el breadcrumb: Inicio → Blog → artículo", () => {
    const [, crumbs] = articleJsonLd({
      ...BASE,
      path: "/blog/como-elegir-audifonos",
      breadcrumb: [{ name: "Blog", path: "/blog" }],
    });
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      {
        "@type": "ListItem",
        position: 3,
        name: "Cómo aprender a ser DJ",
        item: `${SITE_URL}/blog/como-elegir-audifonos`,
      },
    ]);
  });
});
