import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { GEAR, ROOM_INCLUYE, ROOM_TRAES, SITE, whatsappLink } from "@/lib/site";

const CONTACT_EMAIL = "reservas@fotfstudios.cl";
const UPDATED = "29 de junio de 2026";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Términos de uso del servicio de FOTF Studios: reservas, pagos, cancelaciones, uso de la sala y responsabilidades.",
  alternates: { canonical: "/terminos" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 border-t hairline pt-10">
      <h2 className="font-display text-bone" style={{ fontSize: "clamp(1.4rem,4vw,2rem)" }}>
        {title}
      </h2>
      <div className="mt-4 space-y-4 leading-relaxed text-bone-dim">{children}</div>
    </section>
  );
}

export default function TerminosPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-20 md:py-28">
        <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
          ← FOTF Studios
        </Link>

        <p className="label mt-10 text-gold">Legal</p>
        <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
          Términos y condiciones
        </h1>
        <p className="label-sm mt-4 text-bone-mute">Última actualización: {UPDATED}</p>

        <p className="mt-8 leading-relaxed text-bone-dim">
          Estos términos regulan el uso del sitio de {SITE.name} y la reserva de nuestra sala de
          ensayo de DJ por hora en {SITE.city}, {SITE.region}. Al reservar o usar el sitio, aceptas
          estos términos.
        </p>

        <Section title="Quiénes somos">
          <p>
            El servicio lo presta <strong className="text-bone">[RAZÓN SOCIAL]</strong>, RUT{" "}
            <strong className="text-bone">[RUT]</strong>, con domicilio en {SITE.address},{" "}
            {SITE.country}. Operamos una sala de ensayo de DJ por hora, aislada acústicamente y de
            acceso autogestionado.
          </p>
        </Section>

        <Section title="El servicio">
          <p>
            Arriendas por hora una sala equipada con equipo profesional Pioneer. El acceso es
            autogestionado (plug & play): entras con tu acceso a la hora reservada, conectas tu
            música y tocas.
          </p>
          <p className="text-bone">Equipo de la sala:</p>
          <ul className="list-disc space-y-2 pl-5">
            {GEAR.map((g) => (
              <li key={g.model}>
                {g.qty} {g.model} — {g.role}
              </li>
            ))}
          </ul>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-bone">Incluye:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {ROOM_INCLUYE.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-bone">Traes tú:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {ROOM_TRAES.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section title="Reservas y horarios">
          <ul className="list-disc space-y-2 pl-5">
            <li>Horarios de atención: domingo a jueves de 09:00 a 22:00; viernes y sábado de 09:00 a 23:00.</li>
            <li>La reserva mínima es de 1 hora, en bloques de 1 hora.</li>
            <li>
              Al iniciar una reserva, el horario queda en espera por 10 minutos. Si no completas el
              pago en ese plazo, el horario se libera automáticamente.
            </li>
            <li>La reserva queda confirmada una vez aprobado el pago.</li>
          </ul>
        </Section>

        <Section title="Precios y pagos">
          <ul className="list-disc space-y-2 pl-5">
            <li>Rigen los precios vigentes publicados en el sitio al momento de reservar.</li>
            <li>Los precios están en pesos chilenos (CLP) e incluyen IVA.</li>
            <li>Pueden aplicar descuentos por volumen de horas y servicios adicionales de grabación.</li>
            <li>El pago se realiza en línea a través de Mercado Pago.</li>
            <li>Por cada pago se emite la boleta electrónica correspondiente.</li>
          </ul>
        </Section>

        <Section title="Cancelaciones y reembolsos">
          <p>
            Puedes cancelar o reagendar tu sesión con <strong className="text-bone">al menos 24 horas
            de anticipación</strong> y recibir el reembolso o el cambio de horario. Dentro de las 24
            horas previas a la sesión, o en caso de no presentarte (no-show),{" "}
            <strong className="text-bone">no hay reembolso</strong>, ya que el horario quedó
            reservado para ti.
          </p>
          <p>
            Para solicitar una cancelación o reagendamiento, escríbenos por{" "}
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline-offset-4 hover:underline"
            >
              WhatsApp
            </a>{" "}
            o a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            . Los reembolsos que correspondan se procesan a través de Mercado Pago y se emite la nota
            de crédito respectiva.
          </p>
        </Section>

        <Section title="Uso de la sala y conducta">
          <ul className="list-disc space-y-2 pl-5">
            <li>Usa el equipo y la sala de forma responsable y cuidadosa.</li>
            <li>Respeta el horario reservado; el tiempo comienza y termina según tu reserva.</li>
            <li>No puedes subarrendar ni ceder tu acceso a terceros.</li>
            <li>Queda prohibido cualquier daño, alteración o uso indebido del equipo o del espacio.</li>
          </ul>
        </Section>

        <Section title="Responsabilidad">
          <p>
            Eres responsable por los daños que causes al equipo o a la sala durante tu sesión.
            {" "}
            {SITE.name} no se hace responsable por la pérdida o el daño de objetos personales que
            traigas. En la medida que lo permita la ley, nuestra responsabilidad se limita al valor
            de la reserva correspondiente.
          </p>
        </Section>

        <Section title="Propiedad intelectual">
          <p>
            La marca, el logo, las fotografías y los textos de este sitio son de {SITE.name} y no
            pueden usarse sin autorización. Tu música y tus grabaciones son y siguen siendo tuyas.
          </p>
        </Section>

        <Section title="Privacidad">
          <p>
            El tratamiento de tus datos personales se rige por nuestra{" "}
            <Link href="/privacidad" className="text-gold underline-offset-4 hover:underline">
              Política de privacidad y cookies
            </Link>
            .
          </p>
        </Section>

        <Section title="Cambios a estos términos">
          <p>
            Podemos actualizar estos términos para reflejar cambios en el servicio o en la normativa.
            Rige siempre la versión publicada en esta página, con su fecha de última actualización.
          </p>
        </Section>

        <Section title="Ley aplicable">
          <p>
            Estos términos se rigen por las leyes de {SITE.country}. Cualquier controversia se
            someterá a los tribunales competentes de la Región de {SITE.region}.
          </p>
        </Section>

        <Section title="Contacto">
          <p>
            ¿Dudas sobre estos términos? Escríbenos por{" "}
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline-offset-4 hover:underline"
            >
              WhatsApp
            </a>{" "}
            o a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </main>
      <Footer />
    </>
  );
}
