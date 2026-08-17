import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import FaqList from "./FaqList";

export default function Faq() {
  return (
    <Section id="faq">
      <SectionHead n="07" kicker="Preguntas frecuentes" lines={["Antes de", "escribir."]} />

      <Reveal delay={80} className="mt-12">
        <FaqList />
      </Reveal>
    </Section>
  );
}
