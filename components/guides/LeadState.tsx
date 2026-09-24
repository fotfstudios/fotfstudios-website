"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** El copy del formulario de UNA guía: lo declara el `lib/*-content` de su landing. */
export interface GuideFormCopy {
  readonly placeholder: string;
  readonly finePrint: string;
  readonly privacyLink: string;
  readonly success: {
    readonly label: string;
    readonly title: string;
    readonly body: string;
    /** Botón "Usar otro correo" en el panel de éxito. Sin él, el panel no lo ofrece. */
    readonly reset?: string;
  };
}

/**
 * Estado compartido de TODOS los formularios de una landing de guía: cuando uno envía,
 * todos pasan a "Listo · Revisa tu correo" (la maqueta lo hace así a propósito — la
 * persona no debería encontrarse otro campo vacío más abajo después de haber pedido la
 * guía). Guarda el email enviado para mostrarlo en el panel, y lleva el copy del
 * formulario para que la página lo declare una sola vez.
 */
type GuiaLead = {
  sent: string | null;
  markSent: (email: string | null) => void;
  copy: GuideFormCopy;
  /**
   * Los `source` que declara ESTA guía, para que la validación del cliente use el mismo
   * catálogo que el servidor. Llegan por prop desde la página (un server component): si el
   * formulario importara lib/guides, el registro entero —claves del bucket, templateKey,
   * asuntos de correo— viajaría al navegador, porque se indexa de forma dinámica y ningún
   * bundler puede podarlo.
   */
  sources: readonly string[];
};

const Ctx = createContext<GuiaLead | null>(null);

export function GuiaLeadProvider({
  copy,
  sources,
  children,
}: {
  copy: GuideFormCopy;
  sources: readonly string[];
  children: ReactNode;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const value = useMemo<GuiaLead>(() => ({ sent, markSent: setSent, copy, sources }), [sent, copy, sources]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuiaLead(): GuiaLead {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGuiaLead() fuera de <GuiaLeadProvider>");
  return v;
}
