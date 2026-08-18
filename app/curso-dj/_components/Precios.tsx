import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import { formatCLP, PACK_EGRESADO } from "@/lib/pricing";
import { CURSO, PRECIOS, INCLUYE } from "../_content";

export default function Precios() {
  return (
    <Section id="precios">
      <SectionHead n="07" kicker="Precios" lines={["Primera", "generación."]} />

      {/* Scarcity line — gold, never Sirena (urgency-only per brand manual) */}
      <Reveal delay={120}>
        <p className="mt-8 label text-gold">
          {CURSO.generacion} · {CURSO.cupos} cupos · {CURSO.deadline}
        </p>
      </Reveal>

      <div className="mt-10 grid gap-3 md:grid-cols-2">
        {/* En dúo — the visually primary card */}
        <Reveal>
          <div className="flex h-full flex-col border border-gold bg-ink-soft/50">
            <div className="flex items-baseline justify-between gap-3 border-b border-gold/40 px-6 py-4">
              <span className="label text-gold">En dúo</span>
              <span className="label-sm text-bone-mute">2 personas · 1 cabina</span>
            </div>
            <div className="px-6 pt-6">
              <span className="font-display text-5xl text-gold md:text-6xl">
                {formatCLP(PRECIOS.duo)}
              </span>
              <span className="ml-3 label-sm text-bone-mute">por persona</span>
            </div>
            <ul className="mt-6 flex-1">
              {INCLUYE.map((item) => (
                <li key={item} className="flex gap-4 border-t hairline px-6 py-4">
                  <span aria-hidden className="font-display text-xl text-gold">
                    +
                  </span>
                  <span className="text-bone">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* Individual */}
        <Reveal delay={80}>
          <div className="flex h-full flex-col border hairline">
            <div className="flex items-baseline justify-between gap-3 border-b hairline px-6 py-4">
              <span className="label text-bone-mute">Individual</span>
              <span className="label-sm text-bone-mute">1 persona · la cabina para ti</span>
            </div>
            <div className="px-6 pt-6">
              <span className="font-display text-5xl text-bone md:text-6xl">
                {formatCLP(PRECIOS.individual)}
              </span>
            </div>
            <ul className="mt-6 flex-1">
              {INCLUYE.map((item) => (
                <li key={item} className="flex gap-4 border-t hairline px-6 py-4">
                  <span aria-hidden className="font-display text-xl text-gold">
                    +
                  </span>
                  <span className="text-bone">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>

      <Reveal delay={120}>
        <p className="mt-6 label-sm text-bone-mute">
          Mismo programa en ambos formatos · pago 100% anticipado · al terminar:
          Pack Egresado — {PACK_EGRESADO.hours} horas valle por {formatCLP(PACK_EGRESADO.price)}
        </p>
      </Reveal>
    </Section>
  );
}
