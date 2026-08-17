import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import MaskText from "@/components/MaskText";
import Magnetic from "@/components/Magnetic";
import MeterBars from "@/components/MeterBars";
import { SITE, SITE_URL } from "@/lib/site";
import { RECORDING_SESSIONS } from "@/lib/pricing";
import WhatsAppCta from "./_components/WhatsAppCta";
import Formatos from "./_components/Formatos";
import QueIncluye from "./_components/QueIncluye";
import CierreGrabacion from "./_components/CierreGrabacion";

export const metadata: Metadata = {
  title: "Grabación de Sets",
  description:
    "Graba tu DJ set en una cabina real en Viña del Mar: audio desde $29.990, audio + video desde $49.990. Captura directa, entrega en 48 horas.",
  alternates: { canonical: "/grabacion" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Grabación de Sets",
  description:
    "Sesión de grabación de DJ set en cabina real en Viña del Mar: captura directa en audio o audio + video, entrega digital dentro de 48 horas.",
  url: `${SITE_URL}/grabacion`,
  inLanguage: "es-CL",
  provider: {
    "@type": "LocalBusiness",
    name: SITE.name,
    url: SITE_URL,
  },
  areaServed: {
    "@type": "City",
    name: SITE.city,
  },
  offers: [
    ...RECORDING_SESSIONS.audio.map((s) => ({
      "@type": "Offer",
      name: `Grabación de audio · ${s.hours}h`,
      price: s.price,
      priceCurrency: "CLP",
      url: `${SITE_URL}/grabacion`,
    })),
    ...RECORDING_SESSIONS.audioVideo.map((s) => ({
      "@type": "Offer",
      name: `Grabación audio + video · ${s.hours}h`,
      price: s.price,
      priceCurrency: "CLP",
      url: `${SITE_URL}/grabacion`,
    })),
  ],
};

export default function GrabacionPage() {
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
        <section className="grain booth-glow relative isolate flex min-h-[70svh] flex-col justify-center overflow-hidden">
          <div className="mx-auto w-full max-w-[1280px] px-5 pt-28 pb-16 md:px-10">
            <div className="rise flex items-center gap-4" style={{ animationDelay: "0.05s" }}>
              <MeterBars className="text-[15px] text-gold" />
              <span className="label text-bone-dim">
                Sesión de Grabación · {SITE.city}
              </span>
            </div>

            <MaskText
              as="h1"
              immediate
              baseDelay={140}
              lines={[
                "Graba tu set",
                <span key="g" className="text-gold">
                  en una cabina real
                </span>,
              ]}
              className="font-display mt-7 max-w-5xl text-bone text-[clamp(2.6rem,9vw,7rem)]"
            />

            <p
              className="rise font-editorial mt-6 max-w-xl text-2xl text-bone-dim md:text-3xl"
              style={{ animationDelay: "0.2s" }}
            >
              Sales con el archivo, no con el recuerdo.
            </p>

            <div className="rise mt-10" style={{ animationDelay: "0.34s" }}>
              <Magnetic>
                <WhatsAppCta
                  source="hero"
                  className="group inline-flex items-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform"
                >
                  Agenda tu sesión por WhatsApp
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </WhatsAppCta>
              </Magnetic>
            </div>
          </div>
        </section>

        <Formatos />
        <QueIncluye />
        <CierreGrabacion />
      </main>
      <Footer />
    </>
  );
}
