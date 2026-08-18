"use client";

import type { ReactNode } from "react";
import { trackWhatsAppClick } from "@/lib/analytics";
import { whatsappLink } from "@/lib/site";

/**
 * Ancla wa.me instrumentada — TODO link público de WhatsApp del sitio pasa por
 * acá para que `whatsapp_click` (GTM/GA4 + Vercel) cubra el 100% de los CTA.
 * `source` etiqueta qué sección originó el clic; `page` sale del pathname salvo
 * páginas que ya reportan un valor histórico explícito (curso-dj, grabacion).
 */
export default function WhatsAppCta({
  source,
  page,
  waMessage,
  className = "",
  children,
}: {
  source: string;
  page?: string;
  waMessage?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={whatsappLink(waMessage)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsAppClick(source, page)}
      className={`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${className}`}
    >
      {children}
    </a>
  );
}
