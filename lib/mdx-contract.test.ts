import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El cableado de MDX, fijado desde el archivo. Son invariantes que no se caen solas:
 * romper cualquiera de ellas da un build verde y un resultado equivocado.
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Lee el archivo SIN comentarios.
 *
 * Estas pruebas afirman que ciertos tokens no aparecen en el código; si miraran el texto
 * crudo, explicar en un comentario por qué NO se usa `pageExtensions` bastaría para
 * ponerlas rojas. Es el mismo filo que ya tiene la aserción de `editorial=` en
 * chrome-contract: acá se desafila de entrada.
 */
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "");

describe("next.config.ts", () => {
  const src = readCode("next.config.ts");

  it("NO fija pageExtensions: un .mdx nunca debe resolver como ruta", () => {
    // Si .mdx fuera una extensión de página, alguien podría dejar un page.mdx suelto en
    // app/ y esquivar el contrato de chrome, que solo mira archivos .tsx.
    expect(src).not.toMatch(/pageExtensions/);
  });

  it("pasa remark-frontmatter: sin él el bloque YAML se renderiza como texto", () => {
    expect(src).toContain("remark-frontmatter");
  });

  it("nombra los plugins como string, que es lo único que acepta Turbopack", () => {
    // Turbopack no puede recibir funciones JS (el lado que las consume es Rust).
    expect(src).toMatch(/remarkPlugins:\s*\[\s*\[\s*"remark-frontmatter"/);
    expect(src).not.toMatch(/import\s+remark(Frontmatter|Gfm)/);
  });

  it("sigue redirigiendo las URLs del sitio viejo", () => {
    expect(src).toContain('source: "/en"');
    expect(src).toContain('source: "/en/:path*"');
  });
});

describe("mdx-components.tsx de la raíz", () => {
  it("es un re-export: el mapa real vive donde los contract tests lo ven", () => {
    // @next/mdx obliga a que este archivo esté en la raíz, pero lib/*-contract.test.ts
    // escanea app/** y components/**, nunca la raíz.
    const src = read("mdx-components.tsx");
    expect(src).toContain('from "@/components/mdx/mdx-components"');
    expect(src).toContain("useMDXComponents");
  });
});

describe("componentes de MDX", () => {
  const dir = "components/mdx";
  const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".tsx"));

  it("ninguno usa Sirena: es solo urgencia, nunca decoración", () => {
    // Un Callout de advertencia en Sirena gasta el color y deja de significar nada.
    for (const f of files) {
      expect(readCode(`${dir}/${f}`), `${f} usa sirena`).not.toMatch(/sirena/i);
    }
  });

  it("no mapea h1: el H1 del artículo sale del frontmatter", () => {
    const src = readCode(`${dir}/mdx-components.tsx`);
    expect(src).not.toMatch(/^\s*h1:/m);
  });

  it("Figure usa next/image, no <img>: acá sí es el DOM del navegador", () => {
    // El <img> crudo solo se justifica dentro de satori (lib/og.tsx).
    const src = readCode(`${dir}/Figure.tsx`);
    expect(src).toContain('from "next/image"');
    expect(src).not.toMatch(/<img\b/);
  });

  it("los enlaces externos llevan rel noopener noreferrer", () => {
    const src = read(`${dir}/mdx-components.tsx`);
    expect(src).toContain('rel="noopener noreferrer"');
  });
});

describe("la trampa del ignoreCommand de Vercel", () => {
  it("el contenido se escribe .mdx, NUNCA .md, o publicar no despliega", () => {
    // vercel.json excluye **/*.md del ignoreCommand: un commit que solo toca .md se
    // salta el build entero — con el check en verde. `.mdx` no cae en ese glob.
    const vercel = read("vercel.json");
    expect(vercel).toContain("**/*.md");

    const dir = join(ROOT, "content");
    if (!existsSync(dir)) return;
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
      );
    const md = walk(dir).filter((f) => f.endsWith(".md"));
    expect(md, "un .md en content/ nunca se desplegaría").toEqual([]);
  });
});
