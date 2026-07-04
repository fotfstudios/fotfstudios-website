import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { accountEnabled } from "@/lib/flags";

/**
 * El login es un client component (no puede exportar metadata); este layout
 * aporta título + noindex y el gate del feature flag. Noindex por página, no
 * `disallow` en robots.txt (anunciaría la ruta).
 */
export const metadata: Metadata = { title: "Acceso — Mi cuenta", robots: { index: false } };

export default function LoginLayout({ children }: { children: ReactNode }) {
  if (!accountEnabled()) notFound();
  return children;
}
