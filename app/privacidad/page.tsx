import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ConsentReopenLink from "@/components/ConsentReopenLink";
import { SITE } from "@/lib/site";

const PRIVACY_EMAIL = "privacidad@fotfstudios.cl";
const UPDATED = "29 de junio de 2026";

export const metadata: Metadata = {
  title: "Privacidad y cookies",
  description:
    "Cómo FOTF Studios trata tus datos personales y qué cookies usamos. Tus derechos y cómo ejercerlos.",
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

const COOKIES: { name: string; origin: string; purpose: string; ttl: string }[] = [
  {
    name: "fotf-consent",
    origin: "Este sitio (localStorage)",
    purpose: "Recordar tu elección sobre cookies",
    ttl: "Hasta que la borres",
  },
  {
    name: "_ga",
    origin: "Google Analytics",
    purpose: "Distinguir visitantes para medir el tráfico",
    ttl: "2 años",
  },
  {
    name: "_gid",
    origin: "Google Analytics",
    purpose: "Distinguir visitantes",
    ttl: "24 horas",
  },
  {
    name: "_gat",
    origin: "Google Analytics",
    purpose: "Limitar la frecuencia de solicitudes",
    ttl: "1 minuto",
  },
  {
    name: "Analítica de Vercel",
    origin: "Vercel",
    purpose: "Métricas de rendimiento anónimas",
    ttl: "Sesión",
  },
];

const PROCESSORS: { name: string; detail: string }[] = [
  {
    name: "Mercado Pago",
    detail:
      "Procesa el pago de tu reserva. Le compartimos tu correo, tu nombre y el monto de la transacción.",
  },
  {
    name: "Google (Tag Manager y Analytics)",
    detail: "Mide el tráfico y uso del sitio. Solo se activa si lo aceptas en el banner de cookies.",
  },
  {
    name: "Vercel",
    detail: "Aloja el sitio y entrega métricas de rendimiento anónimas (Web Analytics y Speed Insights).",
  },
  {
    name: "Supabase",
    detail: "Es la base de datos donde se guardan los datos de tu reserva.",
  },
  {
    name: "Resend",
    detail: "Envía los correos de confirmación de tu reserva.",
  },
  {
    name: "WhatsApp",
    detail: "Si nos escribes por WhatsApp, la conversación ocurre en esa plataforma. Tú inicias el contacto.",
  },
  {
    name: "SII (Servicio de Impuestos Internos)",
    detail: "Para emitir la boleta electrónica de tu pago, según la normativa tributaria chilena.",
  },
];

export default function PrivacidadPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-20 md:py-28">
        <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
          ← FOTF Studios
        </Link>

        <p className="label mt-10 text-gold">Legal</p>
        <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
          Privacidad y cookies
        </h1>
        <p className="label-sm mt-4 text-bone-mute">Última actualización: {UPDATED}</p>

        <p className="mt-8 leading-relaxed text-bone-dim">
          En {SITE.name} cuidamos tus datos. Esta política explica qué información recopilamos cuando
          reservas o navegas el sitio, para qué la usamos, con quién la compartimos y cómo puedes
          ejercer tus derechos. Se rige por la Ley N° 19.628 sobre Protección de la Vida Privada de
          Chile; si nos visitas desde el Espacio Económico Europeo, también reconocemos los derechos
          del RGPD.
        </p>

        <Section title="Responsable del tratamiento">
          <p>
            El responsable de tus datos es <strong className="text-bone">[RAZÓN SOCIAL]</strong>, RUT{" "}
            <strong className="text-bone">[RUT]</strong>, con domicilio en {SITE.address},{" "}
            {SITE.country}.
          </p>
          <p>
            Para cualquier tema de privacidad, escríbenos a{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className="text-gold underline-offset-4 hover:underline">
              {PRIVACY_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="Qué datos recopilamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-bone">Datos de la reserva:</strong> tu correo (obligatorio) y,
              de forma opcional, tu nombre y teléfono.
            </li>
            <li>
              <strong className="text-bone">Datos de facturación:</strong> tu RUT, solo si lo entregas
              para emitir la boleta.
            </li>
            <li>
              <strong className="text-bone">Datos de navegación:</strong> información técnica y de uso
              del sitio (páginas vistas, dispositivo, métricas de rendimiento), parte de ella sujeta a
              tu consentimiento.
            </li>
          </ul>
        </Section>

        <Section title="Para qué los usamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>Gestionar tu reserva y procesar el pago.</li>
            <li>Emitir la boleta electrónica ante el SII.</li>
            <li>Enviarte la confirmación y coordinar el acceso a la sala.</li>
            <li>Responder tus mensajes (por ejemplo, por WhatsApp).</li>
            <li>Medir el tráfico del sitio y mejorar la experiencia.</li>
          </ul>
        </Section>

        <Section title="Base de licitud">
          <p>
            Tratamos tus datos sobre la base de: tu <strong className="text-bone">consentimiento</strong>{" "}
            (para la analítica y las cookies no esenciales), la{" "}
            <strong className="text-bone">ejecución de la reserva</strong> que solicitas, y el{" "}
            <strong className="text-bone">cumplimiento de obligaciones legales</strong> tributarias
            (boleta).
          </p>
        </Section>

        <Section title="Con quién compartimos tus datos">
          <p>
            Trabajamos con proveedores que tratan datos por encargo nuestro, solo para las finalidades
            descritas:
          </p>
          <ul className="space-y-3">
            {PROCESSORS.map((p) => (
              <li key={p.name} className="border-l hairline pl-4">
                <span className="text-bone">{p.name}</span> — {p.detail}
              </li>
            ))}
          </ul>
          <p className="text-bone-mute">
            Algunos de estos proveedores procesan información fuera de Chile (por ejemplo, en Estados
            Unidos). Al usar el sitio, esa transferencia internacional ocurre para poder prestarte el
            servicio.
          </p>
        </Section>

        <Section title="Cookies y almacenamiento">
          <p>
            Usamos cookies y almacenamiento del navegador para que el sitio funcione y para medir su
            tráfico. La analítica de Google solo se activa si la aceptas en el banner de cookies.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b hairline">
                  <th className="label-sm py-2 pr-4 text-bone-mute">Nombre</th>
                  <th className="label-sm py-2 pr-4 text-bone-mute">Origen</th>
                  <th className="label-sm py-2 pr-4 text-bone-mute">Finalidad</th>
                  <th className="label-sm py-2 text-bone-mute">Duración</th>
                </tr>
              </thead>
              <tbody>
                {COOKIES.map((c) => (
                  <tr key={c.name} className="border-b hairline align-top text-bone-dim">
                    <td className="py-3 pr-4 font-mono text-bone">{c.name}</td>
                    <td className="py-3 pr-4">{c.origin}</td>
                    <td className="py-3 pr-4">{c.purpose}</td>
                    <td className="py-3">{c.ttl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Aplicamos el Modo de Consentimiento de Google por región: en el EEE, Reino Unido y Suiza la
            analítica queda desactivada hasta que la aceptes; en Chile y el resto del mundo se activa
            por defecto y puedes desactivarla cuando quieras.
          </p>
          <p>
            Puedes cambiar tu elección en cualquier momento: <ConsentReopenLink />. También puedes
            bloquear o borrar cookies desde la configuración de tu navegador.
          </p>
        </Section>

        <Section title="Por cuánto tiempo los conservamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>Las reservas sin pagar (en espera) se liberan automáticamente a los 10 minutos.</li>
            <li>
              Las reservas pagadas, los pedidos y las boletas se conservan de forma indefinida por
              obligación tributaria.
            </li>
          </ul>
        </Section>

        <Section title="Tus derechos">
          <p>
            Conforme a la Ley N° 19.628, puedes ejercer tus derechos de{" "}
            <strong className="text-bone">acceso, rectificación, cancelación y oposición</strong>{" "}
            sobre tus datos. Si nos visitas desde el EEE, además puedes solicitar acceso,
            rectificación, supresión, portabilidad y oposición conforme al RGPD.
          </p>
          <p>
            Para ejercerlos, escríbenos a{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className="text-gold underline-offset-4 hover:underline">
              {PRIVACY_EMAIL}
            </a>
            . Responderemos en los plazos que exige la ley.
          </p>
        </Section>

        <Section title="Seguridad">
          <p>
            Aplicamos medidas razonables para proteger tus datos: acceso restringido, control por
            roles y claves de servicio que nunca se exponen al navegador. Ningún sistema es
            infalible, pero trabajamos para mantener tu información resguardada.
          </p>
        </Section>

        <Section title="Menores de edad">
          <p>El sitio no está dirigido a menores de edad y no recopilamos sus datos de forma intencional.</p>
        </Section>

        <Section title="Cambios a esta política">
          <p>
            Podemos actualizar esta política para reflejar cambios en el sitio o en la normativa. Rige
            siempre la versión publicada en esta página, con su fecha de última actualización.
          </p>
        </Section>

        <Section title="Contacto">
          <p>
            ¿Dudas sobre tu privacidad? Escríbenos a{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className="text-gold underline-offset-4 hover:underline">
              {PRIVACY_EMAIL}
            </a>{" "}
            o por{" "}
            <a
              href={SITE.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline-offset-4 hover:underline"
            >
              Instagram
            </a>
            .
          </p>
        </Section>
      </main>
      <Footer />
    </>
  );
}
