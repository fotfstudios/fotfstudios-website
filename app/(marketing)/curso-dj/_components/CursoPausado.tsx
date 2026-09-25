import Reveal from "@/components/Reveal";
import MeterBars from "@/components/MeterBars";
import Magnetic from "@/components/Magnetic";
import BrandImage from "@/components/BrandImage";
import { getPhotos, cursoPhotos } from "@/lib/photos";
import WhatsAppCta from "./WhatsAppCta";

/**
 * /curso-dj mientras CURSO_ABIERTO es false: la URL sigue viva (conserva el ranking),
 * pero sin precios, programa ni formulario — todo eso se está redefiniendo. Único CTA:
 * WhatsApp, con el mismo `page` histórico para que GTM lo siga contando.
 */
export default function CursoPausado() {
  const photo = cursoPhotos(getPhotos())[2];

  return (
    <section className="grain relative isolate flex min-h-[100svh] items-center overflow-hidden">
      {photo && (
        <div className="absolute inset-0 z-0">
          <BrandImage src={photo.src} alt={photo.alt} sizes="100vw" className="h-full w-full" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 75% at 50% 45%, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.7) 55%, rgba(10,10,10,0.5) 100%)",
            }}
          />
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[70%]"
        style={{
          background: "radial-gradient(50% 80% at 50% 100%, rgba(232,201,74,0.14), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1280px] px-5 py-32 text-center md:px-10">
        <Reveal>
          <div className="flex justify-center">
            <MeterBars className="text-[22px] text-gold" bars={6} />
          </div>
          <p className="label mt-8 text-gold">Curso de DJ · Viña del Mar</p>
          <h1 className="font-display mx-auto mt-4 max-w-4xl text-bone text-[clamp(3rem,9vw,7rem)]">
            Estamos rearmando el curso.
          </h1>
          <p className="font-editorial mx-auto mt-6 max-w-xl text-2xl text-bone-dim">
            Nueva generación, nuevo programa. Vuelve pronto.
          </p>
          <p className="mx-auto mt-6 max-w-xl leading-relaxed text-bone-dim">
            Si quieres que te avisemos cuando abramos inscripciones, escríbenos. Mientras tanto,
            la sala se arrienda por hora con los mismos equipos Pioneer.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Magnetic>
              <WhatsAppCta
                source="pausa"
                className="group inline-flex items-center gap-3 bg-gold px-8 py-4 label text-ink transition-transform"
              >
                Avísenme por WhatsApp
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </WhatsAppCta>
            </Magnetic>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
