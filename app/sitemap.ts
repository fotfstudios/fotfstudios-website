import type { MetadataRoute } from "next";
import { getArticles, publishedArticles } from "@/lib/articles/registry";
import { buildSitemap } from "@/lib/sitemap";

/**
 * La tabla vive en lib/sitemap.ts para que vitest la vea (vitest.config.ts no recoge
 * app/**). Los borradores quedan fuera aunque se puedan ver en un preview.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(publishedArticles(getArticles(), false), new Date());
}
