/**
 * Runtime JSX de los artículos .mdx en producción. Ver README.md de esta carpeta.
 *
 * Es un re-export y nada más. Lo que importa es la EXTENSIÓN: al ser .ts entra al
 * `codeCondition` de Next y por lo tanto a la capa `react-server`, que es la que resuelve
 * `react/jsx-runtime` a la variante correcta. El .mdx no puede hacerlo por sí mismo.
 */
export { Fragment, jsx, jsxs } from "react/jsx-runtime";
