import { Section, SectionHead } from "../Section";
import Reveal from "../Reveal";
import PriceCalculator from "../PriceCalculator";
import { TIERS, ADDONS, formatCLP } from "@/lib/pricing";

const VOLUME_DISPLAY = [
  { when: "2 horas", off: "−10%" },
  { when: "3 horas", off: "−15%" },
  { when: "4+ horas", off: "−20%" },
];

export default function Precio() {
  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="precio">
        <SectionHead n="05" kicker="Precio" lines={["Tarifa por", "franja."]} />

        <Reveal delay={120}>
          <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
            Desde {formatCLP(TIERS[0].rate)}/hora. Mientras más horas, menor el valor.
          </p>
        </Reveal>

        {/* Calculadora */}
        <Reveal delay={80} className="mt-12">
          <PriceCalculator />
        </Reveal>

        {/* Tablas de referencia */}
        <div className="mt-10 grid gap-3 lg:grid-cols-3">
          {/* Franjas */}
          <Reveal>
            <div className="h-full border hairline">
              <div className="border-b hairline px-6 py-4 label text-bone-mute">Franjas horarias</div>
              <ul>
                {TIERS.map((t) => (
                  <li key={t.key} className="border-b hairline px-6 py-5 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-2xl text-bone">{t.name}</span>
                      <span className="font-display text-2xl text-gold">{formatCLP(t.rate)}</span>
                    </div>
                    <p className="mt-1 label-sm text-bone-mute">{t.when}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* Descuento por volumen */}
          <Reveal delay={80}>
            <div className="h-full border hairline">
              <div className="border-b hairline px-6 py-4 label text-bone-mute">Descuento por volumen</div>
              <ul>
                {VOLUME_DISPLAY.map((v) => (
                  <li
                    key={v.when}
                    className="flex items-center justify-between border-b hairline px-6 py-5 last:border-b-0"
                  >
                    <span className="text-lg text-bone">{v.when}</span>
                    <span className="font-display text-2xl text-gold">{v.off}</span>
                  </li>
                ))}
              </ul>
              <p className="px-6 py-4 label-sm text-bone-mute">
                Sobre la tarifa de la franja · aplica también al 1:1
              </p>
            </div>
          </Reveal>

          {/* Add-ons / servicios */}
          <Reveal delay={160}>
            <div className="h-full border hairline">
              <div className="border-b hairline px-6 py-4 label text-bone-mute">Add-ons</div>
              <ul>
                <li className="flex items-baseline justify-between gap-3 border-b hairline px-6 py-5">
                  <span className="text-lg text-bone">1:1 guiado</span>
                  <span className="label-sm text-right text-gold">misma tarifa / h</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 border-b hairline px-6 py-5">
                  <span className="text-lg text-bone">{ADDONS.audio.name}</span>
                  <span className="font-display text-2xl text-gold">{formatCLP(ADDONS.audio.price)}</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 px-6 py-5">
                  <span className="text-lg text-bone">Audio + video</span>
                  <span className="font-display text-2xl text-gold">{formatCLP(ADDONS.audioVideo.price)}</span>
                </li>
              </ul>
              <p className="border-t hairline px-6 py-4 label-sm text-bone-mute">
                Próximamente: clases y membresías
              </p>
            </div>
          </Reveal>
        </div>
      </Section>
    </div>
  );
}
