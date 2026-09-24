import Link from "next/link";
import BrandImage from "@/components/BrandImage";
import MeterBars from "@/components/MeterBars";
import Reveal from "@/components/Reveal";
import { Section, SectionHead } from "@/components/Section";
import { COPY } from "@/lib/guia-pendrive-content";
import { getPhotos, guiaPendrivePhoto } from "@/lib/photos";

/**
 * "Prueba tu pendrive antes del evento": el puente de la guía a la sala. Es un enlace
 * secundario (borde, no relleno) — el pedido de la página sigue siendo el correo.
 */
export default function EstudioBloque() {
  const photo = guiaPendrivePhoto(getPhotos());

  return (
    <div className="border-t hairline">
      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <MeterBars bars={3} className="text-[15px] text-gold" />
            <SectionHead n="02" kicker="La sala" lines={[...COPY.estudio.h2]} className="mt-6" />
            <Reveal delay={120}>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-bone-dim">{COPY.estudio.body}</p>
              <Link
                href="/reservar"
                className="group label mt-8 inline-flex items-center gap-3 border border-bone/40 px-7 py-4 text-bone transition-colors hover:border-gold hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {COPY.estudio.cta}
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </Reveal>
          </div>

          {photo && (
            <Reveal delay={160}>
              <div className="relative aspect-[4/3]">
                <div className="absolute inset-0">
                  <BrandImage src={photo.src} alt={photo.alt} sizes="(max-width: 1024px) 90vw, 600px" className="h-full w-full" />
                </div>
              </div>
            </Reveal>
          )}
        </div>
      </Section>
    </div>
  );
}
