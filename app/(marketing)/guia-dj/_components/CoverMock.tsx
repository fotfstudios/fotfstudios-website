import BrandImage from "@/components/BrandImage";
import Logo from "@/components/Logo";
import { COPY } from "@/lib/guia-content";
import { getPhotos, guiaPhoto } from "@/lib/photos";

/**
 * La portada del PDF como objeto: dos "hojas" detrás en abanico (se abren al hover) y
 * la portada encima con foto real + scrim. Solo las hojas rotan; la portada se mueve
 * pero nunca se escala (una foto rasterizada escalada se ve borrosa).
 */
export default function CoverMock() {
  const photo = guiaPhoto(getPhotos());

  return (
    <div className="group relative mx-auto w-full max-w-[396px] px-[18px] pb-[18px]">
      {/* Hoja de atrás */}
      <div
        aria-hidden
        className="absolute bottom-8 left-8 right-1 top-3.5 origin-[52%_100%] rotate-[2.2deg] border hairline transition-transform duration-200 ease-out group-hover:translate-x-1.5 group-hover:-translate-y-1 group-hover:rotate-[5.4deg]"
        style={{ background: "linear-gradient(150deg, var(--color-gold), var(--color-gold-deep) 45%, #0f0f0e)" }}
      />
      {/* Hoja del medio */}
      <div
        aria-hidden
        className="absolute bottom-6 left-6 right-3 top-2 origin-[52%_100%] rotate-[1.1deg] border hairline transition-transform duration-200 ease-out group-hover:translate-x-[3px] group-hover:-translate-y-0.5 group-hover:rotate-[3deg]"
        style={{ background: "linear-gradient(160deg, var(--color-gold-deep), var(--color-graphite) 40%, #131211)" }}
      />

      {/* Portada */}
      <div className="relative flex aspect-[1/1.294] origin-[52%_100%] flex-col justify-between overflow-hidden border border-ink-edge bg-ink p-[8%] shadow-[0_30px_70px_rgba(0,0,0,0.7)] transition-[transform,border-color,box-shadow] duration-200 ease-out group-hover:-translate-y-2 group-hover:-rotate-[1.6deg] group-hover:border-gold group-hover:shadow-[0_38px_80px_rgba(0,0,0,0.75),0_0_40px_rgba(232,201,74,0.22)]">
        {photo && (
          <div aria-hidden className="absolute -inset-3">
            <BrandImage src={photo.src} alt="" sizes="(max-width: 640px) 90vw, 400px" className="h-full w-full" />
          </div>
        )}
        {/* Scrim: texto sobre foto siempre lleva velo (manual de marca). La foto ya es low-key. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(200deg, rgba(10,10,10,0.15), rgba(10,10,10,0.62) 52%, rgba(10,10,10,0.9))" }}
        />
        {/* Lomo + canto superior: el PDF como objeto impreso */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 top-0 w-[22px]"
          style={{ background: "linear-gradient(90deg, rgba(245,242,236,0.11), rgba(245,242,236,0.02) 42%, transparent)" }}
        />
        <div aria-hidden className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-bone/15" />

        <div className="relative flex items-start justify-between gap-3">
          <Logo variant="mini" color="cream" height={36} className="drop-shadow-[0_2px_10px_rgba(10,10,10,0.9)]" />
          <div className="label-sm text-right leading-relaxed text-bone-quiet">
            {COPY.cover.corner[0]}
            <br />
            {COPY.cover.corner[1]}
          </div>
        </div>

        <div className="relative flex flex-col gap-4">
          <p className="label text-gold">{COPY.cover.eyebrow}</p>
          <p className="font-display text-[clamp(2rem,7.8vw,2.7rem)] text-bone">
            {COPY.cover.title.map((line, i) => (
              <span key={line} className={`block ${i === COPY.cover.titleAccent ? "text-gold" : ""}`}>
                {line}
              </span>
            ))}
          </p>
          {/* Motivo de barras (estático: el logo nunca se anima) */}
          <div aria-hidden className="flex w-[46px] flex-col gap-[5px]">
            {[100, 45, 65, 33].map((w) => (
              <i key={w} className="block h-[7px] bg-gold" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>

        <div className="relative flex gap-5 border-t border-bone/15 pt-3.5 label-sm text-bone-quiet">
          {COPY.cover.specs.map((s) => (
            <div key={s.k} className="leading-relaxed">
              <div className="text-bone-mute">{s.k}</div>
              <div className="text-bone-dim">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
