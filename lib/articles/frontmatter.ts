import { ARTICLE_CAPS, ARTICLE_CATEGORIES, type ArticleCategory, type ArticleMeta } from "./schema";
import type { LeadMagnetSlug } from "@/lib/lead-magnets";

/**
 * Validación del frontmatter — pura, sin fs y sin YAML.
 *
 * Mismo contrato que parseGuideLead: unión discriminada y TODOS los issues juntos, no el
 * primero. Escrita a mano y no con zod a propósito — la entrada es contenido propio, en
 * el repo, validado en tiempo de build; este repo trata la validación como funciones
 * puras (src/domain/** tiene una regla de ESLint que prohíbe importar librerías) y no
 * tiene ninguna dependencia de validación. Son ~150 líneas: no vale una permanente.
 */

export type ArticleIssueCode =
  | "required"
  | "too_long"
  | "too_short"
  | "invalid"
  | "unknown_key"
  | "unknown_category"
  | "unknown_guide"
  | "bad_date";

export interface ArticleIssue {
  readonly field: string;
  readonly code: ArticleIssueCode;
  /** Pista legible: el valor esperado, o un "¿querías decir?". */
  readonly hint?: string;
}

export type ParsedArticle =
  | { kind: "ok"; value: ArticleMeta }
  | { kind: "invalid"; issues: ArticleIssue[] };

export interface ArticleContext {
  readonly slug: string;
  /** Claves válidas de LEAD_MAGNETS. Se pasan como dato para no acoplar el parser. */
  readonly guides: readonly string[];
}

/**
 * El campo de la línea Fraunces se llama `lede`, NO `editorial`.
 *
 * lib/chrome-contract.test.ts afirma que el string `editorial=` no aparece en app/** ni
 * components/**, así que un prop `editorial={...}` pondría CI en rojo con un mensaje que
 * habla de PageHeader. `lede` además es el nombre que lib/guia-content.ts ya usa.
 */
const KNOWN_KEYS = [
  "title",
  "description",
  "category",
  "publishedAt",
  "guide",
  "lede",
  "excerpt",
  "updatedAt",
  "tags",
  "related",
  "image",
  "imageAlt",
  "draft",
  "featured",
  "path",
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Ruta canónica permitida para un `path` override.
 *
 * Estricta a propósito: el valor sale del frontmatter y termina en un href. Con solo
 * exigir que empiece con "/" pasaban `//evil.com` (URL relativa al protocolo, o sea otro
 * dominio) y `/x?redirect=…`. Acá solo entran segmentos en kebab-case.
 */
const PATH_RE = /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

/** Distancia de edición acotada: solo para sugerir "¿querías decir?". */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return true;
  let d = 0;
  for (let i = 0, j = 0; i < al.length && j < bl.length; ) {
    if (al[i] === bl[j]) {
      i++;
      j++;
    } else if (++d > 2) return false;
    else if (al.length > bl.length) i++;
    else if (al.length < bl.length) j++;
    else {
      i++;
      j++;
    }
  }
  return d + Math.abs(al.length - bl.length) <= 2;
}

/** Texto de una línea: sin caracteres de control, recortado. */
function str(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
}

/** ¿Es una fecha real, no solo con la forma correcta? (2026-02-31 no lo es.) */
function realDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function strList(raw: Record<string, unknown>, key: string): string[] | null {
  const v = raw[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return null;
  return (v as string[]).map((s) => s.trim()).filter(Boolean);
}

/**
 * Separa el bloque YAML del cuerpo MDX. NO parsea YAML: de eso se encarga `yaml` en el
 * cargador. Devuelve null si el archivo no empieza con un bloque de frontmatter.
 */
export function splitFrontmatter(source: string): { data: string; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  return m ? { data: m[1], body: m[2] } : null;
}

export function parseArticleFrontmatter(raw: unknown, ctx: ArticleContext): ParsedArticle {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { kind: "invalid", issues: [{ field: "(frontmatter)", code: "required" }] };
  }
  const obj = raw as Record<string, unknown>;
  const issues: ArticleIssue[] = [];

  // Clave desconocida = error duro. Atrapa publishDate:, decription:, categories:…
  for (const key of Object.keys(obj)) {
    if ((KNOWN_KEYS as readonly string[]).includes(key)) continue;
    const guess = KNOWN_KEYS.find((k) => close(k, key));
    issues.push({
      field: key,
      code: "unknown_key",
      hint: guess ? `¿querías decir "${guess}"?` : `válidas: ${KNOWN_KEYS.join(", ")}`,
    });
  }

  const title = str(obj, "title");
  if (!title) issues.push({ field: "title", code: "required" });
  else if (title.length < ARTICLE_CAPS.titleMin)
    issues.push({ field: "title", code: "too_short", hint: `mínimo ${ARTICLE_CAPS.titleMin}; tiene ${title.length}` });
  else if (title.length > ARTICLE_CAPS.titleMax)
    issues.push({ field: "title", code: "too_long", hint: `máximo ${ARTICLE_CAPS.titleMax}; tiene ${title.length}` });

  const description = str(obj, "description");
  if (!description) issues.push({ field: "description", code: "required" });
  else if (description.length < ARTICLE_CAPS.descriptionMin)
    issues.push({
      field: "description",
      code: "too_short",
      hint: `${ARTICLE_CAPS.descriptionMin}–${ARTICLE_CAPS.descriptionMax} caracteres; tiene ${description.length}`,
    });
  else if (description.length > ARTICLE_CAPS.descriptionMax)
    issues.push({
      field: "description",
      code: "too_long",
      hint: `${ARTICLE_CAPS.descriptionMin}–${ARTICLE_CAPS.descriptionMax} caracteres; tiene ${description.length}`,
    });

  const category = str(obj, "category");
  if (!category) issues.push({ field: "category", code: "required" });
  else if (!(ARTICLE_CATEGORIES as readonly string[]).includes(category))
    issues.push({ field: "category", code: "unknown_category", hint: `válidas: ${ARTICLE_CATEGORIES.join(", ")}` });

  const publishedAt = str(obj, "publishedAt");
  if (!publishedAt) issues.push({ field: "publishedAt", code: "required" });
  else if (!realDate(publishedAt))
    issues.push({ field: "publishedAt", code: "bad_date", hint: `"${publishedAt}" — formato yyyy-mm-dd` });

  const updatedRaw = str(obj, "updatedAt");
  if (updatedRaw && !realDate(updatedRaw))
    issues.push({ field: "updatedAt", code: "bad_date", hint: `"${updatedRaw}" — formato yyyy-mm-dd` });

  const guide = str(obj, "guide");
  if (!guide) issues.push({ field: "guide", code: "required" });
  else if (!ctx.guides.includes(guide))
    issues.push({ field: "guide", code: "unknown_guide", hint: `"${guide}" no existe. Válidos: ${ctx.guides.join(", ")}` });

  const lede = str(obj, "lede");
  if (lede && lede.length > ARTICLE_CAPS.ledeMax)
    issues.push({ field: "lede", code: "too_long", hint: `máximo ${ARTICLE_CAPS.ledeMax}; tiene ${lede.length}` });

  const excerpt = str(obj, "excerpt");
  if (excerpt && excerpt.length > ARTICLE_CAPS.excerptMax)
    issues.push({ field: "excerpt", code: "too_long", hint: `máximo ${ARTICLE_CAPS.excerptMax}; tiene ${excerpt.length}` });

  const tags = strList(obj, "tags");
  if (tags === null) issues.push({ field: "tags", code: "invalid", hint: "una lista de strings" });
  else if (tags.length > ARTICLE_CAPS.tags)
    issues.push({ field: "tags", code: "too_long", hint: `máximo ${ARTICLE_CAPS.tags}; tiene ${tags.length}` });

  const related = strList(obj, "related");
  if (related === null) issues.push({ field: "related", code: "invalid", hint: "una lista de slugs" });
  else if (related.length > ARTICLE_CAPS.related)
    issues.push({ field: "related", code: "too_long", hint: `máximo ${ARTICLE_CAPS.related}; tiene ${related.length}` });

  const image = str(obj, "image").replace(/^\//, "");
  const imageAlt = str(obj, "imageAlt");
  // Una imagen sin alt es una imagen que no se puede publicar.
  if (image && !imageAlt) issues.push({ field: "imageAlt", code: "required", hint: "obligatorio cuando hay image" });

  if (obj.draft !== undefined && typeof obj.draft !== "boolean")
    issues.push({ field: "draft", code: "invalid", hint: "true o false" });

  if (obj.featured !== undefined && typeof obj.featured !== "boolean")
    issues.push({ field: "featured", code: "invalid", hint: "true o false" });

  const pathOverride = str(obj, "path");
  if (pathOverride && !PATH_RE.test(pathOverride))
    issues.push({ field: "path", code: "invalid", hint: "ruta absoluta en kebab-case: /asi-de-simple" });

  if (!SLUG_RE.test(ctx.slug))
    issues.push({ field: "(nombre de archivo)", code: "invalid", hint: `"${ctx.slug}" — kebab-case en minúsculas` });

  if (issues.length > 0) return { kind: "invalid", issues };

  return {
    kind: "ok",
    value: {
      slug: ctx.slug,
      title,
      description,
      excerpt: excerpt || description,
      ...(lede ? { lede } : {}),
      category: category as ArticleCategory,
      tags: tags ?? [],
      publishedAt,
      updatedAt: updatedRaw || publishedAt,
      guide: guide as LeadMagnetSlug,
      related: related ?? [],
      ...(image ? { image, imageAlt } : {}),
      draft: obj.draft === true,
      featured: obj.featured === true,
      path: pathOverride || `/blog/${ctx.slug}`,
      legacyPath: Boolean(pathOverride),
    },
  };
}
