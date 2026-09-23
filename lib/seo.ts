import type { Metadata } from "next";
import { SITE, SITE_URL } from "@/lib/site";

/**
 * Sufijo de marca. Duplica a propósito el `title.template` de app/layout.tsx: el
 * template solo aplica a <title>, no a og:title ni a twitter:title, que las landings
 * vienen escribiendo a mano con el sufijo pegado. Acá queda en un solo lugar.
 */
const BRAND = SITE.name;
const withBrand = (title: string) => `${title} · ${BRAND}`;

export interface PageSeo {
  /**
   * SIN el sufijo de marca: el `title.template` de la raíz lo agrega al <title>, y
   * este módulo lo agrega a og/twitter. Se omite SOLO en el home, que nunca migra
   * a este helper (ver la nota al final del archivo).
   */
  readonly title?: string;
  readonly description: string;
  /** Ruta absoluta desde la raíz, con "/" inicial y sin barra final: "/blog/x". */
  readonly path: string;
  readonly type?: "website" | "article";
  /** Solo con type: "article". yyyy-mm-dd o ISO completo. */
  readonly publishedTime?: string;
  readonly modifiedTime?: string;
  /** Categoría legible del artículo: "Equipo". */
  readonly section?: string;
  readonly tags?: readonly string[];
  readonly noIndex?: boolean;
}

/** URL absoluta. Para JSON-LD, que no pasa por `metadataBase`. */
export function canonicalUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/**
 * Metadata de una página pública: canónica, Open Graph y Twitter en una sola llamada.
 *
 * INVARIANTE: este helper NUNCA setea `openGraph.images`. Setearlo explícitamente
 * ANULA la convención de archivo de Next (opengraph-image.tsx junto a la page), que es
 * como se generan todas las tarjetas del sitio. Si alguna vez hace falta una imagen
 * puntual, va en la página, no acá. Hay una prueba que lo vigila.
 *
 * La canónica se devuelve RELATIVA: `metadataBase` de app/layout.tsx la resuelve contra
 * SITE_URL, que apunta siempre a producción aunque el deploy sea un preview o un túnel.
 */
export function pageMetadata(seo: PageSeo): Metadata {
  const { title, description, path, type = "website" } = seo;
  const social = title ? withBrand(title) : undefined;

  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      ...(social ? { title: social } : {}),
      description,
      url: path,
      siteName: BRAND,
      locale: "es_CL",
      type,
      ...(type === "article"
        ? {
            ...(seo.publishedTime ? { publishedTime: seo.publishedTime } : {}),
            ...(seo.modifiedTime ? { modifiedTime: seo.modifiedTime } : {}),
            ...(seo.section ? { section: seo.section } : {}),
            ...(seo.tags?.length ? { tags: [...seo.tags] } : {}),
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(social ? { title: social } : {}),
      description,
    },
    ...(seo.noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * NOTA — app/(marketing)/page.tsx NO migra a este helper, nunca.
 *
 * lib/chrome-contract.test.ts fija el home con un regex sobre el bloque literal
 * `export const metadata: Metadata = { … };` para comprobar que no exporta `title`
 * (el `title.default` de la raíz es el suyo). Reescribirlo como `pageMetadata(...)`
 * hace que ese regex devuelva null y la prueba se cae antes siquiera de mirar el
 * título. Es deliberado: el home es la única página cuya metadata vive en la raíz.
 */
