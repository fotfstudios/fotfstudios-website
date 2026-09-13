import { Section, SectionHead } from "@/components/Section";
import Reveal from "@/components/Reveal";
import InscripcionForm from "./InscripcionForm";

/**
 * La conversión de la página. Va DESPUÉS de Precios (lees el precio → decides) y
 * antes de Prueba, que recoge a quien todavía no se decide.
 *
 * La página sigue teniendo una sola acción primaria; lo que cambia es que ahora
 * deja registro en vez de evaporarse en un chat. WhatsApp queda como respaldo
 * explícito, no como el único camino.
 */
export default function Inscripcion() {
  return (
    <Section id="inscripcion">
      <SectionHead n="06" kicker="Inscripción" lines={["Toma", "tu cupo."]} />

      <Reveal delay={120}>
        <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
          Cupos limitados: van saliendo en orden de llegada.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <Reveal>
          <div className="flex flex-col gap-6">
            <p className="leading-relaxed text-bone-dim">
              Déjanos tus datos y te escribimos por WhatsApp para cerrar el cupo y coordinar las
              fechas. No se paga nada acá.
            </p>
            <ul className="flex flex-col">
              {[
                "Revisamos cada solicitud a mano.",
                "Te confirmamos cupo y fechas por WhatsApp.",
                "El pago va al final, cuando ya está todo claro.",
              ].map((item) => (
                <li key={item} className="flex gap-4 border-t hairline py-4">
                  <span aria-hidden className="font-display text-xl text-gold">
                    +
                  </span>
                  <span className="text-bone">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <InscripcionForm />
        </Reveal>
      </div>
    </Section>
  );
}
