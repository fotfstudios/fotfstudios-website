import type { ReactNode } from "react";
import CustomCursor from "@/components/CustomCursor";
import PublicChrome from "@/components/PublicChrome";

/**
 * Chrome de marketing (route group — no afecta URLs): cursor de cabina, medidor de
 * scroll y la medición pública (PublicChrome). Solo aquí: (booking) y /cuenta llevan
 * solo PublicChrome; /admin no lleva nada.
 *
 * Nav y Footer NO van aquí: cada página monta los suyos ((guias)/layout.tsx los de
 * las guías) y curso-dj, grabacion y curso-dj/pago usan Logo + Footer a propósito.
 *
 * Devuelve un fragmento a propósito: cualquier wrapper con transform/filter/contain/
 * backdrop-filter sería el containing block del cursor, del medidor, del Nav y del
 * banner de consentimiento (todos position: fixed) y atraparía el mix-blend-mode
 * del cursor.
 *
 * data-surface="marketing" es el gancho de html:has(...) en globals.css para el
 * scroll suave: solo el root layout pinta <html>, así que el marcador se monta aquí.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="scroll-meter" data-surface="marketing" aria-hidden />
      <CustomCursor />
      {children}
      <PublicChrome />
    </>
  );
}
