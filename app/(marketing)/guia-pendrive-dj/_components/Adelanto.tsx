import Reveal from "@/components/Reveal";
import { Section, SectionHead } from "@/components/Section";
import { ADELANTO, CAPITULOS, COPY } from "@/lib/guia-pendrive-content";

function Candado({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/**
 * "Lee el primer capítulo": el capítulo 01 del PDF en una hoja Bone que se funde, y el
 * resto del índice bloqueado. Todo lleva a #desbloquear — el pedido está ahí mismo abajo.
 */
export default function Adelanto() {
  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="adelanto">
        <SectionHead n="01" kicker={COPY.adelanto.kicker} lines={[...COPY.adelanto.h2]} />

        <div className="mt-12 grid items-start gap-12 lg:grid-cols-2">
          <Reveal>
            <div className="relative h-[clamp(380px,60vw,440px)] overflow-hidden bg-bone px-6 pt-8 text-ink sm:px-10 sm:pt-10">
              <div className="flex h-full flex-col gap-4 overflow-hidden [mask-image:linear-gradient(#000_40%,transparent_78%)]">
                <h3 className="font-display text-3xl">
                  <span className="text-ink/50">{ADELANTO.n}</span> {ADELANTO.title}
                </h3>
                {ADELANTO.paragraphs.map((p) => (
                  <p key={p.slice(0, 24)} className="leading-relaxed text-ink/80">
                    {p}
                  </p>
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-6 flex justify-center">
                <a
                  href="#desbloquear"
                  className="label-sm inline-flex min-h-11 items-center gap-2 bg-ink px-5 text-bone transition-colors hover:bg-graphite focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <Candado />
                  {COPY.adelanto.locked}
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <p className="label text-bone-quiet">{COPY.adelanto.listHead}</p>
            <ol className="mt-5 border-t hairline">
              {CAPITULOS.map((c) => (
                <li key={c.n}>
                  <a
                    href="#desbloquear"
                    className="group flex min-h-14 items-center gap-5 border-b hairline py-1.5 text-bone transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    <span className="font-mono text-sm text-gold">{c.n}</span>
                    <span className="flex-1 text-lg">{c.t}</span>
                    <Candado className="text-bone-mute transition-colors group-hover:text-gold" />
                  </a>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </Section>
    </div>
  );
}
