"use client";

import type { ReactNode } from "react";
import { track } from "@vercel/analytics";
import { whatsappLink } from "@/lib/site";
import { CURSO } from "../_content";

/**
 * The page's single conversion action: every CTA on /curso-dj renders this
 * anchor with the same wa.me link and prefilled message; `source` tags which
 * section drove the click. Fires both GTM (dataLayer — a matching tag must be
 * configured in the container) and Vercel Analytics custom events.
 */
export default function WhatsAppCta({
  source,
  className = "",
  children,
}: {
  source: string;
  className?: string;
  children: ReactNode;
}) {
  const handleClick = () => {
    // window.dataLayer is globally declared in components/ConsentBanner.tsx
    window.dataLayer?.push({ event: "whatsapp_click", source, page: "curso-dj" });
    track("whatsapp_click", { source, page: "curso-dj" });
  };

  return (
    <a
      href={whatsappLink(CURSO.waMessage)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${className}`}
    >
      {children}
    </a>
  );
}
