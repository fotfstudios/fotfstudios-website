import Link from "next/link";
import Logo from "@/components/Logo";
import { GUIDES, isGuideSlug } from "@/lib/guides";
import { whatsappLink } from "@/lib/site";

/**
 * El panel "no disponible" de `/<guía>/descarga/<token>`: el token es válido pero el PDF
 * no está en el bucket (o storage falló). El título sale del registro por la guía DEL
 * LEAD, no de la ruta: los tokens se resuelven globalmente.
 */
export default function GuideUnavailable({ guide }: { guide: string }) {
  const title = isGuideSlug(guide) ? GUIDES[guide].title : "guía";
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
          href={whatsappLink(`Hola *FOTF Studios*. Pedí la *${title}* y el link no me abre.`)}
          className="group inline-flex items-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform"
        >
          Escríbenos por WhatsApp
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </p>
    </main>
  );
}
