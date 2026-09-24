# Por qué existe este directorio

Next decide en qué "capa" compila cada módulo con un test de extensión **fijo** dentro de
`next/dist/build/webpack-config.js`:

```js
const codeCondition = { test: { or: [ /\.(tsx|ts|js|cjs|mjs|jsx)$/, ... ] }, ... };
```

`.mdx` no está en esa lista. Por eso un artículo de `content/articles/*.mdx` **nunca entra a
la capa `react-server`**, y es la capa la que instala las condiciones de resolución de React.
Resultado: el `.mdx` resolvía `react/jsx-dev-runtime` a la variante de CLIENTE mientras todo
el grafo RSC a su alrededor usa la variante de SERVIDOR.

Las dos variantes leen símbolos distintos de React:

| variante | lee |
|---|---|
| cliente | `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` |
| react-server | `__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` |

El runtime de cliente buscaba `__CLIENT_INTERNALS` en un React de servidor que solo tiene
`__SERVER_INTERNALS`, recibía `undefined` y reventaba al leerle `.recentlyCreatedOwnerStacks`:
**todo artículo .mdx tiraba 500 en `npm run dev`**. En producción no se veía porque el build
compila por `jsx-runtime` y no por `jsx-dev-runtime`.

Estos dos archivos son el arreglo: son `.ts`, así que **sí** entran a la capa `react-server`,
y el `.mdx` importa su runtime JSX a través de ellos (`jsxImportSource` en `next.config.ts`).
La resolución correcta la hace el shim en nombre del artículo.

No agregar lógica acá: son un puente de resolución, nada más.
