import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Redirige las URLs del sitio antiguo ("coming soon" con locale /en) al home,
  // para que Google consolide la entrada obsoleta en vez de dejarla en 404.
  async redirects() {
    return [
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/", permanent: true },
    ];
  },
};

/**
 * MDX para los artículos. Dos decisiones que conviene no deshacer:
 *
 * 1. Los plugins van como STRING, no como función importada. @next/mdx los resuelve por
 *    ruta dentro del loader, y es la única forma que Turbopack acepta (no se le pueden
 *    pasar funciones JS al lado Rust). Así el salto a Next 16 no toca este archivo.
 *
 * 2. NO se fija `pageExtensions`. Es deliberado: si .mdx resolviera como ruta, cualquiera
 *    podría dejar un page.mdx suelto en app/ y esquivar el contrato de chrome
 *    (lib/chrome-contract.test.ts solo mira archivos .tsx). El contenido vive en content/
 *    y lo monta app/(marketing)/(articulos)/blog/[slug]/page.tsx.
 *
 * 3. `jsxImportSource` apunta al shim de lib/mdx-runtime y NO a "react". El test de
 *    extensión con el que Next reparte los módulos por capa (`codeCondition`, en
 *    webpack-config.js) es fijo y no incluye .mdx, así que un artículo nunca entra a la
 *    capa `react-server` y resolvía el runtime JSX de CLIENTE dentro del grafo RSC: 500
 *    en `npm run dev` para TODO artículo. El shim es .ts, entra a la capa, y resuelve en
 *    su nombre. El detalle completo está en lib/mdx-runtime/README.md.
 *
 * remark-frontmatter NO es opcional: sin él, el bloque YAML de cada artículo se renderiza
 * como un guion largo seguido del texto crudo del frontmatter.
 */
const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-frontmatter", ["yaml"]], "remark-gfm"],
    rehypePlugins: [],
    jsxImportSource: "@/lib/mdx-runtime",
  },
});

export default withMDX(nextConfig);
