import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import { RECORDING_SESSIONS, formatCLP } from "@/lib/pricing";

/** Both cards render the same shape: hour rows priced via formatCLP. */
const FORMATOS = [
  { key: "audio", label: "Audio", sessions: RECORDING_SESSIONS.audio },
  { key: "audioVideo", label: "Audio + Video", sessions: RECORDING_SESSIONS.audioVideo },
] as const;

export default function Formatos() {
  return (
    <Section id="formatos">
      <SectionHead n="01" kicker="Formatos" lines={["Precio", "cerrado."]} />

      <div className="mt-10 grid gap-3 md:grid-cols-2">
        {FORMATOS.map((f, i) => (
          <Reveal key={f.key} delay={i * 80}>
            <div className="flex h-full flex-col border hairline">
              <div className="border-b hairline px-6 py-4 label text-bone-mute">{f.label}</div>
              <ul className="flex-1">
                {f.sessions.map((s) => (
                  <li
                    key={s.hours}
                    className="flex items-baseline justify-between gap-4 border-b hairline px-6 py-5 last:border-b-0"
                  >
                    <span className="text-lg text-bone">{s.hours}h</span>
                    <span className="font-display text-2xl text-gold md:text-3xl">
                      {formatCLP(s.price)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={160}>
        <p className="mt-6 label-sm text-bone-mute">
          Precios en horario valle · en punta se suma la diferencia de tarifa · IVA incluido
        </p>
      </Reveal>
    </Section>
  );
}
