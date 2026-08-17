import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import Magnetic from "@/components/Magnetic";
import { formatCLP } from "@/lib/pricing";
import { PRECIOS } from "../_content";
import WhatsAppCta from "./WhatsAppCta";

/** The low-friction entry point — a full section by design, not a footnote. */
export default function Prueba() {
  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="prueba">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div>
            <SectionHead
              n="06"
              kicker="Prueba antes de decidir"
              lines={["Una hora", "en la cabina."]}
            />

            <Reveal delay={120}>
              <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
                Súbete, mezcla, y después decides.
              </p>
            </Reveal>

            <Reveal delay={80}>
              <p className="mt-6 max-w-md leading-relaxed text-bone-dim">
                Sesión guiada de 1 hora con un DJ del equipo, en los mismos
                equipos del curso. Si te inscribes dentro de una semana, se
                descuenta completa del precio del curso de DJ.
              </p>
            </Reveal>

            <Reveal delay={120} className="mt-10">
              <Magnetic>
                <WhatsAppCta
                  source="prueba"
                  className="group inline-flex items-center gap-3 bg-gold px-8 py-4 label text-ink transition-transform"
                >
                  Agenda tu sesión de prueba
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </WhatsAppCta>
              </Magnetic>
            </Reveal>
          </div>

          <Reveal delay={100} className="lg:self-center">
            <div className="border hairline">
              <div className="border-b hairline px-6 py-4 label text-bone-mute">
                Sesión guiada · 1 hora
              </div>
              <div className="px-6 py-8">
                <span className="font-display text-6xl text-gold md:text-7xl">
                  {formatCLP(PRECIOS.prueba)}
                </span>
              </div>
              <p className="border-t hairline px-6 py-4 label-sm text-bone-mute">
                100% descontable del curso · inscribiéndote dentro de 7 días
              </p>
            </div>
          </Reveal>
        </div>
      </Section>
    </div>
  );
}
