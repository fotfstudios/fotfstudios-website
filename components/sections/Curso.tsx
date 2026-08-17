import Link from "next/link";
import { Section, SectionHead } from "../Section";
import Reveal from "../Reveal";
import Magnetic from "../Magnetic";
import { formatCLP } from "@/lib/pricing";
import { CURSO, PRECIOS } from "@/app/curso-dj/_content";

/**
 * Home cross-sell for the course. The CTA routes to /curso-dj — the landing
 * page owns the WhatsApp conversion (and its click analytics), not the home.
 */
export default function Curso() {
  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="curso">
        <SectionHead n="07" kicker="Curso de Iniciación DJ" lines={["¿Partiendo", "de cero?"]} />

        <Reveal delay={120}>
          <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
            La misma cabina, ahora con método.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-bone-dim">
            4 sesiones en equipos Pioneer reales, práctica libre y tu set final
            grabado en audio y video. {CURSO.generacion} · {CURSO.cupos} cupos.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
          {[
            ["Programa", "4 sesiones · 12 hrs", false],
            ["Cierre", "Set final grabado", false],
            ["Desde · por persona", formatCLP(PRECIOS.duo), true],
          ].map(([k, v, gold]) => (
            <div key={String(k)} className="border hairline px-5 py-4">
              <div className="label-sm text-bone-mute">{k}</div>
              <div className={`mt-1 font-display text-xl md:text-2xl ${gold ? "text-gold" : "text-bone"}`}>
                {v}
              </div>
            </div>
          ))}
        </Reveal>

        <Reveal delay={120} className="mt-10">
          <Magnetic>
            <Link
              href="/curso-dj"
              className="group inline-flex items-center gap-3 bg-gold px-8 py-4 label text-ink transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Conoce el curso
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </Magnetic>
        </Reveal>
      </Section>
    </div>
  );
}
