import Reveal from "@/components/Reveal";
import { Section, SectionHead } from "@/components/Section";
import { COPY } from "@/lib/guia-content";
import LeadForm from "./LeadForm";

/** Cierre: el tercer y último pedido, en su propia tarjeta sobre la banda ink-soft. */
export default function CierreGuia() {
  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="descarga">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHead n="05" kicker={COPY.cierre.eyebrow} lines={[...COPY.cierre.h2]} />
            <Reveal delay={120}>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-bone-dim">{COPY.cierre.lede}</p>
            </Reveal>
          </div>

          <Reveal delay={160}>
            <div className="border hairline bg-ink p-6 sm:p-8">
              <LeadForm guide="guia-dj" source="cierre" layout="stack" buttonLabel="Enviar la guía" eyebrow="Tu correo" />
            </div>
          </Reveal>
        </div>
      </Section>
    </div>
  );
}
