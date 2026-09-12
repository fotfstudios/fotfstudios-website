import type { ReactNode } from "react";
import PublicChrome from "@/components/PublicChrome";

/**
 * Layout fino de /cuenta, encima de login/layout.tsx y (panel)/layout.tsx (ninguno monta
 * chrome público). Existe solo para montar la medición pública (GTM +
 * consentimiento + Vercel Analytics) en todo /cuenta: el cliente es tráfico público
 * (whatsapp_click sale de /cuenta/reservas), a diferencia de /admin, que no se mide.
 * /cuenta conserva GTM por decisión (addendum de docs/audits/2026-08-18-gtm-ga4-audit.md).
 * No es gate ni error boundary: accountEnabled()/requireCustomer() siguen en los
 * layouts hijos, y sus notFound() caen en app/not-found.tsx (raíz), sin este layout.
 */
export default function CuentaRootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PublicChrome />
    </>
  );
}
