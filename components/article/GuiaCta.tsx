"use client";

import Link from "next/link";
import { trackGuideCtaClick } from "@/lib/analytics";
import { LEAD_MAGNETS, type LeadMagnetSlug } from "@/lib/lead-magnets";

/**
 * El cierre de todo artículo: el salto a su guía en PDF.
 *
 * Es el único paso medible del embudo — el artículo es abierto y la guía pide el correo,
 * así que este clic es lo más cerca que estamos de atribuir una descarga a una pieza de
 * contenido.
 *
 * El enlace va SIN query string: un `/guia-dj?ref=…` fragmentaría la canónica de una
 * página que ya está rankeada. La atribución viaja por el evento, no por la URL.
 */
export function GuiaCta({ guide, placement = "cierre" }: { guide: LeadMagnetSlug; placement?: string }) {
  const m = LEAD_MAGNETS[guide];
  return (
    <aside className="mt-16 border-t hairline pt-10">
      <p className="label text-gold">{m.kicker}</p>
      <h2 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(1.5rem,4.5vw,2.2rem)" }}>
        {m.title}
      </h2>
      <p className="mt-3 leading-relaxed text-bone-dim">{m.blurb}</p>
      <Link
        href={m.href}
        onClick={() => trackGuideCtaClick(guide, placement)}
        className="label mt-6 inline-flex min-h-11 items-center gap-2 border border-gold px-5 text-gold transition-colors hover:bg-gold hover:text-ink"
      >
        {m.cta} <span aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}
