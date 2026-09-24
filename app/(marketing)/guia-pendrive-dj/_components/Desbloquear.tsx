import MaskText from "@/components/MaskText";
import Reveal from "@/components/Reveal";
import LeadForm from "@/components/guides/LeadForm";
import { COPY } from "@/lib/guia-pendrive-content";

/** El segundo y último pedido: centrado, justo donde terminan el adelanto y el índice. */
export default function Desbloquear() {
  return (
    <section id="desbloquear" className="mx-auto flex w-full max-w-[760px] scroll-mt-12 flex-col items-center px-5 py-24 text-center md:py-32">
      <MaskText as="h2" lines={[COPY.desbloquear.h2]} className="font-display text-bone text-[clamp(2.4rem,6vw,4.5rem)]" />
      <Reveal delay={120}>
        <p className="mt-6 max-w-[32em] text-lg leading-relaxed text-bone-dim">{COPY.desbloquear.lede}</p>
      </Reveal>
      <Reveal delay={160} className="mt-10 w-full max-w-[560px] text-left">
        <LeadForm guide="guia-pendrive-dj" source="desbloquear" layout="inline" buttonLabel="Descargar la guía" />
      </Reveal>
    </section>
  );
}
