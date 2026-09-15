import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { GUIA } from "@/lib/guia-content";
import { whatsappLink } from "@/lib/site";
import { guideService } from "@/src/composition";

/**
 * El link del correo: `/guia-dj/descarga/<token>`. Es una PÁGINA y no un route handler
 * a propósito: un token malo cae en el 404 de marca (`notFound()` en un route.ts
 * devuelve un 404 vacío), y el caso "archivo aún no subido" se puede explicar en vez de
 * fallar en seco. Con todo en orden, redirige a una URL firmada del bucket (120 s).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Descarga · ${GUIA.title}`,
  robots: { index: false, follow: false },
};

export default async function DescargaGuiaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await guideService().resolveDownload(token);

  if (result.kind === "not_found") notFound();
  if (result.kind === "ok") redirect(result.url);

  return (
    <main className="mx-auto flex min-h-[70svh] w-full max-w-3xl flex-col justify-center px-6 py-24">
      <Link href="/" aria-label="FOTF Studios — volver al inicio" className="mb-12 inline-block w-fit">
        <Logo variant="mini" height={40} />
      </Link>
      <p className="label text-gold">Un momento</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        La guía no está disponible ahora mismo
      </h1>
      <p className="mt-6 max-w-xl leading-relaxed text-bone-dim">
        Tu link es válido: guárdalo e intenta de nuevo en un rato. Si sigue sin abrir, escríbenos y te la
        mandamos por WhatsApp.
      </p>
      <p className="mt-8">
        <a
          href={whatsappLink(`Hola *FOTF Studios*. Pedí la *${GUIA.title}* y el link no me abre.`)}
          className="group inline-flex items-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform"
        >
          Escríbenos por WhatsApp
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </p>
    </main>
  );
}
