import Link from "next/link";
import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import FaqList from "./FaqList";

export default function Faq() {
  return (
    <Section id="faq">
      <SectionHead n="09" kicker="Preguntas frecuentes" lines={["Antes de", "escribir."]} />

      <Reveal delay={80} className="mt-12">
        <FaqList />
      </Reveal>

      <Reveal delay={120}>
        <p className="mt-6 label-sm text-bone-mute">
          ¿Ya sabes mezclar?{" "}
          <Link
            href="/grabacion"
            className="text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold"
          >
            Graba tu set en la cabina →
          </Link>
        </p>
      </Reveal>
    </Section>
  );
}
