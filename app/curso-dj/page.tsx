import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import { SITE, SITE_URL } from "@/lib/site";
import { PRECIOS } from "./_content";
import CursoHero from "./_components/CursoHero";
import Resultado from "./_components/Resultado";
import ParaQuien from "./_components/ParaQuien";
import Sesiones from "./_components/Sesiones";
import Equipos from "./_components/Equipos";
import Precios from "./_components/Precios";
import Prueba from "./_components/Prueba";
import Faq from "./_components/Faq";
import CierreCurso from "./_components/CierreCurso";

export const metadata: Metadata = {
  title: "Curso de Iniciación DJ",
  description:
    "Aprende a mezclar en equipos Pioneer reales en Viña del Mar: 4 sesiones, 12 horas de estudio y tu set final grabado en audio y video. 6 cupos por generación.",
  alternates: { canonical: "/curso-dj" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "Curso de Iniciación DJ",
  description:
    "Curso presencial de iniciación DJ en Viña del Mar: 4 sesiones de 2 horas en equipos Pioneer (XDJ-1000MK2, DJM-450), 4 horas de práctica libre y set final grabado en audio y video.",
  url: `${SITE_URL}/curso-dj`,
  inLanguage: "es-CL",
  provider: {
    "@type": "LocalBusiness",
    name: SITE.name,
    url: SITE_URL,
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
