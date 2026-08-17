import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import { SITE, SITE_URL } from "@/lib/site";
import { FAQ, PRECIOS } from "./_content";
import CursoHero from "./_components/CursoHero";
import Resultado from "./_components/Resultado";
import ParaQuien from "./_components/ParaQuien";
import Sesiones from "./_components/Sesiones";
import Equipos from "./_components/Equipos";
import Precios from "./_components/Precios";
import Prueba from "./_components/Prueba";
import Faq from "./_components/Faq";
import CierreCurso from "./_components/CierreCurso";

const DESCRIPTION =
  "Curso de DJ para principiantes en Viña del Mar: 4 sesiones en equipos Pioneer reales, 12 horas de estudio y tu set final grabado en audio y video. 6 cupos por generación.";

export const metadata: Metadata = {
  title: "Curso de DJ en Viña del Mar",
  description: DESCRIPTION,
  alternates: { canonical: "/curso-dj" },
  openGraph: {
    title: "Curso de DJ en Viña del Mar · FOTF Studios",
    description: DESCRIPTION,
    url: "/curso-dj",
    siteName: "FOTF Studios",
    locale: "es_CL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Curso de DJ en Viña del Mar · FOTF Studios",
    description: DESCRIPTION,
  },
};

// One entity graph: Course + FAQPage + BreadcrumbList. The provider node carries
// the same @id as the home page's LocalBusiness so Google merges them.
const courseLd = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "Curso de DJ en Viña del Mar",
  description:
    "Curso de DJ presencial para principiantes en Viña del Mar: 4 sesiones de 2 horas en equipos Pioneer (XDJ-1000MK2, DJM-450), 4 horas de práctica libre y set final grabado en audio y video.",
  url: `${SITE_URL}/curso-dj`,
  inLanguage: "es-CL",
  provider: {
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}/#negocio`,
    name: SITE.name,
    url: SITE_URL,
    address: {
      "@type": "PostalAddress",
      addressLocality: SITE.city,
      addressRegion: SITE.region,
      addressCountry: "CL",
    },
  },
  offers: [
    {
      "@type": "Offer",
      name: "En dúo (precio por persona)",
      price: PRECIOS.duo,
      priceCurrency: "CLP",
      availability: "https://schema.org/LimitedAvailability",
      url: `${SITE_URL}/curso-dj`,
    },
    {
      "@type": "Offer",
      name: "Individual",
      price: PRECIOS.individual,
      priceCurrency: "CLP",
      availability: "https://schema.org/LimitedAvailability",
      url: `${SITE_URL}/curso-dj`,
    },
    {
      "@type": "Offer",
      name: "Sesión de prueba guiada (1 hora)",
      price: PRECIOS.prueba,
      priceCurrency: "CLP",
      url: `${SITE_URL}/curso-dj`,
    },
  ],
  hasCourseInstance: {
    "@type": "CourseInstance",
    courseMode: "Onsite",
    courseWorkload: "PT12H",
    courseSchedule: {
      "@type": "Schedule",
      repeatCount: 4,
      repeatFrequency: "Weekly",
      duration: "PT2H",
    },
    location: {
      "@type": "Place",
      name: SITE.name,
      address: {
        "@type": "PostalAddress",
        addressLocality: SITE.city,
        addressRegion: SITE.region,
        addressCountry: "CL",
      },
    },
  },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
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
    { "@type": "ListItem", position: 2, name: "Curso de DJ", item: `${SITE_URL}/curso-dj` },
  ],
};

const jsonLd = [courseLd, faqLd, breadcrumbLd];

export default function CursoDjPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Minimal header on purpose: the page's only conversion action is
          WhatsApp, so no site Nav (it embeds the Reservar booking CTA). */}
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

      <main>
        <CursoHero />
        <Resultado />
        <ParaQuien />
        <Sesiones />
        <Equipos />
        <Precios />
        <Prueba />
        {/* TESTIMONIOS: real student quotes/sets go here once generation 01
            exists — deliberately no empty social proof until then. */}
        <Faq />
        <CierreCurso />
      </main>
      <Footer />
    </>
  );
}
