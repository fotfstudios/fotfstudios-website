import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { FAQ_GUIA, GUIA } from "@/lib/guia-content";
import { SITE_URL } from "@/lib/site";
import CierreGuia from "./_components/CierreGuia";
import FaqGuia from "./_components/FaqGuia";
import Fragmento from "./_components/Fragmento";
import GuiaHero from "./_components/GuiaHero";
import { GuiaLeadProvider } from "./_components/LeadState";
import ParaQuienGuia from "./_components/ParaQuienGuia";
import Temas from "./_components/Temas";

const TITLE = `${GUIA.title} gratis (PDF)`;

export const metadata: Metadata = {
  title: TITLE,
  description: GUIA.description,
  alternates: { canonical: "/guia-dj" },
  openGraph: {
    title: `${TITLE} · FOTF Studios`,
    description: GUIA.description,
    url: "/guia-dj",
    siteName: "FOTF Studios",
    locale: "es_CL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · FOTF Studios`,
    description: GUIA.description,
  },
};

// FAQPage + BreadcrumbList (mismo par que /curso-dj). Sin Course/Product: no se vende nada.
const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_GUIA.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: GUIA.title, item: `${SITE_URL}/guia-dj` },
  ],
};

const jsonLd = [faqLd, breadcrumbLd];

export default function GuiaDjPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Landing sin Nav (una sola acción: dejar el correo). Mini + vuelta al sitio, como
          /curso-dj y /grabacion: el lockup del repo es cuadrado (barras + OTF + STUDIOS
          apilados) y a 30–40 px no se lee; el de la maqueta era horizontal. */}
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

      <GuiaLeadProvider>
        <main>
          <GuiaHero />
          <Temas />
          <Fragmento />
          <ParaQuienGuia />
          <FaqGuia />
          <CierreGuia />
        </main>
      </GuiaLeadProvider>
      <Footer />
    </>
  );
}
