import { Section, SectionHead } from "../Section";
import Reveal from "../Reveal";
import { STEPS } from "@/lib/site";

export default function Como() {
  return (
    <Section id="como">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHead n="04" kicker="Cómo funciona" lines={["Tres pasos,", "sin fricción."]} />
          <Reveal delay={120}>
            <p className="font-editorial mt-8 text-2xl leading-snug text-bone-dim">
              Llegas, tocas, te vas. Sin montar, sin pedir nada.
            </p>
          </Reveal>
        </div>

        <ol className="relative">
          {/* línea guía */}
          <span
            aria-hidden
            className="absolute left-[1.15rem] top-3 bottom-3 w-px bg-[var(--color-ink-line)] md:left-[1.4rem]"
          />
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90} className="relative pl-16 md:pl-20">
              {/* nodo */}
              <span className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center bg-gold md:h-11 md:w-11">
                <span className="font-display text-lg text-ink md:text-xl">{i + 1}</span>
              </span>
              <div className={`pb-12 ${i === STEPS.length - 1 ? "pb-0" : ""}`}>
                <span className="label-sm text-gold">Paso {s.n}</span>
                <h3 className="font-display mt-2 text-4xl text-bone md:text-5xl">{s.title}</h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-bone-dim">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
