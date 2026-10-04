import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import { pageMetadata } from "@/lib/seo";
import { jsonLdHtml } from "@/lib/json-ld";
import { SITE, SITE_URL } from "@/lib/site";
import { FAQ, INSTRUCTOR, PRECIOS, PROGRAMA, RATING_MIN, SESIONES, TESTIMONIOS } from "@/lib/curso-content";
import { CURSO_ABIERTO } from "@/lib/flags";
import CursoPausado from "./_components/CursoPausado";
import { cursoDsFonts } from "./_ds/fonts";
import "./_ds/curso-ds.css";
import DsHeader from "./_components/DsHeader";
import DsHero from "./_components/DsHero";
import DsStats from "./_components/DsStats";
import DsPrograma from "./_components/DsPrograma";
import DsSala from "./_components/DsSala";
import DsDonde from "./_components/DsDonde";
import DsTestimonios from "./_components/DsTestimonios";
import DsLecturas from "./_components/DsLecturas";
import DsComoFunciona from "./_components/DsComoFunciona";
import DsPrecios from "./_components/DsPrecios";
import DsReserva from "./_components/DsReserva";
import DsFaq from "./_components/DsFaq";
import DsNovedades from "./_components/DsNovedades";
import DsFooter from "./_components/DsFooter";
import DsStickyCta from "./_components/DsStickyCta";

// ≤155 caracteres (lib/curso-dj-seo-contract.test.ts): Google corta lo que sobra.
const DESCRIPTION =
  "Curso de DJ 1:1 para principiantes en Viña del Mar: 6 clases en equipos Pioneer, 6 h de práctica libre y tu set final grabado. Precios publicados.";

// ISO 8601 durations for the Course schema, from the one program definition.
const SESSION_DURATION = `PT${Math.floor(PROGRAMA.minutosPorSesion / 60)}H${PROGRAMA.minutosPorSesion % 60}M`;

// En pausa la página conserva su URL y título (el ranking), pero no promete
// sesiones, horas ni cupos que se están redefiniendo.
const DESCRIPTION_PAUSA =
  "El curso de DJ de FOTF Studios en Viña del Mar se está rearmando como programa 1:1. Escríbenos por WhatsApp y te avisamos cuando abran las inscripciones.";

export const metadata: Metadata = pageMetadata({
  title: "Curso de DJ en Viña del Mar · Clases 1:1",
  description: CURSO_ABIERTO ? DESCRIPTION : DESCRIPTION_PAUSA,
  path: "/curso-dj",
});

// "Los Chercanes 78a" — la calle de SITE.address, igual que en el LocalBusiness de la home (NAP).
const STREET = SITE.address.split(",")[0];

/**
 * review + aggregateRating solo con RATING_MIN reseñas con nota, todas visibles en
 * DsTestimonios. Una sola reseña 5★ autopublicada se lee como inflada (y Google exige
 * que el rating marcado esté en la página).
 */
function ratingLd() {
  const rated = TESTIMONIOS.filter((t) => t.rating);
  if (rated.length < RATING_MIN) return {};
  const avg = rated.reduce((n, t) => n + (t.rating ?? 0), 0) / rated.length;
  return {
    aggregateRating: { "@type": "AggregateRating", ratingValue: Number(avg.toFixed(1)), reviewCount: rated.length, bestRating: 5 },
    review: rated.map((t) => ({
      "@type": "Review",
      author: { "@type": "Person", name: t.name },
      reviewBody: t.quote,
      reviewRating: { "@type": "Rating", ratingValue: t.rating, bestRating: 5 },
    })),
  };
}

// One entity graph: Course + FAQPage + BreadcrumbList. The provider node carries
// the same @id as the home page's LocalBusiness so Google merges them.
const courseLd = {
  "@context": "https://schema.org",
  "@type": "Course",
  "@id": `${SITE_URL}/curso-dj#curso`,
  name: "Curso de DJ en Viña del Mar",
  description:
    "Curso de DJ presencial 1:1 para principiantes en Viña del Mar: 6 sesiones de 90 minutos con un DJ en equipos Pioneer (XDJ-1000MK2, DJM-450), 6 horas de práctica libre y set final grabado en audio y video.",
  url: `${SITE_URL}/curso-dj`,
  image: [`${SITE_URL}/og/curso-dj.jpg`, `${SITE_URL}/photos/curso-equipos-1.jpg`],
  inLanguage: "es-CL",
  educationalLevel: "Beginner",
  teaches: SESIONES.map((s) => s.title),
  provider: {
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}/#negocio`,
    name: SITE.name,
    url: SITE_URL,
    telephone: `+${SITE.whatsapp}`,
    hasMap: SITE.mapsUrl,
    address: {
      "@type": "PostalAddress",
      streetAddress: STREET,
      postalCode: "2520000",
      addressLocality: SITE.city,
      addressRegion: SITE.region,
      addressCountry: "CL",
    },
  },
  offers: [
    {
      "@type": "Offer",
      name: "Individual (1:1)",
      price: PRECIOS.individual,
      priceCurrency: "CLP",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/curso-dj`,
    },
    {
      "@type": "Offer",
      name: "En dúo (precio por persona)",
      price: PRECIOS.duo,
      priceCurrency: "CLP",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/curso-dj`,
    },
    {
      "@type": "Offer",
      name: "Sesión de prueba guiada (1 hora)",
      price: PRECIOS.prueba,
      priceCurrency: "CLP",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/curso-dj`,
    },
  ],
  hasCourseInstance: {
    "@type": "CourseInstance",
    courseMode: "Onsite",
    courseWorkload: `PT${PROGRAMA.horasClase}H`,
    courseSchedule: {
      "@type": "Schedule",
      repeatCount: PROGRAMA.sesiones,
      repeatFrequency: "Weekly",
      duration: SESSION_DURATION,
    },
    location: {
      "@type": "Place",
      name: SITE.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: STREET,
        postalCode: "2520000",
        addressLocality: SITE.city,
        addressRegion: SITE.region,
        addressCountry: "CL",
      },
    },
  },
  ...(INSTRUCTOR && { instructor: { "@type": "Person", name: INSTRUCTOR.name, description: INSTRUCTOR.bio } }),
  ...ratingLd(),
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

// En pausa, solo el breadcrumb: Course/Offer con precios que ya no rigen sería
// marcado estructurado falso, y el FAQ describe el programa viejo.
const jsonLd = CURSO_ABIERTO ? [courseLd, faqLd, breadcrumbLd] : [breadcrumbLd];

export default function CursoDjPage() {
  const ld = (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
  );

  // Abierto: el design system de Claude Design (_ds/), acotado a este wrapper.
  // Sin transform/filter/backdrop-filter aquí: sería el containing block del cursor
  // y del banner de consentimiento (position: fixed).
  if (CURSO_ABIERTO) {
    return (
      <div className={`curso-ds ${cursoDsFonts} min-h-screen`}>
        {ld}
        <DsHeader />
        <main>
          <DsHero />
          <DsStats />
          <DsPrograma />
          <DsSala />
          <DsDonde />
          <DsComoFunciona />
          <DsPrecios />
          <DsReserva />
          <DsTestimonios />
          <DsFaq />
          <DsLecturas />
          <DsNovedades />
        </main>
        <DsFooter />
        <DsStickyCta />
      </div>
    );
  }

  // En pausa: la marca del sitio de siempre.
  return (
    <>
      {ld}
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
        <CursoPausado />
      </main>
      <Footer />
    </>
  );
}
