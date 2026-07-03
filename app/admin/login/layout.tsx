import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * El login es un client component (no puede exportar metadata); este layout
 * mínimo aporta título + noindex. Preferimos noindex por página a un
 * `disallow: /admin` en robots.txt, que anunciaría la ruta públicamente.
 */
export const metadata: Metadata = { title: "Acceso — Admin", robots: { index: false } };

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
