import { Section, SectionHead } from "../Section";
import Reveal from "../Reveal";
import BrandImage from "../BrandImage";
import { ROOM_INCLUYE, ROOM_TRAES } from "@/lib/site";
import { getPhotos, salaPhotos } from "@/lib/photos";

export default function Sala() {
  const photos = salaPhotos(getPhotos());
  const photo = photos[0] ?? null;

  return (
    <Section id="sala">
      <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div>
          <SectionHead n="01" kicker="La sala" lines={["El pulso,", "fuerte y claro."]} />
          <Reveal delay={120}>
            <p className="font-editorial mt-8 text-2xl leading-snug text-bone md:text-[1.75rem]">
              Una base estable sobre la que el DJ crea.
            </p>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-bone-dim">
              FOTF es una sala de ensayo de DJ por hora en Viña del Mar. Aislada
              acústicamente para que el sonido no se escape y no molestes a nadie,
              con equipo profesional y monitores de estudio de calidad.
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-bone-mute">
              Solo tienes que traer tu música y tus audífonos. El resto ya está
              montado y listo para sonar. Un lugar serio para preparar sets, grabar
              contenido, probar y mejorar.
            </p>
          </Reveal>

          {photo && (
            <Reveal delay={160}>
              <BrandImage
                src={photo.src}
                alt={photo.alt}
                sizes="(max-width: 1024px) 100vw, 45vw"
                grain
                className="mt-8 aspect-[4/3] w-full border hairline"
              />
            </Reveal>
          )}
        </div>

        {/* Listas: lo que trae la sala / lo que traes tú */}
        <Reveal delay={80} className="self-end">
          <div className="border hairline bg-ink-soft">
            <div className="flex items-center justify-between border-b hairline px-6 py-4">
              <span className="label text-bone-mute">Lo que incluye</span>
              <span className="label-sm text-gold">FOTF // 01</span>
            </div>
            <ul>
              {ROOM_INCLUYE.map((r, i) => (
                <li
                  key={r}
                  className="flex items-center gap-4 border-b hairline px-6 py-5 last:border-b-0"
                >
                  <span className="label-sm w-7 text-bone-mute">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="h-2 w-2 shrink-0 bg-gold" />
                  <span className="text-base text-bone md:text-lg">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 border hairline bg-ink-soft">
            <div className="border-b hairline px-6 py-4 label text-bone-mute">Lo que no incluye</div>
            <ul>
              {ROOM_TRAES.map((r) => (
                <li
                  key={r}
                  className="flex items-center gap-4 border-b hairline px-6 py-5 last:border-b-0"
                >
                  <span className="h-2 w-2 shrink-0 rotate-45 border border-gold" />
                  <span className="text-base text-bone md:text-lg">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Segunda foto ambiental, si existe */}
          {photos[1] && (
            <BrandImage
              src={photos[1].src}
              alt={photos[1].alt}
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="mt-3 aspect-[3/2] w-full border hairline"
            />
          )}
        </Reveal>
      </div>
    </Section>
  );
}
