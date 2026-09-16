import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import BrandImage from "@/components/BrandImage";
import HeroVideo from "@/components/HeroVideo";
import { getPhotos, cursoClasePhotos } from "@/lib/photos";

/** Foto · video · foto de práctica real en la sala: así se ve una clase. */
export default function LaClase() {
  const [foto1, foto2] = cursoClasePhotos(getPhotos());

  return (
    <Section id="la-clase">
      <SectionHead n="04" kicker="La clase" lines={["Así se ve", "una clase."]} />

      <Reveal delay={80}>
        <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
          Equipos reales, apuntes reales.
        </p>
      </Reveal>

      <Reveal delay={120} className="mt-10 grid gap-3 sm:grid-cols-3">
        {foto1 && (
          <BrandImage
            src={foto1.src}
            alt={foto1.alt}
            sizes="(max-width: 640px) 100vw, 33vw"
            scrim="bottom"
            className="aspect-[3/4] w-full border hairline"
          />
        )}
        <div className="relative aspect-[3/4] w-full overflow-hidden border hairline bg-ink-soft">
          <HeroVideo
            webm="/video/curso-clase.webm"
            mp4="/video/curso-clase.mp4"
            poster="/video/curso-clase-poster.jpg"
            alt="Video de práctica en el mixer durante una clase del curso de DJ"
            className="img-grade"
            preload="metadata"
          />
        </div>
        {foto2 && (
          <BrandImage
            src={foto2.src}
            alt={foto2.alt}
            sizes="(max-width: 640px) 100vw, 33vw"
            scrim="bottom"
            className="aspect-[3/4] w-full border hairline"
          />
        )}
      </Reveal>
    </Section>
  );
}
