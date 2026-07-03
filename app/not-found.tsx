import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada" };

/** 404 del sitio (también atiende URLs inexistentes bajo /admin). */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="label text-gold">404</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        Página no encontrada
      </h1>
      <p className="mt-4 max-w-sm leading-relaxed text-bone-dim">
        La página que buscas no existe o cambió de lugar.
      </p>
      <Link href="/" className="label-sm mt-8 text-bone-mute transition-colors hover:text-gold">
        ← Volver al inicio
      </Link>
    </main>
  );
}
