import Link from "next/link";
import type { MDXComponents } from "mdx/types";
import { Callout } from "./Callout";
import { Figure } from "./Figure";
import { Gear } from "./Gear";
import { GearModelos } from "./GearModelos";
import { Precio } from "./Precio";
import { PullQuote } from "./PullQuote";
import { Spec } from "./Spec";

/**
 * El mapa de MDX a la tipografía de la marca.
 *
 * Las clases NO son nuevas: salen tal cual de los artículos que ya existen y de
 * GuideSection. La única diferencia de forma es que el hairline de sección se mueve del
 * <section> envolvente al propio <h2>, que da el mismo resultado sin necesitar un plugin
 * que agrupe secciones.
 *
 * `h1` NO se mapea a propósito: el H1 del artículo sale del frontmatter y lo renderiza
 * ArticleHeader. Un "# " en el cuerpo es un error que el registro rechaza.
 */

/** El mismo string que los artículos repiten para los enlaces en prosa. */
const enlace =
  "text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold";

export function useMDXComponents(components: MDXComponents = {}): MDXComponents {
  return {
    h2: ({ children, ...p }) => (
      <h2
        {...p}
        className="font-display mt-12 border-t hairline pt-10 text-bone"
        style={{ fontSize: "clamp(1.4rem,4vw,2rem)" }}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...p }) => (
      <h3 {...p} className="font-display mt-8 text-xl text-bone">
        {children}
      </h3>
    ),
    p: ({ children, ...p }) => (
      <p {...p} className="mt-4 leading-relaxed text-bone-dim">
        {children}
      </p>
    ),
    ul: ({ children, ...p }) => (
      <ul {...p} className="mt-4 list-disc space-y-2 pl-5 text-bone-dim marker:text-gold">
        {children}
      </ul>
    ),
    ol: ({ children, ...p }) => (
      <ol {...p} className="mt-4 list-decimal space-y-2 pl-5 text-bone-dim marker:text-gold">
        {children}
      </ol>
    ),
    li: ({ children, ...p }) => (
      <li {...p} className="leading-relaxed">
        {children}
      </li>
    ),
    strong: ({ children, ...p }) => (
      <strong {...p} className="font-medium text-bone">
        {children}
      </strong>
    ),
    // Fraunces NO: la línea editorial del artículo es <PullQuote>, una sola por pieza.
    em: ({ children, ...p }) => (
      <em {...p} className="italic">
        {children}
      </em>
    ),
    blockquote: ({ children, ...p }) => (
      <blockquote {...p} className="mt-8 border-l-2 border-gold/50 pl-5 text-bone-dim">
        {children}
      </blockquote>
    ),
    hr: (p) => <hr {...p} className="mt-12 border-t hairline" />,
    a: ({ href = "", children, ...p }) => {
      const interno = href.startsWith("/") || href.startsWith("#");
      return interno ? (
        <Link href={href} className={enlace} {...p}>
          {children}
        </Link>
      ) : (
        <a href={href} className={enlace} target="_blank" rel="noopener noreferrer" {...p}>
          {children}
        </a>
      );
    },
    // ![alt](ruta) sigue funcionando: delega en la misma <Figure> del bloque explícito.
    img: ({ src = "", alt = "" }) => <Figure src={String(src).replace(/^\//, "")} alt={alt} />,
    table: ({ children, ...p }) => (
      <div className="mt-8 overflow-x-auto">
        <table {...p} className="w-full text-left text-bone-dim">
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...p }) => (
      <th {...p} scope="col" className="label border-t hairline py-3 pr-4 text-bone-mute">
        {children}
      </th>
    ),
    td: ({ children, ...p }) => (
      <td {...p} className="border-t hairline py-3 pr-4 leading-relaxed">
        {children}
      </td>
    ),
    code: ({ children, ...p }) => (
      <code {...p} className="border hairline bg-ink-soft px-1.5 font-mono text-[0.9em] text-bone">
        {children}
      </code>
    ),
    // Disponibles dentro del MDX sin importar nada.
    Callout,
    PullQuote,
    Figure,
    Spec,
    Gear,
    GearModelos,
    Precio,
    ...components,
  };
}
