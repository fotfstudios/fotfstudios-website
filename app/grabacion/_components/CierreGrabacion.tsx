import Reveal from "@/components/Reveal";
import MeterBars from "@/components/MeterBars";
import MaskText from "@/components/MaskText";
import Magnetic from "@/components/Magnetic";
import BrandImage from "@/components/BrandImage";
import { getPhotos, grabacionCierrePhoto } from "@/lib/photos";
import WhatsAppCta from "./WhatsAppCta";

export default function CierreGrabacion() {
  const photo = grabacionCierrePhoto(getPhotos());

  return (
    <section className="grain relative isolate overflow-hidden border-t hairline">
      {photo && (
        <div className="absolute inset-0 z-0">
          <BrandImage
            src={photo.src}
            alt={photo.alt}
            sizes="100vw"
            className="h-full w-full"
          />
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
      )}
      {/* Single light source: golden glow from below */}
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
            lines={[
              "Tu set,",
              <span key="g" className="text-gold">
                grabado de verdad.
              </span>,
            ]}
            className="font-display mx-auto mt-8 max-w-5xl text-bone text-[clamp(3rem,10vw,8rem)]"
          />
          <p className="font-editorial mx-auto mt-6 max-w-xl text-2xl text-bone-dim">
            Tu archivo, listo en 48 horas.
          </p>
          <div className="mt-12 flex justify-center">
            <Magnetic>
              <WhatsAppCta
                source="cierre"
                className="group inline-flex items-center gap-3 bg-gold px-8 py-4 label text-ink transition-transform"
              >
                Escríbenos por WhatsApp
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </WhatsAppCta>
            </Magnetic>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
