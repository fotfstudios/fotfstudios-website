"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Estado compartido de los TRES formularios de la landing: cuando uno envía, los tres
 * pasan a "Listo · Revisa tu correo" (la maqueta lo hace así a propósito — la persona
 * no debería encontrarse otro campo vacío más abajo después de haber pedido la guía).
 * Guarda el email enviado para mostrarlo en el panel.
 */
type GuiaLead = { sent: string | null; markSent: (email: string) => void };

const Ctx = createContext<GuiaLead | null>(null);

export function GuiaLeadProvider({ children }: { children: ReactNode }) {
  const [sent, setSent] = useState<string | null>(null);
  const value = useMemo<GuiaLead>(() => ({ sent, markSent: setSent }), [sent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuiaLead(): GuiaLead {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGuiaLead() fuera de <GuiaLeadProvider>");
  return v;
}
