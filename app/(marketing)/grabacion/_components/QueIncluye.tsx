import Link from "next/link";
import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import BrandImage from "@/components/BrandImage";
import { getPhotos, grabacionPhotos } from "@/lib/photos";
import { GRABACION } from "../_content";

const INCLUYE = [
  "Cabina completa",
  "Niveles ajustados antes de partir",
  GRABACION.entrega,
  "El material es tuyo",
] as const;

export default function QueIncluye() {
  const fotos = grabacionPhotos(getPhotos());

  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="que-incluye">
        <SectionHead n="02" kicker="Qué incluye" lines={["Llegas y está", "todo listo."]} />

        <Reveal delay={80} className="mt-10">
          <ul className="border hairline">
            {INCLUYE.map((item) => (
              <li key={item} className="flex gap-4 border-b hairline px-6 py-5 last:border-b-0">
                <span aria-hidden className="font-display text-xl text-gold">
                  +
                </span>
                <span className="text-lg text-bone">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-bone-mute">
            {GRABACION.diyNote}
          </p>
          <p className="mt-3 label-sm text-bone-mute">
            ¿Partiendo de cero?{" "}
            <Link
              href="/curso-dj"
              className="text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold"
            >
              Curso de DJ en Viña del Mar →
            </Link>
          </p>
        </Reveal>

        {fotos.length > 0 && (
          <Reveal delay={100} className="mt-10 grid gap-3 sm:grid-cols-2">
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
      </Section>
    </div>
  );
}
