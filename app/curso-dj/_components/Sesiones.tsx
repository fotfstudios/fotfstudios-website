import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import { SESIONES } from "../_content";

export default function Sesiones() {
  return (
    <Section id="sesiones">
      <SectionHead n="03" kicker="Las 4 sesiones" lines={["Cuatro sesiones,", "un método."]} />

      <Reveal delay={120}>
        <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
          Cada sesión termina con algo que ya sabes hacer.
        </p>
      </Reveal>

      <Reveal delay={80} className="mt-12">
        <div className="border hairline">
          {SESIONES.map((s) => (
            <div
              key={s.n}
              className="group border-b hairline px-6 py-6 transition-colors last:border-b-0 hover:bg-ink"
            >
              <div className="flex items-baseline gap-4">
                <span className="font-display text-2xl text-gold md:text-3xl">{s.n}</span>
                <h3 className="font-display text-2xl text-bone transition-colors group-hover:text-gold md:text-3xl">
                  {s.title}
                </h3>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bone-dim md:text-base">
                {s.line}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
