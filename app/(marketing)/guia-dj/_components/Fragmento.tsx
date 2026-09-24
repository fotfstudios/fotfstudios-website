import Reveal from "@/components/Reveal";
import { Section, SectionHead } from "@/components/Section";
import { COPY, FRAGMENTO } from "@/lib/guia-content";
import LeadForm from "@/components/guides/LeadForm";
import PasoIlustracion from "./PasoIlustracion";

/**
 * "Léela antes de pedirla": la página 4 del PDF tal cual, en Bone. Es la única
 * superficie clara del sitio a propósito — ES una página impresa, no la web. Sobre
 * Bone el acento es Ink (Gold no llega a AA en texto sobre crema); el Gold vuelve en
 * los pies oscuros de cada paso. Se funde a Ink abajo y ahí mismo se pide el resto.
 */
export default function Fragmento() {
  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="fragmento">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead n="02" kicker={COPY.fragmento.eyebrow} lines={[...COPY.fragmento.h2]} />
          <Reveal delay={120}>
            <p className="label-sm text-bone-mute">{COPY.fragmento.tag}</p>
          </Reveal>
        </div>

        <Reveal delay={80} className="mt-12">
          <div className="relative overflow-hidden border hairline bg-ink">
            {/* La página */}
            <div className="relative flex flex-col gap-6 bg-bone px-6 pb-24 pt-8 text-ink sm:px-10 md:px-16 md:pb-32 md:pt-14">
              <div className="flex items-baseline justify-between gap-4 border-b border-ink/15 pb-4">
                <div className="flex min-w-0 items-baseline gap-4">
                  <span className="font-mono text-sm text-ink/60">{FRAGMENTO.capitulo}</span>
                  <h3 className="font-display text-3xl md:text-5xl">{FRAGMENTO.capituloTitulo}</h3>
                </div>
                <span className="label-sm whitespace-nowrap text-ink/60">Pág. {String(FRAGMENTO.pagina).padStart(2, "0")}</span>
              </div>

              <p className="max-w-[34em] text-lg leading-relaxed text-ink/75 md:text-xl">{FRAGMENTO.lede}</p>

              <div className="grid gap-4 md:grid-cols-2">
                {FRAGMENTO.pasos.map((p) => (
                  <div key={p.n} className="flex flex-col overflow-hidden border border-ink/10 bg-[#fdfcf9]">
                    <div className="flex flex-1 gap-4 p-6">
                      <span className="pt-0.5 font-mono text-sm text-ink/60">{p.n}</span>
                      <div className="min-w-0">
                        <h4 className="text-lg font-medium text-ink">{p.title}</h4>
                        <p className="mt-1 text-sm leading-relaxed text-ink/70">{p.body}</p>
                      </div>
                    </div>
                    <PasoIlustracion kind={p.ilustracion} caption={p.caption} />
                  </div>
                ))}
              </div>

              {/* Se funde a Ink: la página sigue, pero el resto llega al correo. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[clamp(120px,22vw,220px)]"
                style={{ background: "linear-gradient(180deg, rgba(245,242,236,0), rgba(245,242,236,0.7) 46%, #0a0a0a)" }}
              />
            </div>

            {/* Y ahí mismo, el pedido */}
            <div className="grid items-center gap-8 px-6 pb-8 pt-2 sm:px-10 md:grid-cols-2 md:gap-12 md:px-16 md:pb-12">
              <div className="flex min-w-0 flex-col gap-3">
                <p className="label-sm text-gold">{COPY.fragmento.afterTag}</p>
                <h3 className="font-display text-3xl text-bone md:text-5xl">
                  {COPY.fragmento.afterTitle.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </h3>
                <p className="max-w-[30em] leading-relaxed text-bone-dim">{COPY.fragmento.afterLede}</p>
              </div>
              <div className="min-w-0">
                <LeadForm guide="guia-dj" source="fragmento" layout="stack" buttonLabel="Enviar la guía completa" />
              </div>
            </div>
          </div>
        </Reveal>
      </Section>
    </div>
  );
}
