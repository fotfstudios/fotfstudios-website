/**
 * Runtime JSX de los artículos .mdx en desarrollo. Ver README.md de esta carpeta.
 *
 * Este es el que arregla el 500: sin el shim, el .mdx resolvía la variante de CLIENTE de
 * `react/jsx-dev-runtime` dentro del grafo RSC y reventaba en `recentlyCreatedOwnerStacks`.
 */
export { Fragment, jsxDEV } from "react/jsx-dev-runtime";
