import Logo from "./Logo";
import MeterBars from "./MeterBars";
import MaskText from "./MaskText";
import Magnetic from "./Magnetic";
import HeroVideo from "./HeroVideo";
import { SITE, whatsappLink } from "@/lib/site";
import { getPhotos, heroPhoto } from "@/lib/photos";

export default function Hero() {
  const photo = heroPhoto(getPhotos());

  return (
    <section
      id="top"
      className="grain relative isolate flex min-h-[100svh] flex-col overflow-hidden"
    >
      {/* Video a sangre completa — fondo de cabina (poster = still de respaldo) */}
      {photo ? (
        <div className="absolute inset-0 z-0">
          <HeroVideo
            webm="/video/hero.webm"
            mp4="/video/hero.mp4"
            poster="/video/hero-poster.jpg"
            alt={photo.alt}
            className="img-grade object-[50%_45%]"
          />
          {/* Scrim direccional: oscuro a la izquierda (texto) → claro a la derecha (foto) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.66) 32%, rgba(10,10,10,0.3) 60%, rgba(10,10,10,0.12) 100%)",
            }}
          />
          {/* Scrim inferior para cuerpo de texto y franja de datos */}
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
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[8%] top-[18%] z-0 hidden opacity-[0.05] md:block"
        >
          <Logo variant="icon" height={150} />
        </div>
      )}

      {/* Contenido */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-5 pt-32 pb-16 md:px-10">
        {/* Eyebrow */}
        <div className="rise flex items-center gap-4" style={{ animationDelay: "0.05s" }}>
          <MeterBars className="text-[15px] text-gold" />
          <span className="label text-bone-dim">
            {SITE.full} · {SITE.city} · {SITE.region}
          </span>
        </div>

        {/* Título — revelado cinético por máscara */}
        <MaskText
          as="h1"
          immediate
          baseDelay={140}
          lines={["Sala lista,", <span key="g" className="text-gold">tú también.</span>]}
          className="font-display mt-7 text-bone text-[clamp(3.4rem,12vw,10rem)]"
        />

        {/* Declaración — Fraunces, una por pieza */}
        <p
          className="rise font-editorial mt-6 max-w-xl text-2xl text-bone-dim md:text-3xl"
          style={{ animationDelay: "0.2s" }}
        >
          Reserva una hora y entra a tocar.
        </p>

        {/* Cuerpo — mono, dato exacto */}
        <p
          className="rise mt-6 max-w-md text-sm leading-relaxed text-bone-dim"
          style={{ animationDelay: "0.26s" }}
        >
          Sala de ensayo de DJ por hora, aislada acústicamente. 2× Pioneer
          XDJ-1000MK2, DJM-450 y monitores VM-50. Plug &amp; play, acceso autogestionado.
        </p>

        {/* CTA */}
        <div
          className="rise mt-10 flex flex-wrap items-center gap-4"
          style={{ animationDelay: "0.34s" }}
        >
          <Magnetic>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform"
            >
              Reservar una hora
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </Magnetic>
          <a
            href="#como"
            className="inline-flex items-center gap-3 border border-bone/25 bg-ink/30 px-7 py-4 label text-bone backdrop-blur-sm transition-colors hover:border-gold hover:text-gold"
          >
            Cómo funciona
          </a>
        </div>
      </div>

      {/* Franja inferior de datos rápidos */}
      <div className="relative z-10 border-t border-bone/10 bg-ink/55 backdrop-blur-md">
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 divide-x divide-[var(--color-ink-line)] md:grid-cols-4 [&>*]:px-5 md:[&>*]:px-10">
          {[
            ["Modelo", "Por hora"],
            ["Acústica", "Aislada"],
            ["Acceso", "Autogestionado"],
            ["Equipo", "Plug & play"],
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
