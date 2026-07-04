import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { accountEnabled } from "@/lib/flags";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";

export const metadata: Metadata = { title: "Mi cuenta — FOTF Studios", robots: { index: false } };

/**
 * Grupo autenticado de /cuenta: exige sesión (defensa además del middleware).
 * El shell del cliente (header + tabs + chip de puntos) llega con las páginas;
 * por ahora un contenedor mínimo con la luz de cabina.
 */
export default async function CuentaLayout({ children }: { children: ReactNode }) {
  if (!accountEnabled()) notFound();
  await requireCustomer();

  return (
    <div className="booth-glow min-h-screen">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">{children}</div>
    </div>
  );
}
