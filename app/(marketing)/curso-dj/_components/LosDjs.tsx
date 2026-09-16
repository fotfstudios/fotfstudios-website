import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import BrandImage from "@/components/BrandImage";
import { getPhotos, cursoDjsPhotos } from "@/lib/photos";

/** Mosaico de sesiones reales en la cabina: prueba social antes de los precios. */
export default function LosDjs() {
  const fotos = cursoDjsPhotos(getPhotos());
  if (fotos.length === 0) return null;

  return (
    <Section id="en-la-cabina">
      <SectionHead n="06" kicker="En la cabina" lines={["Se aprende", "tocando."]} />

      <Reveal delay={80}>
        <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
          La misma cabina donde vas a practicar.
        </p>
      </Reveal>

      <Reveal delay={120} className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {fotos.map((f) => (
          <BrandImage
            key={f.src}
            src={f.src}
            alt={f.alt}
            sizes="(max-width: 768px) 50vw, 25vw"
            scrim="bottom"
            className="aspect-[3/4] w-full border hairline"
          />
        ))}
      </Reveal>
    </Section>
  );
}
