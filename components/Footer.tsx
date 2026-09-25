import Link from "next/link";
import Logo from "./Logo";
import { footerArticleLinks } from "@/lib/articles/footer-links";
import { articleHref } from "@/lib/articles/href";
import { draftsVisible, getArticles, publishedArticles } from "@/lib/articles/registry";
import { accountEnabled, CURSO_ABIERTO } from "@/lib/flags";
import { GUIDES, GUIDE_SLUGS } from "@/lib/guides";
import { SITE } from "@/lib/site";
import ConsentReopenLink from "./ConsentReopenLink";
import WhatsAppCta from "./WhatsAppCta";

/**
 * Componente de SERVIDOR: por eso puede leer los registros de guías y artículos.
 * Si alguna vez necesitara "use client", estas listas tendrían que bajar por props —
 * lib/blog-contract.test.ts prohíbe que el registro de guías llegue al bundle del cliente.
 */
export default function Footer() {
  const year = 2026;
  const articulos = footerArticleLinks(publishedArticles(getArticles(), draftsVisible()));
  return (
    <footer className="border-t hairline bg-ink">
      <div className="mx-auto max-w-[1280px] px-5 py-16 md:px-10">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo variant="lockup" height={92} />
            <p className="font-editorial mt-6 max-w-xs text-lg text-bone-dim">
              El pulso, documentado.
            </p>
          </div>

          <div>
            <span className="label-sm text-bone-mute">Contacto</span>
            <ul className="mt-4 space-y-3">
              <li>
                <WhatsAppCta source="footer" className="text-bone transition-colors hover:text-gold">
                  WhatsApp
                </WhatsAppCta>
              </li>
              <li>
                <a
                  href={SITE.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bone transition-colors hover:text-gold"
                >
                  @{SITE.instagram}
                </a>
              </li>
              <li>
                <a
                  href={SITE.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bone transition-colors hover:text-gold"
                >
                  Cómo llegar
                </a>
              </li>
              {CURSO_ABIERTO && (
                <li>
                  <Link href="/curso-dj" className="text-bone transition-colors hover:text-gold">
                    Curso de DJ · Viña del Mar
                  </Link>
                </li>
              )}
              <li>
                <Link href="/grabacion" className="text-bone transition-colors hover:text-gold">
                  Graba tu set
                </Link>
              </li>
              <li>
                <Link href="/unete" className="text-bone transition-colors hover:text-gold">
                  Súmate al equipo
                </Link>
              </li>
              {accountEnabled() && (
                <li>
                  <Link href="/cuenta" className="text-bone transition-colors hover:text-gold">
                    Mi cuenta
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <span className="label-sm text-bone-mute">Sala</span>
            <p className="mt-4 text-sm leading-relaxed text-bone-dim">
              {SITE.address}
            </p>
            <p className="mt-2 text-sm text-bone-mute">
              Sala de ensayo de DJ por hora · aislada acústicamente.
            </p>

            <span className="label-sm mt-8 block text-bone-mute">Guías</span>
            <ul className="mt-4 space-y-3">
              {GUIDE_SLUGS.map((slug) => (
                <li key={slug}>
                  <Link href={GUIDES[slug].path} className="text-bone transition-colors hover:text-gold">
                    {GUIDES[slug].title} (PDF gratis)
                  </Link>
                </li>
              ))}
              {/* articleHref: el path nace en el frontmatter, o sea en un archivo del
                  disco. Mismo cinturón que ArticleCard y RelatedArticles. */}
              {articulos.map((a) => (
                <li key={a.href}>
                  <Link href={articleHref(a.href)} className="text-bone transition-colors hover:text-gold">
                    {a.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/blog" className="label-sm text-bone-mute transition-colors hover:text-gold">
                  Todos los artículos →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t hairline pt-6 md:flex-row md:items-center md:justify-between">
          <span className="label-sm text-bone-mute">
            @{SITE.instagram} · {SITE.city}, {SITE.region} · {SITE.country}
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/terminos"
              className="label-sm text-bone-mute transition-colors hover:text-gold"
            >
              Términos
            </Link>
            <Link
              href="/privacidad"
              className="label-sm text-bone-mute transition-colors hover:text-gold"
            >
              Privacidad
            </Link>
            <ConsentReopenLink />
            <span className="label-sm text-bone-mute">
              © {year} {SITE.name} · {SITE.full}
            </span>
          </div>
        </div>

        <p className="mt-6 label-sm text-bone-mute">
          Diseñado y desarrollado por{" "}
          <a
            href="https://www.biznize.cl"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bone-dim transition-colors hover:text-gold"
          >
            Biznize
          </a>
        </p>
      </div>
    </footer>
  );
}
