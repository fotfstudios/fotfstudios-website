import { Section, SectionHead } from "../Section";
import Reveal from "../Reveal";
import BrandImage from "../BrandImage";
import { GEAR } from "@/lib/site";
import { getPhotos, gearHighlights } from "@/lib/photos";

export default function Equipo() {
  const gear = gearHighlights(getPhotos());

  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="equipo">
        <SectionHead n="02" kicker="Equipo" lines={["Lo que vas", "a tener bajo", "las manos."]} />

        <Reveal delay={120}>
          <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
            Decimos el modelo exacto. Nada de generalidades.
          </p>
        </Reveal>

        {/* Spec sheet */}
        <Reveal delay={80} className="mt-12">
          <div className="border hairline">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b hairline bg-ink px-6 py-4 label-sm text-bone-mute">
              <span>Cant.</span>
              <span>Modelo</span>
              <span className="text-right">Función</span>
            </div>
            {GEAR.map((g) => (
              <div
                key={g.model}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b hairline px-6 py-6 transition-colors last:border-b-0 hover:bg-ink"
              >
                <span className="font-display text-3xl text-gold md:text-4xl">{g.qty}</span>
                <span className="font-display text-2xl text-bone transition-colors group-hover:text-gold md:text-3xl">
                  {g.model}
                </span>
                <span className="label-sm text-right text-bone-mute">{g.role}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Close-ups del equipo — el equipo es el héroe */}
        {gear.length > 0 && (
          <Reveal delay={100} className="mt-3 grid gap-3 sm:grid-cols-3">
            {gear.map((g) => (
              <div key={g.src} className="relative">
                <BrandImage
                  src={g.src}
                  alt={g.alt}
                  sizes="(max-width: 640px) 100vw, 33vw"
                  scrim="bottom"
                  className="aspect-[4/5] w-full border hairline"
                />
                {g.gearModel && (
                  <span className="label-sm absolute bottom-3 left-3 z-[1] text-gold">
                    {g.gearModel}
                  </span>
                )}
              </div>
            ))}
          </Reveal>
        )}

        <Reveal delay={120}>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-bone-mute">
            Conexión por RCA y USB. Monitores de estudio para escuchar lo que
            realmente vas a entregar, no una versión maquillada. Traes tus
            audífonos; el resto está montado y sonando.
          </p>
        </Reveal>
      </Section>
    </div>
  );
}
