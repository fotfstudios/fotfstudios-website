import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import BrandImage from "@/components/BrandImage";
import HeroVideo from "@/components/HeroVideo";
import { getPhotos, grabacionSesionPhotos } from "@/lib/photos";

/** Foto · video · foto de una sesión real: la prueba de lo que se llevan. */
export default function LaSesion() {
  const [foto1, foto2] = grabacionSesionPhotos(getPhotos());

  return (
    <Section id="la-sesion">
      <SectionHead n="03" kicker="La sesión" lines={["Así se ve", "tu sesión."]} />

      <Reveal delay={80}>
        <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
          Una cabina, una cámara, tu set.
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
            webm="/video/grabacion-sesion.webm"
            mp4="/video/grabacion-sesion.mp4"
            poster="/video/grabacion-sesion-poster.jpg"
            alt="Video de una sesión de grabación de DJ set en la cabina de FOTF Studios"
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
