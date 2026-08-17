import Link from "next/link";
import { Section, SectionHead } from "../Section";
import Reveal from "../Reveal";
import PriceCalculator from "../PriceCalculator";
import { TIERS, RATES, ADDONS, GUIDED_RATE, PACKS, GUIDED_BLOCK, formatCLP } from "@/lib/pricing";
import { whatsappLink } from "@/lib/site";

const VOLUME_DISPLAY = [
  { when: "2 horas", off: "−10%" },
  { when: "3 horas", off: "−15%" },
  { when: "4+ horas", off: "−20%" },
];

const PACKS_WA = "Hola *FOTF Studios*. Quiero comprar un *Pack de horas valle*.";

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
                Sobre la tarifa de la franja
              </p>
            </div>
          </Reveal>

          {/* Add-ons / servicios */}
          <Reveal delay={160}>
            <div className="h-full border hairline">
              <div className="border-b hairline px-6 py-4 label text-bone-mute">Add-ons</div>
              <ul>
                <li className="flex items-baseline justify-between gap-3 border-b hairline px-6 py-5">
                  <span className="text-lg text-bone">Sesión 1:1 guiada</span>
                  <span className="label-sm text-right text-gold">DJ que te guía · {formatCLP(GUIDED_RATE)}/h</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 border-b hairline px-6 py-5">
                  <span className="text-lg text-bone">{ADDONS.audio.name}</span>
                  <span className="font-display text-2xl text-gold">{formatCLP(ADDONS.audio.price)}</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 px-6 py-5">
                  <span className="text-lg text-bone">Audio + Video</span>
                  <span className="font-display text-2xl text-gold">{formatCLP(ADDONS.audioVideo.price)}</span>
                </li>
              </ul>
              <p className="border-t hairline px-6 py-4 label-sm text-bone-mute">
                Clases:{" "}
                <Link href="/curso-dj" className="text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold">
                  Curso de Iniciación DJ
                </Link>
              </p>
            </div>
          </Reveal>
        </div>

        {/* Horas por adelantado — instrumentos de compromiso, no add-ons de sesión */}
        <Reveal delay={100} className="mt-3">
          <div className="border hairline">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b hairline px-6 py-4">
              <span className="label text-bone-mute">Horas por adelantado</span>
              <span className="label-sm text-bone-mute">Se compran por WhatsApp</span>
            </div>
            <ul className="grid divide-y divide-[var(--color-ink-line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <li className="px-6 py-5">
                <div className="text-lg text-bone">Packs de horas valle</div>
                <div className="mt-2 space-y-2">
                  {PACKS.map((p) => (
                    <div key={p.hours} className="flex items-end justify-between gap-3">
                      <span className="label-sm text-bone-mute">
                        {p.hours} horas · ahorras {formatCLP(p.hours * RATES.valle - p.price)}
                      </span>
                      <span className="text-right">
                        <s className="block label-sm text-bone-mute">{formatCLP(p.hours * RATES.valle)}</s>
                        <span className="font-display text-2xl text-gold">{formatCLP(p.price)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </li>
              <li className="px-6 py-5">
                <div className="text-lg text-bone">Perfeccionamiento 1:1</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="label-sm text-bone-mute">
                    {GUIDED_BLOCK.sessions} sesiones de 1h · ahorras{" "}
                    {formatCLP(GUIDED_BLOCK.sessions * GUIDED_RATE - GUIDED_BLOCK.price)}
                  </span>
                  <span className="text-right">
                    <s className="block label-sm text-bone-mute">
                      {formatCLP(GUIDED_BLOCK.sessions * GUIDED_RATE)}
                    </s>
                    <span className="font-display text-2xl text-gold">{formatCLP(GUIDED_BLOCK.price)}</span>
                  </span>
                </div>
              </li>
            </ul>
            <p className="border-t hairline px-6 py-4 label-sm text-bone-mute">
              Vigencia 90 días — ¿se te pasó la fecha? Escríbenos ·{" "}
              <a
                href={whatsappLink(PACKS_WA)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-bone"
              >
                Compra por WhatsApp
              </a>
            </p>
          </div>
        </Reveal>
      </Section>
    </div>
  );
}
