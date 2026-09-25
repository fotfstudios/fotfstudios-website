import { formatCLP } from "@/lib/pricing";
import { PRECIOS } from "@/lib/curso-content";
import DsSectionHead from "./DsSectionHead";
import InscripcionForm from "./InscripcionForm";

/**
 * La conversión de la página: una solicitud que queda registrada (admin + correo),
 * no una agenda. No hay disponibilidad real que mostrar — las fechas se coordinan
 * a mano por WhatsApp — así que no se dibuja una grilla de horas.
 */
export default function DsReserva() {
  return (
    <section
      id="reserva"
      aria-labelledby="reserva-h"
      className="scroll-mt-16 border-y border-[var(--border-subtle)] bg-[var(--surface-card)]"
    >
      <div className="mx-auto flex max-w-[720px] flex-col gap-7 px-5 py-18">
        <DsSectionHead
          id="reserva-h"
          eyebrow={`Sesión de prueba · 1 h · ${formatCLP(PRECIOS.prueba)}`}
          title="Pide tu hora"
        >
          <p className="m-0 text-[17px] leading-relaxed text-pretty text-[var(--grey-200)]">
            Para la prueba o el curso completo. Te escribimos por WhatsApp para fijar el día y la hora.
          </p>
        </DsSectionHead>
        <InscripcionForm />
      </div>
    </section>
  );
}
