import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { CLOSURE, GEAR, ROOM_INCLUYE, ROOM_TRAES, SITE, whatsappLink } from "@/lib/site";

const CONTACT_EMAIL = "reservas@fotfstudios.cl";
const UPDATED = "17 de agosto de 2026";

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
      <main
        className={`mx-auto max-w-3xl px-6 pb-20 md:pb-28 ${
          CLOSURE.active ? "pt-40 md:pt-36" : "pt-20 md:pt-28"
        }`}
      >
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

        <Section title="Cancelaciones, reembolsos y reagendamientos">
          <p className="text-bone">Reagendar tu sesión (mover el horario):</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Con <strong className="text-bone">12 horas o más de anticipación</strong> puedes
              reagendar tu sesión <strong className="text-bone">sin costo por el cambio</strong>,
              todas las veces que necesites, sujeto a disponibilidad. Si el nuevo horario tiene
              una tarifa mayor, pagas la diferencia antes de mover la reserva; si es menor, te
              devolvemos la diferencia.
            </li>
            <li>
              Con <strong className="text-bone">menos de 12 horas</strong>, o una vez iniciada la
              sesión, no es posible reagendar.
            </li>
          </ul>
          <p className="mt-6 text-bone">Cancelar y pedir reembolso:</p>
          <p>El reembolso depende de con cuánta anticipación canceles, respecto de la hora de inicio de tu sesión:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-bone">24 horas o más de anticipación:</strong> reembolso total
              (100%).
            </li>
            <li>
              <strong className="text-bone">Entre 12 y 24 horas de anticipación:</strong> reembolso
              del 50%.
            </li>
            <li>
              <strong className="text-bone">Menos de 12 horas</strong>, o si no te presentas
              (no-show): <strong className="text-bone">no hay reembolso</strong>, ya que el horario
              quedó reservado para ti.
            </li>
          </ul>
          <p>
            En casos justificados podemos aplicar condiciones más flexibles a nuestro criterio; estos
            tramos son la regla general.
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

        <Section title="Puntos FOTF">
          <p>
            Por cada pago hecho en dinero acumulas puntos FOTF:{" "}
            <strong className="text-bone">1 punto equivale a $1 CLP</strong>, y acumulas el{" "}
            <strong className="text-bone">5% de lo pagado en dinero</strong>. Los pagos hechos con
            puntos no generan nuevos puntos.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Puedes usar tus puntos para pagar reservas y servicios adicionales a precio de
              lista, hasta el 100% del valor de la reserva. Los puntos no sirven para comprar
              packs de horas ni el curso de iniciación DJ.
            </li>
            <li>
              Si te reembolsamos una reserva, se descuentan los puntos que esa reserva había
              generado, y los puntos que usaste para pagarla se te devuelven a prorrata del monto
              reembolsado.
            </li>
            <li>
              Hoy los puntos no tienen fecha de vencimiento. Podemos modificar el programa de
              puntos hacia adelante; estos cambios nunca afectan puntos que ya hayas ganado.
            </li>
          </ul>
        </Section>

        <Section title="Packs de horas">
          <p>
            Los packs son créditos de horas para usar en{" "}
            <strong className="text-bone">horario valle</strong> (lunes a viernes hasta las
            17:00). Son personales y tienen una vigencia de{" "}
            <strong className="text-bone">90 días</strong> desde la compra.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Si cancelas una reserva hecha con horas de pack con 12 horas o más de anticipación,
              la hora vuelve a tu pack.
            </li>
            <li>
              Las horas no usadas dentro de la vigencia son reembolsables a prorrata si nos
              escribes para solicitarlo.
            </li>
            <li>
              El Pack Egresado se rige por estas mismas reglas. Es un beneficio único por
              egresado del curso de iniciación DJ, y debe activarse dentro de los 90 días
              siguientes al término del curso.
            </li>
          </ul>
        </Section>

        <Section title="Curso de Iniciación DJ">
          <p>
            El curso se paga <strong className="text-bone">100% por adelantado</strong> al
            inscribirte.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Si cancelas hasta 7 días antes del inicio de la primera sesión, te devolvemos el
              100% de lo pagado.
            </li>
            <li>
              Con menos de 7 días de anticipación, no hay reembolso en dinero: puedes traspasar tu
              cupo a la siguiente generación del curso, o a un reemplazante que tú nos indiques.
            </li>
            <li>
              Una vez iniciado el curso, tampoco hay reembolso en dinero. Las sesiones que te
              falten se pueden reagendar dentro de la misma generación.
            </li>
            <li>
              El valor de la sesión de prueba ($19.990) se descuenta del precio del curso si te
              inscribes dentro de los 7 días siguientes a la sesión de prueba.
            </li>
          </ul>
        </Section>

        <Section title="Sesiones de grabación">
          <p>
            Las sesiones de grabación son de{" "}
            <strong className="text-bone">captura directa</strong>, sin postproducción.
            Entregamos el material en formato digital dentro de un plazo de 48 horas.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>El material grabado es tuyo.</li>
            <li>Los derechos de la música que uses durante la sesión son tu responsabilidad.</li>
            <li>
              Los precios publicados de grabación corresponden a horario valle; si reservas en
              horario punta, se suma la diferencia de tarifa correspondiente.
            </li>
          </ul>
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
