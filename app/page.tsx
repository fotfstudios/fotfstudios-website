import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Sala from "@/components/sections/Sala";
import Equipo from "@/components/sections/Equipo";
import Galeria from "@/components/sections/Galeria";
import Ticker from "@/components/Ticker";
import Como from "@/components/sections/Como";
import Precio from "@/components/sections/Precio";
import Ubicacion from "@/components/sections/Ubicacion";
import CierreCTA from "@/components/sections/CierreCTA";
import Footer from "@/components/Footer";
import { SITE, PRICING } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: SITE.name,
  description:
    "Sala de ensayo de DJ por hora en Viña del Mar. Aislada acústicamente, equipo Pioneer y monitores de estudio. Plug & play, acceso autogestionado.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Los Chercanes 78a",
    addressLocality: SITE.city,
    addressRegion: SITE.region,
    addressCountry: "CL",
  },
  areaServed: ["Viña del Mar", "Valparaíso", "Santiago"],
  priceRange: PRICING.priceRange,
  sameAs: [SITE.instagramUrl],
  url: "https://fotfstudios.cl",
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <Sala />
        <Equipo />
        <Galeria />
        <Como />
        <Precio />
        <Ubicacion />
        <Ticker reverse />
        <CierreCTA />
      </main>
      <Footer />
    </>
  );
}
