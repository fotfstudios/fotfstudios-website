import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import BrandImage from "@/components/BrandImage";
import { GEAR } from "@/lib/site";
import { getPhotos, cursoPhotos } from "@/lib/photos";

export default function Equipos() {
  const fotos = cursoPhotos(getPhotos()).slice(0, 2);

  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="equipos">
        <SectionHead n="05" kicker="Los equipos" lines={["Cabina real,", "modelos exactos."]} />

        <Reveal delay={120}>
          <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
            Aprendes en el equipo que te vas a encontrar afuera.
          </p>
        </Reveal>

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

        {fotos.length > 0 && (
          <Reveal delay={100} className="mt-3 grid gap-3 sm:grid-cols-2">
            {fotos.map((f) => (
              <BrandImage
                key={f.src}
                src={f.src}
                alt={f.alt}
                sizes="(max-width: 640px) 100vw, 50vw"
                scrim="bottom"
                className="aspect-[4/3] w-full border hairline"
              />
            ))}
          </Reveal>
        )}

        <Reveal delay={120}>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-bone-mute">
            Sala aislada acústicamente: ensayas a volumen real, sin molestar a
            nadie. Traes tus audífonos y un USB; el resto está montado y sonando.
          </p>
        </Reveal>
      </Section>
    </div>
  );
}
