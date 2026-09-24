import MaskText from "@/components/MaskText";
import LeadForm from "@/components/guides/LeadForm";
import { COPY } from "@/lib/guia-pendrive-content";
import PendriveCover from "./PendriveCover";

/**
 * Hero: el pedido en la primera pantalla. GRATIS es la única píldora Sirena (la urgencia
 * real: es gratis, es ahora); el acento de la palabra clave es Gold, no Sirena como en la
 * maqueta — Sirena en el manual es solo urgencia.
 */
export default function PendriveHero() {
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

          <div
            id="descargar"
            className="rise mt-8 max-w-[480px] scroll-mt-24 border hairline bg-ink-soft/50 p-5 sm:p-6"
            style={{ animationDelay: "0.28s" }}
          >
            <LeadForm guide="guia-pendrive-dj" source="hero" layout="stack" buttonLabel="Descargar la guía" eyebrow="Te llega al correo" />
          </div>
        </div>

        {/* Decorativa: bajo 768 px se oculta (la maqueta la saca bajo 720 px) — en móvil el
            formulario tiene que quedar arriba del pliegue. */}
        <div className="rise hidden min-w-0 md:block" style={{ animationDelay: "0.3s" }}>
          <PendriveCover />
        </div>
      </div>
    </section>
  );
}
