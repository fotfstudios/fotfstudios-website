import MaskText from "@/components/MaskText";
import MeterBars from "@/components/MeterBars";
import { COPY } from "@/lib/guia-content";
import CoverMock from "./CoverMock";
import LeadForm from "./LeadForm";

/**
 * Hero de la guía: pedido en la primera pantalla. GRATIS es la única píldora Sirena de
 * la página (la urgencia real: es gratis, es ahora); el resto del acento es Gold.
 */
export default function GuiaHero() {
  return (
    <section className="grain relative isolate overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1280px] items-center gap-12 px-5 pb-16 pt-28 md:px-10 md:pb-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pt-36">
        <div className="flex min-w-0 flex-col">
          <div className="rise flex flex-wrap items-center gap-4" style={{ animationDelay: "0.05s" }}>
            <span className="label-sm inline-flex h-7 items-center bg-sirena px-3 text-ink">{COPY.hero.pill}</span>
            <span className="label text-bone-dim">{COPY.hero.eyebrow}</span>
          </div>

          <MaskText
            as="h1"
            immediate
            baseDelay={140}
            lines={COPY.hero.h1.map((line, i) =>
              i === COPY.hero.h1Accent ? (
                <span key={line} className="text-gold">
                  {line}
                </span>
              ) : (
                line
              ),
            )}
            className="font-display mt-7 max-w-4xl text-bone text-[clamp(2.6rem,9vw,6.5rem)]"
          />

          <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-bone-dim" style={{ animationDelay: "0.2s" }}>
            {COPY.hero.lede}
          </p>

          <div className="rise mt-8 max-w-[460px] border hairline bg-ink-soft/50 p-5 sm:p-6" style={{ animationDelay: "0.28s" }}>
            <LeadForm guide="guia-dj" source="hero" layout="inline" buttonLabel="Enviar la guía" eyebrow="Descárgala ahora" />
          </div>

          <div className="rise mt-8 flex items-center gap-3" style={{ animationDelay: "0.36s" }}>
            <MeterBars bars={3} className="text-[15px] text-gold" />
            <span className="label text-bone-quiet">{COPY.hero.proof}</span>
          </div>
        </div>

        <div className="rise min-w-0" style={{ animationDelay: "0.3s" }}>
          <CoverMock />
        </div>
      </div>
    </section>
  );
}
