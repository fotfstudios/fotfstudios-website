import Reveal from "../Reveal";
import MeterBars from "../MeterBars";
import MaskText from "../MaskText";
import Magnetic from "../Magnetic";
import BrandImage from "../BrandImage";
import { SITE, whatsappLink } from "@/lib/site";

export default function CierreCTA() {
  return (
    <section className="grain relative isolate overflow-hidden border-t hairline">
      {/* Foto de cabina al fondo — la sala habla por sí sola */}
      <div className="absolute inset-0 z-0">
        <BrandImage
          src="/photos/cabina-1.JPG"
          alt="Setup completo en la sala de FOTF Studios: 2× Pioneer XDJ-1000MK2, DJM-450 y monitores VM-50"
          sizes="100vw"
          className="h-full w-full"
          imgClassName="object-[50%_58%]"
        />
        {/* Scrim para texto centrado: oscuro al centro, foto al respirar en los bordes */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 75% at 50% 45%, rgba(10,10,10,0.86) 0%, rgba(10,10,10,0.62) 55%, rgba(10,10,10,0.42) 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(10,10,10,0.7) 0%, transparent 22%, transparent 70%, rgba(10,10,10,0.5) 100%)",
          }}
        />
      </div>
      {/* Una sola fuente de luz: resplandor dorado inferior */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[70%]"
        style={{
          background:
            "radial-gradient(50% 80% at 50% 100%, rgba(232,201,74,0.16), transparent 70%)",
        }}
      />
      <div className="relative z-10 mx-auto max-w-[1280px] px-5 py-28 text-center md:px-10 md:py-40">
        <Reveal>
          <div className="flex justify-center">
            <MeterBars className="text-[22px] text-gold" bars={6} />
          </div>
          <MaskText
            as="h2"
            baseDelay={60}
            lines={["Reserva una hora", <span key="g" className="text-gold">y entra a tocar.</span>]}
            className="font-display mx-auto mt-8 max-w-5xl text-bone text-[clamp(3rem,10vw,8rem)]"
          />
          <p className="font-editorial mx-auto mt-6 max-w-xl text-2xl text-bone-dim">
            La sala habla por sí sola.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Magnetic>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-3 bg-gold px-8 py-4 label text-ink transition-transform"
              >
                Reservar por WhatsApp
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
            </Magnetic>
            <a
              href={SITE.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 border border-bone/25 bg-ink/30 px-8 py-4 label text-bone backdrop-blur-sm transition-colors hover:border-gold hover:text-gold"
            >
              @{SITE.instagram}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
