import type { ReactNode } from "react";
import PublicChrome from "@/components/PublicChrome";

/**
 * Grupo transaccional — /reservar y /reserva/estado (route group, no afecta URLs).
 * Solo la medición pública (GTM + consentimiento + Vercel Analytics): WhatsAppCta
 * dispara whatsapp_click desde /reserva/estado y un visitante de la UE puede
 * aterrizar aquí sin haber visto nunca el banner. Sin cursor ni medidor (chrome de
 * marketing, app/(marketing)/layout.tsx) y sin Nav/Footer (cada página trae su
 * back-link). Los notFound() de estas páginas caen en app/not-found.tsx (raíz), que
 * se renderiza SIN este layout y monta PublicChrome por su cuenta — no se duplica.
 */
export default function BookingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PublicChrome />
    </>
  );
}
