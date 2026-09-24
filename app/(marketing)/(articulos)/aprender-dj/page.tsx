import { ArticleView } from "@/components/article/ArticleView";
import { articleMetadata } from "@/lib/articles/metadata";

/**
 * /aprender-dj — el contenido vive en content/articles/aprender-dj.mdx.
 *
 * La carpeta se conserva (en vez de un [slug] atrapa-todo en la raíz de (marketing))
 * para que un path que no existe siga siendo un 404 ESTÁTICO: un dinámico cuesta una
 * invocación por cada escaneo de bot. El frontmatter declara `path: "/aprender-dj"`, y
 * blogSlugs() excluye los override, así que /blog/aprender-dj nunca se genera.
 */
export const metadata = articleMetadata("aprender-dj");

export default function Page() {
  return <ArticleView slug="aprender-dj" />;
}
