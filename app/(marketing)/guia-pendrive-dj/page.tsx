import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { GuiaLeadProvider } from "@/components/guides/LeadState";
import { COPY, GUIA_PENDRIVE } from "@/lib/guia-pendrive-content";
import { jsonLdHtml } from "@/lib/json-ld";
import { pageMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import Adelanto from "./_components/Adelanto";
import Desbloquear from "./_components/Desbloquear";
import EstudioBloque from "./_components/EstudioBloque";
import PendriveHero from "./_components/PendriveHero";

const PATH = "/guia-pendrive-dj";

export const metadata: Metadata = pageMetadata({
  title: `${GUIA_PENDRIVE.title}: guía gratis (PDF)`,
  description: GUIA_PENDRIVE.description,
  path: PATH,
});

// Solo BreadcrumbList: la página no tiene FAQ, y no se vende nada (sin Product/Course).
const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: GUIA_PENDRIVE.title, item: `${SITE_URL}${PATH}` },
  ],
};

export default function GuiaPendrivePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />

      {/* Landing sin Nav (una sola acción: dejar el correo). Mini + vuelta al sitio, igual
          que /guia-dj. */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 pt-6 md:px-10">
          <Link
            href="/"
            aria-label="FOTF Studios — volver al inicio"
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <Logo variant="mini" height={40} />
          </Link>
          <Link
            href="/"
            className="label-sm text-bone-mute transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            ← FOTF Studios
          </Link>
        </div>
      </header>

      <GuiaLeadProvider copy={COPY.form}>
        <main>
          <PendriveHero />
          <Adelanto />
          <Desbloquear />
          <EstudioBloque />
        </main>
      </GuiaLeadProvider>
      <Footer />
    </>
  );
}
