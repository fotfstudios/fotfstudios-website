import type { MDXProps } from "mdx/types";

type MDXModule = { default: (props: MDXProps) => React.JSX.Element };

/**
 * Un import por artículo. Cada uno queda en su propio chunk.
 *
 * Explícito y no `import(\`./${slug}.mdx\`)` a propósito: un template literal compila a un
 * *context module* del bundler. Funciona, pero el modo de falla de un typo es un "Cannot
 * find module" críptico durante el prerender, y es justo el borde que Turbopack tiene
 * pendiente. Así lo chequea el compilador.
 *
 * lib/articles/registry.test.ts afirma que estas claves son EXACTAMENTE los .mdx en
 * disco: olvidar la línea se pone rojo en `npm test`, antes del build.
 */
export const ARTICLE_MODULES = {} as const satisfies Record<string, () => Promise<MDXModule>>;
