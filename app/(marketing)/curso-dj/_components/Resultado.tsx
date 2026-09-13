import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import VideoSlot from "./VideoSlot";

export default function Resultado() {
  return (
    <Section id="resultado">
      <SectionHead n="01" kicker="El resultado" lines={["Así termina", "el curso."]} />

      <Reveal delay={120}>
        <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
          Un set real, tocado y grabado en la sala.
        </p>
      </Reveal>

      <Reveal delay={80} className="mt-12">
        <VideoSlot />
      </Reveal>
    </Section>
  );
}
