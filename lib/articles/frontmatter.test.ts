import { describe, expect, it } from "vitest";
import {
  parseArticleFrontmatter,
  splitFrontmatter,
  type ArticleContext,
  type ParsedArticle,
} from "./frontmatter";

const CTX: ArticleContext = { slug: "como-elegir-audifonos", guides: ["guia-dj"] };

const OK = {
  title: "Cómo elegir audífonos para DJ",
  description:
    "Qué mirar antes de comprar audífonos para mezclar: aislamiento, respuesta y por qué el precio no manda.",
  category: "equipo",
  publishedAt: "2026-09-23",
  guide: "guia-dj",
};

const parse = (over: Record<string, unknown> = {}, ctx = CTX): ParsedArticle =>
  parseArticleFrontmatter({ ...OK, ...over }, ctx);

/** Todos los códigos de un campo, para afirmar sin depender del orden. */
const codes = (r: ParsedArticle, field: string) =>
  r.kind === "invalid" ? r.issues.filter((i) => i.field === field).map((i) => i.code) : [];

describe("splitFrontmatter", () => {
  it("separa el bloque YAML del cuerpo", () => {
    expect(splitFrontmatter('---\ntitle: "A"\n---\n\n## Hola\n')).toEqual({
      data: 'title: "A"',
      body: "\n## Hola\n",
    });
  });

  it("devuelve null si el archivo no abre con frontmatter", () => {
    expect(splitFrontmatter("## Hola")).toBeNull();
  });
});

describe("parseArticleFrontmatter", () => {
  it("un frontmatter mínimo válido resuelve todos los opcionales", () => {
    const r = parse();
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.value).toMatchObject({
      slug: "como-elegir-audifonos",
      excerpt: OK.description, // por defecto, la description
      updatedAt: OK.publishedAt, // por defecto, la fecha de publicación
      tags: [],
      related: [],
      draft: false,
      path: "/blog/como-elegir-audifonos",
      legacyPath: false,
    });
    expect(r.value).not.toHaveProperty("lede");
    expect(r.value).not.toHaveProperty("image");
  });

  it("junta TODOS los issues, no se corta en el primero", () => {
    const r = parseArticleFrontmatter({ category: "ritmo", publishedAt: "23-09-2026" }, CTX);
    expect(r.kind).toBe("invalid");
    if (r.kind !== "invalid") return;
    // faltan title, description y guide; category y publishedAt son inválidos
    expect(r.issues.length).toBeGreaterThanOrEqual(5);
    expect(codes(r, "title")).toEqual(["required"]);
    expect(codes(r, "description")).toEqual(["required"]);
    expect(codes(r, "guide")).toEqual(["required"]);
    expect(codes(r, "category")).toEqual(["unknown_category"]);
    expect(codes(r, "publishedAt")).toEqual(["bad_date"]);
  });

  it("una clave desconocida es error duro y sugiere la parecida", () => {
    const r = parse({ publishDate: "2026-09-23" });
    expect(codes(r, "publishDate")).toEqual(["unknown_key"]);
    if (r.kind !== "invalid") return;
    expect(r.issues.find((i) => i.field === "publishDate")?.hint).toContain("publishedAt");
  });

  it("atrapa un typo en description sin sugerir cualquier cosa", () => {
    const r = parse({ decription: "x" });
    expect(codes(r, "decription")).toEqual(["unknown_key"]);
    if (r.kind !== "invalid") return;
    expect(r.issues.find((i) => i.field === "decription")?.hint).toContain("description");
  });

  it("rechaza una fecha con forma correcta pero que no existe", () => {
    expect(codes(parse({ publishedAt: "2026-02-31" }), "publishedAt")).toEqual(["bad_date"]);
    expect(codes(parse({ publishedAt: "2026-13-01" }), "publishedAt")).toEqual(["bad_date"]);
    expect(parse({ publishedAt: "2028-02-29" }).kind).toBe("ok"); // bisiesto de verdad
  });

  it("exige que title y description quepan en un resultado de Google", () => {
    expect(codes(parse({ title: "Corto" }), "title")).toEqual(["too_short"]);
    expect(codes(parse({ title: "x".repeat(71) }), "title")).toEqual(["too_long"]);
    expect(codes(parse({ description: "Muy corta." }), "description")).toEqual(["too_short"]);
    expect(codes(parse({ description: "x".repeat(161) }), "description")).toEqual(["too_long"]);
  });

  it("category y guide son conjuntos cerrados, y el error imprime los válidos", () => {
    const c = parse({ category: "ritmo" });
    expect(codes(c, "category")).toEqual(["unknown_category"]);
    if (c.kind === "invalid") expect(c.issues[0].hint).toContain("aprender");

    const g = parse({ guide: "guia-djing" });
    expect(codes(g, "guide")).toEqual(["unknown_guide"]);
    if (g.kind === "invalid") expect(g.issues[0].hint).toContain("guia-dj");
  });

  it("una imagen sin alt no se publica", () => {
    expect(codes(parse({ image: "og/equipo.jpg" }), "imageAlt")).toEqual(["required"]);
    const ok = parse({ image: "/og/equipo.jpg", imageAlt: "La cabina" });
    expect(ok.kind).toBe("ok");
    // la barra inicial se normaliza: la ruta es relativa a public/
    if (ok.kind === "ok") expect(ok.value.image).toBe("og/equipo.jpg");
  });

  it("respeta los topes de tags y related", () => {
    expect(codes(parse({ tags: ["a", "b", "c", "d", "e", "f", "g"] }), "tags")).toEqual(["too_long"]);
    expect(codes(parse({ related: ["a", "b", "c", "d"] }), "related")).toEqual(["too_long"]);
    expect(codes(parse({ tags: "audífonos" }), "tags")).toEqual(["invalid"]);
  });

  it("un path override marca legacyPath: así /blog/[slug] no lo genera dos veces", () => {
    const r = parse({ path: "/aprender-dj" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.value.path).toBe("/aprender-dj");
    expect(r.value.legacyPath).toBe(true);
  });

  it("el path override solo acepta una ruta absoluta en kebab-case", () => {
    expect(codes(parse({ path: "aprender-dj" }), "path")).toEqual(["invalid"]);
    // Relativa al protocolo: empieza con "/" pero apunta a OTRO dominio.
    expect(codes(parse({ path: "//evil.com" }), "path")).toEqual(["invalid"]);
    expect(codes(parse({ path: "javascript:alert(1)" }), "path")).toEqual(["invalid"]);
    expect(codes(parse({ path: "/x?redirect=evil" }), "path")).toEqual(["invalid"]);
    expect(codes(parse({ path: "/Aprender-DJ" }), "path")).toEqual(["invalid"]);
    expect(parse({ path: "/blog/algo-anidado" }).kind).toBe("ok");
  });

  it("el nombre del archivo tiene que ser kebab-case", () => {
    const r = parse({}, { slug: "Como_Elegir", guides: ["guia-dj"] });
    expect(codes(r, "(nombre de archivo)")).toEqual(["invalid"]);
  });

  it("draft solo acepta booleano", () => {
    expect(codes(parse({ draft: "sí" }), "draft")).toEqual(["invalid"]);
    const r = parse({ draft: true });
    if (r.kind === "ok") expect(r.value.draft).toBe(true);
  });

  it("lede y excerpt tienen tope propio", () => {
    expect(codes(parse({ lede: "x".repeat(141) }), "lede")).toEqual(["too_long"]);
    expect(codes(parse({ excerpt: "x".repeat(201) }), "excerpt")).toEqual(["too_long"]);
  });
});
