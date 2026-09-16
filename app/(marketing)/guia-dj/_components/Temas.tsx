import Reveal from "@/components/Reveal";
import { Section, SectionHead } from "@/components/Section";
import { COPY, TEMAS } from "@/lib/guia-content";

/** Los diez temas del PDF en dos columnas: número mono en Gold, título, una línea. */
export default function Temas() {
  return (
    <Section id="temas">
      <SectionHead n="01" kicker={COPY.temas.eyebrow} lines={[...COPY.temas.h2]} />

      <Reveal delay={80} className="mt-12">
        <ol className="grid border-b hairline md:grid-cols-2 md:gap-x-16">
          {TEMAS.map((t) => (
            <li
              key={t.n}
              className="group flex gap-5 border-t hairline py-5 transition-colors hover:bg-ink-soft/40 md:gap-6"
            >
              <span className="w-7 flex-none pt-1 font-mono text-sm text-gold">{t.n}</span>
              <div className="min-w-0">
                <h3 className="text-lg font-medium text-bone transition-colors group-hover:text-gold">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-bone-quiet">{t.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>
    </Section>
  );
}
