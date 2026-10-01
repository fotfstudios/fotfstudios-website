import { TESTIMONIOS } from "@/lib/curso-content";
import DsSectionHead from "./DsSectionHead";

/**
 * Testimonios reales de alumnos. Sin datos no se renderiza: nada de prueba social vacía.
 * Con uno solo, una cita grande (una grilla con una tarjeta se ve abandonada).
 */
export default function DsTestimonios() {
  if (TESTIMONIOS.length === 0) return null;
  const solo = TESTIMONIOS.length === 1;
  return (
    <section aria-labelledby="testimonios-h" className="border-t border-[var(--border-subtle)]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-5 py-18">
        <DsSectionHead id="testimonios-h" eyebrow="Alumnos" title="Lo que dicen del curso de DJ" />
        <ul className={`m-0 grid list-none gap-4 p-0 ${solo ? "" : "grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))]"}`}>
          {TESTIMONIOS.map((t) => (
            <li key={t.name + t.quote.slice(0, 16)}>
              <figure className="m-0 flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
                {t.rating && (
                  <p className="ds-mono m-0 text-[var(--gold)]" aria-label={`${t.rating} de 5`}>
                    {"★".repeat(t.rating)}
                    <span className="text-[var(--text-muted)]">{"★".repeat(5 - t.rating)}</span>
                  </p>
                )}
                <blockquote className={`m-0 leading-snug text-pretty ${solo ? "text-[clamp(20px,2.6vw,28px)]" : "text-lg"}`}>
                  “{t.quote}”
                </blockquote>
                <figcaption className="ds-mono text-sm text-[var(--text-secondary)]">
                  {t.name} · {t.detail}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
