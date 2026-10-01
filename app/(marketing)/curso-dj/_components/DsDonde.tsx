import { SITE } from "@/lib/site";
import { ZONAS } from "@/lib/curso-content";
import DsSectionHead from "./DsSectionHead";

/** Dónde se dicta el curso y para quién de la región: dirección + mapa, sin promesas de traslado. */
export default function DsDonde() {
  return (
    <section id="donde" aria-labelledby="donde-h" className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-18">
      <DsSectionHead id="donde-h" eyebrow="Dónde y para quién" title={`Curso de DJ presencial en ${SITE.city}`}>
        <p className="m-0 max-w-[720px] text-[17px] leading-relaxed text-pretty text-[var(--grey-200)]">
          Las clases son en nuestra sala, en {SITE.address}. Como las fechas las fijas tú, el curso
          también es para quienes vienen de {ZONAS.slice(0, -1).join(", ")} o {ZONAS[ZONAS.length - 1]}:
          una sesión por semana, el día y la hora que te acomoden.
        </p>
      </DsSectionHead>
      <a
        href={SITE.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ds-mono inline-flex w-fit items-center gap-2 text-[15px] text-[var(--accent)] underline underline-offset-4 hover:text-[var(--accent-hover)]"
      >
        Abrir en Google Maps <span aria-hidden="true">→</span>
      </a>
    </section>
  );
}
