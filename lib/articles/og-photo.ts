import { ARTICLE_CATEGORIES, type ArticleCategory } from "./schema";

/**
 * La foto de la tarjeta OG de cada categoría.
 *
 * Son recortes propios en public/og/, no las fotos de public/photos/: cada tarjeta
 * inlinea su JPEG en base64 para que satori lo decodifique, y los originales pesan
 * 3–10 MB. Los recortes suman 238 KB entre los cinco —125× menos— y de paso evitan el
 * problema de la rotación EXIF, porque el encuadre lo controlamos nosotros.
 *
 * Elegidas por composición: el sujeto va a la DERECHA y el negro a la izquierda, que es
 * donde la tarjeta pone el titular.
 */
const POR_CATEGORIA: Record<ArticleCategory, string> = {
  aprender: "og/aprender.jpg",
  equipo: "og/equipo.jpg",
  precios: "og/precios.jpg",
  estudio: "og/estudio.jpg",
};

/** La del índice de /blog. */
export const OG_BLOG_PHOTO = "og/blog.jpg";

export function ogPhotoFor(category: ArticleCategory | string | undefined): string {
  return category && (ARTICLE_CATEGORIES as readonly string[]).includes(category)
    ? POR_CATEGORIA[category as ArticleCategory]
    : OG_BLOG_PHOTO;
}
