import { Section, SectionHead } from "../Section";
import Reveal from "../Reveal";
import { SITE } from "@/lib/site";

const TERRITORY = [["Viña del Mar", "Base · sala"]] as const;

export default function Ubicacion() {
  return (
    <Section id="ubicacion">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <SectionHead n="06" kicker="Ubicación" lines={["Dónde", "está."]} />
          <Reveal delay={100}>
            <p className="font-editorial mt-8 text-2xl leading-snug text-bone">
              {SITE.address}.
            </p>
            <a
              href={SITE.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-6 inline-flex items-center gap-3 border hairline px-6 py-3.5 label text-bone-dim transition-colors hover:border-gold hover:text-gold"
            >
              Abrir en Google Maps
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>

            <div className="mt-12">
              <span className="label-sm text-bone-mute">Territorio</span>
              <ul className="mt-4 border-t hairline">
                {TERRITORY.map(([place, role]) => (
                  <li
                    key={place}
                    className="flex items-baseline justify-between border-b hairline py-4"
                  >
                    <span className="font-display text-2xl text-bone md:text-3xl">{place}</span>
                    <span className="label-sm text-bone-mute">{role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        {/* Mapa */}
        <Reveal delay={120}>
          <div className="relative h-full min-h-[360px] overflow-hidden border hairline">
            <iframe
              title="Ubicación de FOTF Studios en Viña del Mar"
              src="https://www.google.com/maps?q=Los%20Chercanes%2078a%2C%20Vi%C3%B1a%20del%20Mar&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 h-full w-full"
              style={{ border: 0, filter: "grayscale(1) invert(0.92) contrast(0.9) brightness(0.9)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 40%, transparent 40%, rgba(10,10,10,0.35))",
                boxShadow: "inset 0 0 0 1px var(--color-ink-line)",
              }}
            />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
