import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import { PARA_QUIEN, NO_ES, NO_ES_NOTA } from "../_content";

/**
 * The "no es" column is deliberate scope-setting, not a disclaimer — same card
 * treatment and typography as the left column (spec rule).
 */
export default function ParaQuien() {
  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="para-quien">
        <SectionHead n="02" kicker="Para quién" lines={["Para quién es,", "para quién no."]} />

        <div className="mt-12 grid gap-3 md:grid-cols-2">
          <Reveal>
            <div className="h-full border hairline">
              <div className="border-b hairline px-6 py-4 label text-bone-mute">Es para ti si</div>
              <ul>
                {PARA_QUIEN.map((item) => (
                  <li key={item} className="flex gap-4 border-b hairline px-6 py-5 last:border-b-0">
                    <span aria-hidden className="font-display text-xl text-gold">
                      +
                    </span>
                    <span className="text-lg text-bone">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="flex h-full flex-col border hairline">
              <div className="border-b hairline px-6 py-4 label text-bone-mute">Lo que no cubre</div>
              <ul className="flex-1">
                {NO_ES.map((item) => (
                  <li key={item} className="flex gap-4 border-b hairline px-6 py-5">
                    <span aria-hidden className="font-display text-xl text-gold">
                      —
                    </span>
                    <span className="text-lg text-bone">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="px-6 py-4 label-sm text-bone-mute">{NO_ES_NOTA}</p>
            </div>
          </Reveal>
        </div>
      </Section>
    </div>
  );
}
