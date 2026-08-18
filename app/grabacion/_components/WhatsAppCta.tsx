import type { ReactNode } from "react";
import SharedWhatsAppCta from "@/components/WhatsAppCta";
import { GRABACION } from "../_content";

/**
 * Especialización local del CTA compartido: mismo mensaje wa.me y `page`
 * histórico ("grabacion") en todos los CTA de la página; `source` etiqueta la
 * sección que originó el clic.
 */
export default function WhatsAppCta({
  source,
  className,
  children,
}: {
  source: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SharedWhatsAppCta source={source} page="grabacion" waMessage={GRABACION.waMessage} className={className}>
      {children}
    </SharedWhatsAppCta>
  );
}
