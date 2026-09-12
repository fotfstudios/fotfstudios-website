import MeterBars from "@/components/MeterBars";
import MaskText from "@/components/MaskText";
import Magnetic from "@/components/Magnetic";
import { SITE } from "@/lib/site";

export default function CursoHero() {
  return (
    <section className="grain booth-glow relative isolate flex min-h-[88svh] flex-col justify-end overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-5 pb-16 pt-28 md:px-10">
        <div className="rise flex items-center gap-4" style={{ animationDelay: "0.05s" }}>
          <MeterBars className="text-[15px] text-gold" />
          <span className="label text-bone-dim">
            {SITE.name} · Primera generación · cupos limitados
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

        {/* Ancla, no wa.me: la acción primaria sigue siendo UNA, pero ahora deja
            registro en vez de evaporarse en un chat. WhatsApp queda de respaldo
            en Prueba, en el cierre y dentro del propio formulario. */}
        <div className="rise mt-10" style={{ animationDelay: "0.34s" }}>
          <Magnetic>
            <a
              href="#inscripcion"
              className="group inline-flex items-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform"
            >
              Reserva tu cupo
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </Magnetic>
        </div>
      </div>

      {/* Quick-facts strip (same device as the home hero) */}
      <div className="relative z-10 border-t border-bone/10 bg-ink/55 backdrop-blur-md">
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 divide-x divide-[var(--color-ink-line)] md:grid-cols-4 [&>*]:px-5 md:[&>*]:px-10">
          {[
            ["Sesiones", "4"],
            ["Horas de estudio", "12"],
            ["Cupos", "Limitados"],
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
