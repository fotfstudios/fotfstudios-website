import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contrato de superficies del chrome (marketing / booking / cuenta / admin).
 * No hay harness de DOM y vitest no recoge app/, así que se leen los archivos
 * fuente con fs y se afirma QUIÉN monta QUÉ:
 *  - cursor + medidor de scroll: solo app/(marketing)/layout.tsx
 *  - PublicChrome (GTM + ConsentBanner + Analytics): (marketing), (booking),
 *    app/cuenta/layout.tsx y app/not-found.tsx — nunca bajo app/admin
 *  - consent-default (beforeInteractive): solo app/layout.tsx
 *  - globals.css: sin html { scroll-behavior } global; scroll suave scopeado y sin capa
 * Es la única red: tsc, eslint y el build no detectan ninguna de estas regresiones.
 * Los tokens van en forma JSX/atributo para que un comentario que mencione el
 * nombre no dispare el test (components/ConsentBanner.tsx:38 menciona
 * "beforeInteractive" en prosa, por ejemplo).
 */
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(join(ROOT, rel));

/** Archivos .tsx bajo `dir` (recursivo), como rutas relativas al repo, ordenadas. */
const tsxUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f))
    .sort();

const filesContaining = (dir: string, needle: string | RegExp): string[] =>
  tsxUnder(dir).filter((f) => {
    const src = read(f);
    return typeof needle === "string" ? src.includes(needle) : needle.test(src);
  });

const CURSOR = "<CustomCursor";
const METER = 'className="scroll-meter"';
const MARKETING_ONLY = [CURSOR, METER];
const GTM_LOADER = 'id="gtm-init"';
const BANNER = "<ConsentBanner";
const ANALYTICS = "<Analytics";
const PUBLIC_CHROME = "<PublicChrome";
const MEASUREMENT = [GTM_LOADER, BANNER, ANALYTICS, PUBLIC_CHROME, '"@vercel/analytics/next"', "googletagmanager.com"];
const BEFORE_INTERACTIVE = 'strategy="beforeInteractive"';

describe("app/layout.tsx (raíz)", () => {
  const src = read("app/layout.tsx");

  it("conserva globals.css, consent-default (beforeInteractive) y SpeedInsights", () => {
    expect(src).toContain('import "./globals.css"');
    expect(src).toContain('<Script id="consent-default" strategy="beforeInteractive">');
    expect(src).toContain("<SpeedInsights />");
  });

  it("no monta chrome de marketing ni medición pública", () => {
    for (const token of [...MARKETING_ONLY, ...MEASUREMENT]) expect(src, token).not.toContain(token);
  });
});

describe("components/PublicChrome.tsx", () => {
  const src = read("components/PublicChrome.tsx");

  it("contiene el loader de GTM (+ noscript), ConsentBanner y Analytics", () => {
    expect(src).toContain('<Script id="gtm-init" strategy="afterInteractive">');
    expect(src).toContain("googletagmanager.com/ns.html?id=");
    expect(src).toContain('from "@vercel/analytics/next"');
    expect(src).toContain("<Analytics />");
    expect(src).toContain("<ConsentBanner />");
  });

  it("no lleva cursor, medidor, SpeedInsights ni beforeInteractive", () => {
    for (const token of [...MARKETING_ONLY, "<SpeedInsights", BEFORE_INTERACTIVE]) {
      expect(src, token).not.toContain(token);
    }
  });
});

describe("app/(marketing)/layout.tsx", () => {
  const src = read("app/(marketing)/layout.tsx");

  it("monta cursor, medidor (con data-surface) y PublicChrome", () => {
    expect(src).toContain('<div className="scroll-meter" data-surface="marketing" aria-hidden />');
    expect(src).toContain("<CustomCursor />");
    expect(src).toContain("<PublicChrome />");
  });

  it("devuelve un fragmento y no monta Nav/Footer/main ni GTM directo", () => {
    expect(src).toMatch(/return \(\s*<>/);
    expect(src).not.toMatch(/<(Nav|Footer|main)\b/);
    expect(src).not.toContain(GTM_LOADER);
  });
});

describe.each(["app/(booking)/layout.tsx", "app/cuenta/layout.tsx", "app/not-found.tsx"])("%s", (file) => {
  it("monta PublicChrome y nada de marketing ni GTM directo", () => {
    const src = read(file);
    expect(src).toContain("<PublicChrome />");
    for (const token of [...MARKETING_ONLY, GTM_LOADER, BANNER, ANALYTICS]) {
      expect(src, token).not.toContain(token);
    }
  });
});

describe("app/admin/** y components/admin/**", () => {
  it("no referencian PublicChrome, cursor, medidor, GTM, banner ni Analytics", () => {
    const files = [...tsxUnder("app/admin"), ...tsxUnder("components/admin")];
    expect(files.length).toBeGreaterThan(0);
    const tokens = ["PublicChrome", ...MARKETING_ONLY, GTM_LOADER, BANNER, ANALYTICS, "@vercel/analytics", "googletagmanager.com", "@next/third-parties", "gtmId", "gtag("];
    const offenders = files.filter((f) => {
      const src = read(f);
      return tokens.some((t) => src.includes(t));
    });
    expect(offenders).toEqual([]);
  });

  it("app/admin no tiene layout ni error boundary propios (app/error.tsx cubre /admin/login)", () => {
    expect(exists("app/admin/layout.tsx")).toBe(false);
    expect(exists("app/admin/error.tsx")).toBe(false);
  });
});

describe("dueños únicos (app/ + components/)", () => {
  const all = [...tsxUnder("app"), ...tsxUnder("components")];
  const owners = (needle: string | RegExp) =>
    all.filter((f) => {
      const src = read(f);
      return typeof needle === "string" ? src.includes(needle) : needle.test(src);
    });

  it('strategy="beforeInteractive" solo en app/layout.tsx', () => {
    expect(owners(BEFORE_INTERACTIVE)).toEqual(["app/layout.tsx"]);
  });

  it("gtm-init, <ConsentBanner /> y <Analytics /> solo en components/PublicChrome.tsx", () => {
    for (const needle of [GTM_LOADER, /<ConsentBanner\s*\/>/, /<Analytics\s*\/>/]) {
      expect(owners(needle), String(needle)).toEqual(["components/PublicChrome.tsx"]);
    }
  });

  it("<CustomCursor /> y el scroll-meter solo en app/(marketing)/layout.tsx", () => {
    expect(owners(/<CustomCursor\s*\/>/)).toEqual(["app/(marketing)/layout.tsx"]);
    expect(owners(METER)).toEqual(["app/(marketing)/layout.tsx"]);
  });

  it("<PublicChrome /> exactamente en (marketing), (booking), cuenta y not-found", () => {
    expect(owners(/<PublicChrome\s*\/>/)).toEqual([
      "app/(booking)/layout.tsx",
      "app/(marketing)/layout.tsx",
      "app/cuenta/layout.tsx",
      "app/not-found.tsx",
    ]);
  });

  it("toda page.tsx vive bajo un árbol con chrome decidido", () => {
    const allowed = ["app/(marketing)/", "app/(booking)/", "app/cuenta/", "app/admin/"];
    const orphans = tsxUnder("app")
      .filter((f) => f.endsWith("/page.tsx"))
      .filter((f) => !allowed.some((prefix) => f.startsWith(prefix)));
    expect(orphans, "página fuera de (marketing)/(booking)/cuenta/admin: decide su chrome").toEqual([]);
  });
});

describe("árbol de rutas", () => {
  it("marketing vive bajo app/(marketing)/ (incl. pago, par OG y (guias) anidado) y nada quedó atrás", () => {
    for (const p of [
      "app/(marketing)/layout.tsx",
      "app/(marketing)/page.tsx",
      "app/(marketing)/curso-dj/page.tsx",
      "app/(marketing)/curso-dj/pago/page.tsx",
      "app/(marketing)/curso-dj/opengraph-image.tsx",
      "app/(marketing)/curso-dj/twitter-image.tsx",
      "app/(marketing)/grabacion/page.tsx",
      "app/(marketing)/unete/page.tsx",
      "app/(marketing)/privacidad/page.tsx",
      "app/(marketing)/terminos/page.tsx",
      "app/(marketing)/(guias)/layout.tsx",
      "app/(marketing)/(guias)/aprender-dj/page.tsx",
      "app/(marketing)/(guias)/cuanto-cuesta-un-curso-de-dj/page.tsx",
      "app/(marketing)/(guias)/xdj-vs-controlador/page.tsx",
    ]) {
      expect(exists(p), p).toBe(true);
    }
    for (const p of ["app/page.tsx", "app/curso-dj", "app/(guias)", "app/grabacion", "app/unete", "app/privacidad", "app/terminos"]) {
      expect(exists(p), p).toBe(false);
    }
  });

  it("las rutas transaccionales viven bajo app/(booking)/ (incl. loading.tsx)", () => {
    for (const p of [
      "app/(booking)/layout.tsx",
      "app/(booking)/reservar/page.tsx",
      "app/(booking)/reservar/loading.tsx",
      "app/(booking)/reserva/estado/page.tsx",
    ]) {
      expect(exists(p), p).toBe(true);
    }
    expect(exists("app/reservar")).toBe(false);
    expect(exists("app/reserva")).toBe(false);
  });

  it("los archivos raíz fijos siguen en su sitio", () => {
    for (const p of [
      "app/layout.tsx",
      "app/globals.css",
      "app/error.tsx",
      "app/global-error.tsx",
      "app/not-found.tsx",
      "app/sitemap.ts",
      "app/robots.ts",
      "app/manifest.ts",
      "app/opengraph-image.tsx",
      "app/twitter-image.tsx",
      "app/apple-icon.tsx",
      "app/icon.svg",
      "app/_fonts/BigShoulders-900.ttf",
      "app/_fonts/JetBrainsMono-500.ttf",
      "app/cuenta/layout.tsx",
      "app/cuenta/login/layout.tsx",
      "app/cuenta/(panel)/layout.tsx",
      "app/admin/login/layout.tsx",
      "app/admin/(panel)/layout.tsx",
    ]) {
      expect(exists(p), p).toBe(true);
    }
  });

  it("todo <Footer /> y <ConsentReopenLink /> se renderiza bajo (marketing), donde vive el banner", () => {
    const footers = filesContaining("app", /<Footer\s*\/>/);
    expect(footers.length).toBeGreaterThanOrEqual(8);
    for (const f of [...footers, ...filesContaining("app", "<ConsentReopenLink")]) {
      expect(f.startsWith("app/(marketing)/"), f).toBe(true);
    }
  });

  it("app/(marketing)/page.tsx no exporta title (el title.template del root ya le aplica)", () => {
    const home = read("app/(marketing)/page.tsx");
    const block = home.match(/export const metadata: Metadata = \{([\s\S]*?)\n\};/);
    expect(block).not.toBeNull();
    expect(block?.[1] ?? "title").not.toMatch(/\btitle\b/);
  });

  it("lib/curso-content.ts existe y nadie importa ya app/curso-dj/_content", () => {
    expect(exists("lib/curso-content.ts")).toBe(true);
    expect(exists("app/(marketing)/curso-dj/_content.ts")).toBe(false);
    expect(filesContaining("app", "curso-dj/_content")).toEqual([]);
    expect(filesContaining("components", "curso-dj/_content")).toEqual([]);
    expect(filesContaining("app/(marketing)/curso-dj", /from "\.\.?\/_content"/)).toEqual([]);
  });
});

/** Cuerpo del bloque `@layer <name> { … }` (llaves anidadas) o "" si no existe. */
function layerBlock(css: string, name: string): string {
  const start = css.indexOf(`@layer ${name} {`);
  if (start === -1) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return css.slice(start);
}

describe("app/globals.css", () => {
  const raw = read("app/globals.css");
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

  it("ya no tiene html { scroll-behavior } global (vivía en @layer base)", () => {
    expect(layerBlock(css, "base")).not.toBe("");
    expect(layerBlock(css, "base")).not.toContain("scroll-behavior");
    expect(css).not.toMatch(/(^|\n)[ \t]*html[ \t]*\{/);
  });

  it("scopea el scroll suave a marketing con una regla sin capa (nivel raíz del archivo)", () => {
    const selector = 'html:has([data-surface="marketing"])';
    const idx = css.indexOf(selector);
    expect(idx).toBeGreaterThan(-1);
    const before = css.slice(0, idx);
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    expect(depth, "la regla debe estar fuera de @layer/@media/@supports").toBe(0);
    expect(css.slice(idx)).toMatch(/^html:has\(\[data-surface="marketing"\]\)\s*\{\s*scroll-behavior:\s*smooth;\s*\}/);
  });

  it("prefers-reduced-motion sigue forzando scroll-behavior: auto !important (sin capa)", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*?scroll-behavior: auto !important;/);
  });
});

describe("de-marketing (D6): PageHeader sin línea editorial", () => {
  it("PageHeader y su skeleton ya no conocen editorial", () => {
    expect(read("components/admin/ui/PageHeader.tsx")).not.toContain("editorial");
    const skeletons = read("components/admin/ui/skeletons.tsx");
    expect(skeletons).not.toContain("editorial");
    expect(skeletons).not.toContain('<Skeleton className="mt-3 h-4 w-48" />');
  });

  it("ningún call site pasa editorial=", () => {
    expect(filesContaining("app", "editorial=")).toEqual([]);
    expect(filesContaining("components", "editorial=")).toEqual([]);
  });
});

describe("de-marketing (D6): booth-glow solo en marketing", () => {
  it("booth-glow queda solo en CursoHero y la utilidad sigue definida en globals.css", () => {
    expect(filesContaining("app", "booth-glow")).toEqual(["app/(marketing)/curso-dj/_components/CursoHero.tsx"]);
    expect(filesContaining("components", "booth-glow")).toEqual([]);
    expect(read("app/globals.css")).toContain(".booth-glow {");
  });
});
