import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { courseRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";
import { CURSO } from "../_content";
import { whatsappLink } from "@/lib/site";

// Se lee el estado real del pedido en cada visita: el `?status` que agrega Mercado
// Pago al volver es una PISTA de mensajería, nunca la verdad.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estado de tu inscripción · Curso de DJ",
  robots: { index: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PagoCursoPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string }>;
}) {
  const { b } = await searchParams;
  if (!b || !UUID_RE.test(b)) notFound();

  const inscripciones = await courseRepository().enrollmentsByOrder(b);
  if (inscripciones.length === 0) notFound();

  const primera = inscripciones[0];
  const pagada = inscripciones.some((i) => i.status === "pagada");
  const anulada = inscripciones.every((i) => i.status === "anulada" || i.status === "expirada");

  return (
    <>
      <header className="border-b hairline">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/curso-dj" className="flex items-center gap-3">
            <Logo variant="mini" color="gold" height={26} />
            <span className="label text-bone-mute">Curso de DJ</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-20 sm:py-28">
        {pagada ? (
          <>
            <p className="label text-gold">Pago recibido</p>
            <h1 className="font-display mt-3 text-5xl text-bone md:text-6xl">Tu cupo está confirmado.</h1>
            <p className="mt-6 leading-relaxed text-bone-dim">
              Te mandamos un correo a <span className="text-bone">{primera.studentEmail}</span> con las fechas
              de las sesiones y la dirección de la sala.
            </p>
            <p className="mt-4 label-sm text-bone-mute">
              Generación {primera.generationCode} · {formatCLP(primera.orderAmountClp ?? primera.priceClp)}
            </p>
          </>
        ) : anulada ? (
          <>
            <p className="label text-bone-mute">Inscripción anulada</p>
            <h1 className="font-display mt-3 text-5xl text-bone md:text-6xl">Este cupo ya no está.</h1>
            <p className="mt-6 leading-relaxed text-bone-dim">
              Si crees que es un error o quieres entrar a la siguiente generación, escríbenos y lo vemos.
            </p>
          </>
        ) : (
          <>
            <p className="label text-gold">Pago en proceso</p>
            <h1 className="font-display mt-3 text-5xl text-bone md:text-6xl">Estamos confirmando.</h1>
            <p className="mt-6 leading-relaxed text-bone-dim">
              A veces Mercado Pago demora un momento en avisarnos. Apenas nos llegue, te mandamos el correo
              con las fechas. Si pasa un rato y no llega nada, escríbenos.
            </p>
          </>
        )}

        <a
          href={whatsappLink(CURSO.waMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className="label mt-10 inline-block border border-gold px-7 py-4 text-gold transition-colors hover:bg-gold hover:text-ink"
        >
          Escríbenos por WhatsApp →
        </a>
      </main>
      <Footer />
    </>
  );
}
