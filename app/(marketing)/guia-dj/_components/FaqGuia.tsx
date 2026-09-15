import FaqList from "@/components/FaqList";
import Reveal from "@/components/Reveal";
import { Section, SectionHead } from "@/components/Section";
import { FAQ_GUIA } from "@/lib/guia-content";

export default function FaqGuia() {
  return (
    <Section id="faq" className="lg:max-w-[960px]">
      <SectionHead n="04" kicker="FAQ" lines={["Preguntas", "frecuentes"]} />

      <Reveal delay={80} className="mt-12">
        <FaqList items={FAQ_GUIA} />
      </Reveal>
    </Section>
  );
}
