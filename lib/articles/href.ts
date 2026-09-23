/**
 * Ruta interna segura para un href de artículo.
 *
 * El `path` de un artículo nace en el frontmatter, o sea en un archivo del disco.
 * lib/articles/frontmatter.ts ya lo valida al cargarlo, pero esto es el cinturón además
 * del tirante: un único punto por el que pasan TODOS los href de artículo, de modo que
 * ningún camino —un registro construido a mano en una prueba, un refactor futuro que se
 * salte el parser— pueda meter `//otro-dominio.com` ni un `javascript:` en un enlace.
 *
 * Es la misma regla que PATH_RE, repetida a propósito acá: este módulo no depende del
 * parser, así que sigue valiendo aunque aquel cambie.
 */
const SAFE_PATH = /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

export function articleHref(path: string): string {
  return SAFE_PATH.test(path) ? path : "/blog";
}
