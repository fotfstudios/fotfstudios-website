import Reveal from "@/components/Reveal";
import { Section, SectionHead } from "@/components/Section";
import { COPY, PARA_QUIEN_GUIA } from "@/lib/guia-content";

/**
 * Misma tarjeta y tipografía en ambas columnas (la del "no" acota, no advierte). Un solo
 * acento: ✓ en Gold; la ✕ va en bone-quiet — nunca dos colores de marca al mismo nivel.
 */
export default function ParaQuienGuia() {
  return (
    <Section id="para-quien">
      <SectionHead n="03" kicker={COPY.paraQuien.eyebrow} lines={[...COPY.paraQuien.h2]} />

      <div className="mt-12 grid gap-3 md:grid-cols-2">
        <Reveal>
          <div className="h-full border hairline">
            <div className="border-b hairline px-6 py-4 label text-gold">{COPY.paraQuien.sirve}</div>
            <ul>
              {PARA_QUIEN_GUIA.sirve.map((item) => (
                <li key={item} className="flex gap-4 border-b hairline px-6 py-5 last:border-b-0">
                  <span aria-hidden className="font-display text-xl text-gold">
                    ✓
                  </span>
                  <span className="text-lg text-bone">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="h-full border hairline">
            <div className="border-b hairline px-6 py-4 label text-bone-mute">{COPY.paraQuien.noSirve}</div>
            <ul>
              {PARA_QUIEN_GUIA.noSirve.map((item) => (
                <li key={item} className="flex gap-4 border-b hairline px-6 py-5 last:border-b-0">
                  <span aria-hidden className="font-display text-xl text-bone-quiet">
                    ✕
                  </span>
                  <span className="text-lg text-bone">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
