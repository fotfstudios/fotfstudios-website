import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { LEAD_MAGNET_SLUGS } from "@/lib/lead-magnets";
import { parseArticleFrontmatter, splitFrontmatter, type ArticleIssue } from "./frontmatter";
import { ARTICLE_CATEGORIES, type ArticleCategory, type ArticleMeta } from "./schema";

/**
 * Registro de artículos: un cargador IMPURO que lee el disco y selectores PUROS que
 * reciben los datos como argumento. Es la misma forma de lib/photos.ts, y es lo que hace
 * que el módulo se pueda probar sin tocar el sistema de archivos.
 */

const DIR = path.join(process.cwd(), "content", "articles");

/** Rutas de primer nivel que NO son artículos: un slug así rompería la ruta real. */
const RESERVED = [
  "blog",
  "curso-dj",
  "guia-dj",
  "guia-pendrive-dj",
  "grabacion",
  "unete",
  "privacidad",
  "terminos",
  "reservar",
  "reserva",
  "cuenta",
  "admin",
  "api",
  "auth",
] as const;

export class ArticleFrontmatterError extends Error {
  constructor(readonly perFile: { file: string; issues: readonly ArticleIssue[] }[]) {
    const detalle = perFile
      .map(
        ({ file, issues }) =>
          `  content/articles/${file}\n` +
          issues.map((i) => `    · ${i.field}: ${i.code}${i.hint ? ` — ${i.hint}` : ""}`).join("\n"),
      )
      .join("\n");
    super(
      `${perFile.length} artículo${perFile.length === 1 ? "" : "s"} con frontmatter inválido.\n\n` +
        `${detalle}\n\nArregla el frontmatter y vuelve a construir. Esquema: lib/articles/schema.ts`,
    );
    this.name = "ArticleFrontmatterError";
  }
}

/**
 * IMPURO: lee content/articles/*.mdx, parsea y VALIDA. Junta los errores de TODOS los
 * archivos y lanza una sola vez con el informe completo.
 *
 * Sin memo, igual que getPhotos(): son ~40 archivos y unos pocos ms, y un memo dejaría el
 * índice obsoleto en `next dev` — el .mdx recarga solo, pero el frontmatter se lee por fs.
 */
export function getArticles(): ArticleMeta[] {
  if (!fs.existsSync(DIR)) return [];
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".mdx")).sort();

  const ok: ArticleMeta[] = [];
  const bad: { file: string; issues: readonly ArticleIssue[] }[] = [];

  for (const file of files) {
    const slug = file.replace(/\.mdx$/, "");
    const source = fs.readFileSync(path.join(DIR, file), "utf8");
    const split = splitFrontmatter(source);
    if (!split) {
      bad.push({ file, issues: [{ field: "(frontmatter)", code: "required", hint: "el archivo no abre con ---" }] });
      continue;
    }

    let data: unknown;
    try {
      data = parseYaml(split.data);
    } catch (e) {
      bad.push({
        file,
        issues: [{ field: "(yaml)", code: "invalid", hint: e instanceof Error ? e.message.split("\n")[0] : "ilegible" }],
      });
      continue;
    }

    const parsed = parseArticleFrontmatter(data, { slug, guides: LEAD_MAGNET_SLUGS });
    if (parsed.kind === "invalid") {
      bad.push({ file, issues: parsed.issues });
      continue;
    }

    const extra: ArticleIssue[] = [];
    if ((RESERVED as readonly string[]).includes(slug)) {
      extra.push({ field: "(nombre de archivo)", code: "invalid", hint: `"${slug}" es una ruta del sitio` });
    }
    // El H1 sale del frontmatter: un "# " en el cuerpo duplicaría el encabezado.
    if (/^#\s/m.test(split.body)) {
      extra.push({ field: "(cuerpo)", code: "invalid", hint: 'el H1 sale de `title`; usa ## para las secciones' });
    }
    if (parsed.value.image && !fs.existsSync(path.join(process.cwd(), "public", parsed.value.image))) {
      extra.push({ field: "image", code: "invalid", hint: `no existe public/${parsed.value.image}` });
    }
    if (extra.length > 0) bad.push({ file, issues: extra });
    else ok.push(parsed.value);
  }

  if (bad.length > 0) throw new ArticleFrontmatterError(bad);
  return ok;
}

// ── Selectores PUROS: reciben los datos, se prueban con fixtures y sin fs ─────────────

/** Publicados primero por fecha desc; los empates se rompen por slug (builds estables). */
export function publishedArticles(all: readonly ArticleMeta[], includeDrafts: boolean): ArticleMeta[] {
  return all
    .filter((a) => includeDrafts || !a.draft)
    .slice()
    .sort((a, b) => (a.publishedAt === b.publishedAt ? a.slug.localeCompare(b.slug) : b.publishedAt.localeCompare(a.publishedAt)));
}

export function articleBySlug(all: readonly ArticleMeta[], slug: string): ArticleMeta | undefined {
  return all.find((a) => a.slug === slug);
}

export function articlesByCategory(all: readonly ArticleMeta[], c: ArticleCategory): ArticleMeta[] {
  return all.filter((a) => a.category === c);
}

export function categoryCounts(
  all: readonly ArticleMeta[],
): { category: ArticleCategory; count: number }[] {
  return ARTICLE_CATEGORIES.map((category) => ({
    category,
    count: all.filter((a) => a.category === category).length,
  }));
}

/** Los declarados en `related` primero; se completa con la misma categoría. */
export function relatedArticles(all: readonly ArticleMeta[], a: ArticleMeta, limit = 2): ArticleMeta[] {
  const out: ArticleMeta[] = [];
  for (const slug of a.related) {
    const hit = all.find((x) => x.slug === slug && x.slug !== a.slug && !x.draft);
    if (hit && !out.includes(hit)) out.push(hit);
  }
  for (const x of all) {
    if (out.length >= limit) break;
    if (x.slug !== a.slug && !x.draft && x.category === a.category && !out.includes(x)) out.push(x);
  }
  return out.slice(0, limit);
}

/** Los slugs que genera /blog/[slug]: excluye los que traen `path` override (legacy). */
export function blogSlugs(all: readonly ArticleMeta[]): string[] {
  return all.filter((a) => !a.legacyPath).map((a) => a.slug);
}

/**
 * ¿Se muestran los borradores? Sí fuera de producción, para que un preview de PR enseñe
 * el artículo antes de publicarlo.
 */
export function draftsVisible(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}
