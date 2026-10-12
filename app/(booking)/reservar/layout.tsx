import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { bookingEnabled } from "@/src/composition";

/**
 * Gate del flag de reservas para /reservar. Vive en el LAYOUT y no en la página: la página
 * tiene loading.tsx, y su Suspense empieza a transmitir (status 200) antes de que la página
 * llegue a llamar notFound() → con el flag apagado salía un "404 suave" con status 200. El
 * layout se resuelve antes del límite de Suspense, así que acá notFound() da un 404 real.
 */
export default function ReservarLayout({ children }: { children: ReactNode }) {
  if (!bookingEnabled()) notFound();
  return children;
}
