"use client";

import Link from "next/link";
import { trackGuideCtaClick } from "@/lib/analytics";

/**
 * El cierre de todo artículo: el salto a su guía en PDF.
 *
 * Es el único paso medible del embudo — el artículo es abierto y la guía pide el correo,
 * así que este clic es lo más cerca que estamos de atribuir una descarga a una pieza de
 * contenido.
 *
 * Recibe los campos por PROPS en vez de leer el registro. Antes importaba LEAD_MAGNETS
 * (= todo GUIDES) y lo indexaba dinámicamente, así que ningún bundler podía podarlo: al
 * navegador viajaban las claves del bucket de Supabase, los templateKey y cada asunto y
 * blurb de correo. lib/guides.ts dice en su primera línea que ahí vive solo lo que
 * necesita el SERVIDOR; esto lo vuelve cierto.
 *
 * El enlace va SIN query string: un `/guia-dj?ref=…` fragmentaría la canónica de una
 * página que ya está rankeada. La atribución viaja por el evento, no por la URL.
 */
export function GuiaCta({
  guide,
  href,
  kicker,
  title,
  description,
  cta,
  placement = "cierre",
}: {
  /** Slug del imán. Solo se usa para el evento. */
  guide: string;
  href: string;
  kicker: string;
  title: string;
  description: string;
  cta: string;
  placement?: string;
}) {
  return (
    <aside className="mt-16 border-t hairline pt-10">
      <p className="label text-gold">{kicker}</p>
      <h2 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(1.5rem,4.5vw,2.2rem)" }}>
        {title}
      </h2>
      <p className="mt-3 leading-relaxed text-bone-dim">{description}</p>
      <Link
        href={href}
        onClick={() => trackGuideCtaClick(guide, placement)}
        className="label mt-6 inline-flex min-h-11 items-center gap-2 border border-gold px-5 text-gold transition-colors hover:bg-gold hover:text-ink"
      >
        {cta} <span aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}
