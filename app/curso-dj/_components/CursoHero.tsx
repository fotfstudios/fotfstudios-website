import MeterBars from "@/components/MeterBars";
import MaskText from "@/components/MaskText";
import Magnetic from "@/components/Magnetic";
import HeroVideo from "@/components/HeroVideo";
import { SITE } from "@/lib/site";
import { CURSO } from "../_content";
import WhatsAppCta from "./WhatsAppCta";

export default function CursoHero() {
  return (
    <section className="grain relative isolate flex min-h-[88svh] flex-col justify-end overflow-hidden">
      {/* Video de sesión real a sangre completa (poster = still de respaldo) */}
      <div className="absolute inset-0 z-0">
        <HeroVideo
          webm="/video/curso-hero.webm"
          mp4="/video/curso-hero.mp4"
          poster="/video/curso-hero-poster.jpg"
          alt="DJ mezclando en la cabina de FOTF Studios"
          className="img-grade object-[50%_40%]"
        />
        {/* Scrim direccional: oscuro a la izquierda (texto) → claro a la derecha */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.66) 32%, rgba(10,10,10,0.3) 60%, rgba(10,10,10,0.12) 100%)",
          }}
        />
        {/* Scrim inferior para cuerpo de texto y la franja de datos */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(10,10,10,0.94) 0%, rgba(10,10,10,0.4) 26%, transparent 56%)",
          }}
        />
        {/* Una sola fuente de luz: resplandor dorado */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[55vh]"
          style={{
            background:
              "radial-gradient(55% 55% at 30% 0%, rgba(232,201,74,0.12), transparent 66%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-5 pb-16 pt-28 md:px-10">
        <div className="rise flex items-center gap-4" style={{ animationDelay: "0.05s" }}>
          <MeterBars className="text-[15px] text-gold" />
          <span className="label text-bone-dim">
            {SITE.name} · Primera generación · {CURSO.cupos} cupos
          </span>
        </div>

        <MaskText
          as="h1"
          immediate
          baseDelay={140}
          lines={[
            "Curso de DJ",
            <span key="g" className="text-gold">
              en {SITE.city}
            </span>,
          ]}
          className="font-display mt-7 max-w-5xl text-bone text-[clamp(2.6rem,9vw,7rem)]"
        />

        <p
          className="rise font-editorial mt-6 max-w-xl text-2xl text-bone-dim md:text-3xl"
          style={{ animationDelay: "0.2s" }}
        >
          12 horas de estudio por menos que una mensualidad de 4 clases.
        </p>

        <p
          className="rise mt-6 max-w-md text-sm leading-relaxed text-bone-dim"
          style={{ animationDelay: "0.26s" }}
        >
          Aprende a mezclar en equipos Pioneer reales —2× XDJ-1000MK2 y mixer
          DJM-450— en la cabina de FOTF Studios: 8 horas de clase, 4 horas de
          práctica libre y tu set final grabado en audio y video.
        </p>

        <div className="rise mt-10" style={{ animationDelay: "0.34s" }}>
          <Magnetic>
            <WhatsAppCta
              source="hero"
              className="group inline-flex items-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform"
            >
              Reserva tu cupo por WhatsApp
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </WhatsAppCta>
          </Magnetic>
        </div>
      </div>

      {/* Quick-facts strip (same device as the home hero) */}
      <div className="relative z-10 border-t border-bone/10 bg-ink/55 backdrop-blur-md">
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 divide-x divide-[var(--color-ink-line)] md:grid-cols-4 [&>*]:px-5 md:[&>*]:px-10">
          {[
            ["Sesiones", "4"],
            ["Horas de estudio", "12"],
            ["Cupos", String(CURSO.cupos)],
            ["Set final", "Grabado"],
          ].map(([k, v]) => (
            <div key={k} className="border-t border-bone/10 py-5 md:border-t-0">
              <div className="label-sm text-bone-mute">{k}</div>
              <div className="mt-1 font-display text-2xl text-bone">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
