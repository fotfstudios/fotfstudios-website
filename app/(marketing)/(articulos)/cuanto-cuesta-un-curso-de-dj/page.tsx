import { ArticleView } from "@/components/article/ArticleView";
import { articleMetadata } from "@/lib/articles/metadata";

/**
 * /cuanto-cuesta-un-curso-de-dj — el contenido vive en
 * content/articles/cuanto-cuesta-un-curso-de-dj.mdx (mismo patrón que /aprender-dj:
 * carpeta conservada para que la URL rankeada no cambie y el 404 siga siendo estático).
 */
export const metadata = articleMetadata("cuanto-cuesta-un-curso-de-dj");

export default function Page() {
  return <ArticleView slug="cuanto-cuesta-un-curso-de-dj" />;
}
