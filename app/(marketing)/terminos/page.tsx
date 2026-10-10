import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { ProseSection } from "@/components/article/ProseSection";
import WhatsAppCta from "@/components/WhatsAppCta";
import { CLOSURE, GEAR, ROOM_INCLUYE, ROOM_TRAES, SITE } from "@/lib/site";

const CONTACT_EMAIL = "reservas@fotfstudios.cl";
const UPDATED = "10 de octubre de 2026";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Términos de uso del servicio de FOTF Studios: reservas, pagos, cancelaciones, uso de la sala y responsabilidades.",
  alternates: { canonical: "/terminos" },
};

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

        <ProseSection title="Quiénes somos">
          <p>
            El servicio lo presta <strong className="text-bone">[RAZÓN SOCIAL]</strong>, RUT{" "}
            <strong className="text-bone">[RUT]</strong>, con domicilio en {SITE.address},{" "}
            {SITE.country}. Operamos una sala de ensayo de DJ por hora, aislada acústicamente y de
            acceso autogestionado.
          </p>
        </ProseSection>

        <ProseSection title="El servicio">
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
        </ProseSection>

        <ProseSection title="Reservas y horarios">
          <ul className="list-disc space-y-2 pl-5">
            <li>Horarios de atención: domingo a jueves de 09:00 a 22:00; viernes y sábado de 09:00 a 23:00.</li>
            <li>La reserva mínima es de 1 hora, en bloques de 1 hora.</li>
            <li>
              Al iniciar una reserva, el horario queda en espera por 10 minutos. Si no completas el
              pago en ese plazo, el horario se libera automáticamente.
            </li>
            <li>La reserva queda confirmada una vez aprobado el pago.</li>
          </ul>
        </ProseSection>

        <ProseSection title="Precios y pagos">
          <ul className="list-disc space-y-2 pl-5">
            <li>Rigen los precios vigentes publicados en el sitio al momento de reservar.</li>
            <li>Los precios están en pesos chilenos (CLP) e incluyen IVA.</li>
            <li>Pueden aplicar descuentos por volumen de horas y servicios adicionales de grabación.</li>
            <li>
              Pueden aplicar promociones para la primera reserva, según las condiciones publicadas en el
              sitio al momento de reservar. Se calculan sobre el valor de la sala, se aplican una vez por
              correo electrónico y no son acumulables con otros descuentos otorgados manualmente.
            </li>
            <li>El pago se realiza en línea a través de Mercado Pago.</li>
            <li>Por cada pago se emite la boleta electrónica correspondiente.</li>
          </ul>
        </ProseSection>

        <ProseSection title="Cancelaciones, reembolsos y reagendamientos">
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
            <WhatsAppCta source="terminos-reagendar" className="text-gold underline-offset-4 hover:underline">
              WhatsApp
            </WhatsAppCta>{" "}
            o a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            . Los reembolsos que correspondan se procesan a través de Mercado Pago y se emite la nota
            de crédito respectiva.
          </p>
        </ProseSection>

        <ProseSection title="Beatcoins">
          <p>
            Beatcoins es el programa de puntos de FOTF Studios (antes, «Puntos FOTF»; los saldos
            se mantienen iguales). Por cada pago hecho en dinero acumulas Beatcoins:{" "}
            <strong className="text-bone">1 Beatcoin equivale a $1 CLP</strong>, y acumulas el{" "}
            <strong className="text-bone">5% de lo pagado en dinero</strong>. Los pagos hechos con
            Beatcoins no generan nuevos Beatcoins.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Puedes usar tus Beatcoins para pagar reservas y servicios adicionales a precio de
              lista, hasta el 100% del valor de la reserva. Los Beatcoins no sirven para comprar
              packs de horas, bloques de Perfeccionamiento 1:1 ni el Curso de DJ.
            </li>
            <li>
              El Curso de DJ no genera Beatcoins: ni el pago del curso, ni sus sesiones guiadas,
              ni sus horas de práctica, ni la sesión de prueba.
            </li>
            <li>
              Las reservas pagadas con Beatcoins (total o parcialmente) no se pueden reagendar: si
              necesitas cambiarla, cancélala —aplican los tramos de reembolso, devuelto en
              Beatcoins— y crea una nueva.
            </li>
            <li>
              Si te reembolsamos una reserva, se descuentan los Beatcoins que esa reserva había
              generado, y los Beatcoins que usaste para pagarla se te devuelven a prorrata del
              monto reembolsado.
            </li>
            <li>
              Los Beatcoins que ganes desde el{" "}
              <strong className="text-bone">10 de noviembre de 2026</strong> vencen{" "}
              <strong className="text-bone">12 meses después de tu última reserva pagada</strong>{" "}
              (con dinero o con Beatcoins): cada reserva nueva reinicia el plazo. Al pagar con
              Beatcoins se usan primero los que vencen, y te avisamos por correo 30 y 7 días
              antes de que venzan.
            </li>
            <li>
              Los Beatcoins que ganaste antes del 10 de noviembre de 2026 no vencen nunca.
              Podemos modificar el programa hacia adelante; estos cambios nunca afectan Beatcoins
              que ya hayas ganado.
            </li>
          </ul>
        </ProseSection>

        <ProseSection title="Packs de horas">
          <p>
            Los packs son créditos de horas para usar en{" "}
            <strong className="text-bone">horario valle</strong> (lunes a viernes hasta las
            17:00). Son personales (puedes entrar con acompañantes a tu sesión, como en
            cualquier reserva) y tienen una vigencia de{" "}
            <strong className="text-bone">90 días</strong> desde la compra. ¿Se te pasó la
            fecha? Escríbenos y lo vemos caso a caso.
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
            <li>
              Los bloques de Perfeccionamiento 1:1 (4 sesiones de 1h) se agendan sesión por
              sesión bajo las reglas generales de reserva de esta página (reagendamiento con 12
              horas o más de anticipación, tramos de reembolso), y tienen una vigencia de 90 días
              desde la compra. ¿Se te pasó la fecha? Escríbenos y lo vemos caso a caso.
            </li>
          </ul>
        </ProseSection>

        <ProseSection title="Curso de Iniciación DJ">
          <p>
            El curso es 1:1 (o en dúo) y se paga <strong className="text-bone">100% por adelantado</strong>{" "}
            al inscribirte. Fijamos contigo las fechas de tus 6 sesiones.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Si cancelas hasta 7 días antes del inicio de tu primera sesión, te devolvemos el 100% de lo
              pagado.
            </li>
            <li>
              Con menos de 7 días de anticipación no hay reembolso en dinero: reagendamos tus sesiones, o
              puedes indicarnos un reemplazante que tome tu lugar antes de la primera sesión.
            </li>
            <li>
              Una vez iniciado el curso tampoco hay reembolso en dinero. Las sesiones que te falten se
              reagendan dentro de la ventana del curso.
            </li>
            <li>
              Las 6 sesiones se realizan dentro de las 10 semanas siguientes a la primera. Las 6 horas de
              práctica libre se agendan con nosotros y vencen 90 días después de tu última sesión.
            </li>
            <li>
              Si no puedes venir a una sesión, avísanos con 24 horas o más y se reagenda sin costo. Con
              menos de 24 horas o sin aviso tienes una sesión de gracia por curso, que también se reagenda;
              después de esa, la sesión se considera dictada.
            </li>
            <li>Si la sesión la cancelamos nosotros, se reagenda sin costo para ti.</li>
            <li>
              En dúo, las dos personas van en un solo pedido y las horas de práctica se agendan en pareja
              por defecto.
            </li>
            <li>
              El valor de la sesión de prueba ($19.990) se descuenta del precio del curso si te inscribes
              dentro de los 7 días siguientes a la sesión de prueba.
            </li>
          </ul>
        </ProseSection>

        <ProseSection title="Sesiones de grabación">
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
        </ProseSection>

        <ProseSection title="Uso de la sala y conducta">
          <ul className="list-disc space-y-2 pl-5">
            <li>Usa el equipo y la sala de forma responsable y cuidadosa.</li>
            <li>Respeta el horario reservado; el tiempo comienza y termina según tu reserva.</li>
            <li>No puedes subarrendar ni ceder tu acceso a terceros.</li>
            <li>Queda prohibido cualquier daño, alteración o uso indebido del equipo o del espacio.</li>
          </ul>
        </ProseSection>

        <ProseSection title="Responsabilidad">
          <p>
            Eres responsable por los daños que causes al equipo o a la sala durante tu sesión.
            {" "}
            {SITE.name} no se hace responsable por la pérdida o el daño de objetos personales que
            traigas. En la medida que lo permita la ley, nuestra responsabilidad se limita al valor
            de la reserva correspondiente.
          </p>
        </ProseSection>

        <ProseSection title="Propiedad intelectual">
          <p>
            La marca, el logo, las fotografías y los textos de este sitio son de {SITE.name} y no
            pueden usarse sin autorización. Tu música y tus grabaciones son y siguen siendo tuyas.
          </p>
        </ProseSection>

        <ProseSection title="Privacidad">
          <p>
            El tratamiento de tus datos personales se rige por nuestra{" "}
            <Link href="/privacidad" className="text-gold underline-offset-4 hover:underline">
              Política de privacidad y cookies
            </Link>
            .
          </p>
        </ProseSection>

        <ProseSection title="Cambios a estos términos">
          <p>
            Podemos actualizar estos términos para reflejar cambios en el servicio o en la normativa.
            Rige siempre la versión publicada en esta página, con su fecha de última actualización.
          </p>
        </ProseSection>

        <ProseSection title="Ley aplicable">
          <p>
            Estos términos se rigen por las leyes de {SITE.country}. Cualquier controversia se
            someterá a los tribunales competentes de la Región de {SITE.region}.
          </p>
        </ProseSection>

        <ProseSection title="Contacto">
          <p>
            ¿Dudas sobre estos términos? Escríbenos por{" "}
            <WhatsAppCta source="terminos-contacto" className="text-gold underline-offset-4 hover:underline">
              WhatsApp
            </WhatsAppCta>{" "}
            o a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </ProseSection>
      </main>
      <Footer />
    </>
  );
}
