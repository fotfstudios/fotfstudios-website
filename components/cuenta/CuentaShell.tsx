import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/Logo";
import SignOutButton from "@/components/admin/SignOutButton";
import { Toaster } from "@/components/admin/ui/Toaster";
import CuentaTabs from "./CuentaTabs";
import { fmtPts } from "./format";

/**
 * Shell del área de clientes: header sticky (logo → sitio, chip de puntos,
 * CTA reservar, salir) + tabs. Sin sidebar — cuatro secciones caben en una fila.
 * Pensado a 375px primero: todos los controles miden ≥ 40px de alto, la CTA
 * Reservar se ve también en teléfono (el rótulo "Mi cuenta" es lo que se esconde
 * ahí — las tabs ya dicen dónde estás) y la fila cabe en 335px útiles.
 */
export default function CuentaShell({ balance, children }: { balance: number; children: ReactNode }) {
  return (
    <Toaster>
      {/* data-surface="tool": misma escala de letra menuda que el admin (globals.css). */}
      <div data-surface="tool" className="contents">
        <header className="sticky top-0 z-40 border-b hairline bg-ink/85 backdrop-blur-md">
          <div className="mx-auto max-w-4xl px-5 sm:px-8">
            <div className="flex items-center gap-2 py-2 sm:gap-3">
              <Link
                href="/"
                aria-label="Volver al sitio"
                className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center outline-none focus-visible:ring-1 focus-visible:ring-gold"
              >
                <Logo variant="mini" color="gold" height={24} />
              </Link>
              <Link
                href="/cuenta"
                className="label hidden min-h-10 items-center text-bone-quiet outline-none transition-colors hover:text-bone focus-visible:ring-1 focus-visible:ring-gold sm:inline-flex"
              >
                Mi cuenta
              </Link>
              <div className="flex-1" />
              <Link
                href="/cuenta"
                className="label-sm inline-flex min-h-10 shrink-0 items-center border hairline px-2.5 font-mono text-gold outline-none focus-visible:ring-1 focus-visible:ring-gold"
                title="Tus puntos disponibles"
              >
                {fmtPts(balance)} pts
              </Link>
              <Link
                href="/reservar"
                className="label-sm inline-flex min-h-10 shrink-0 items-center bg-gold px-3 text-ink outline-none transition-opacity hover:opacity-90 focus-visible:ring-1 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink sm:px-4"
              >
                Reservar
              </Link>
              <SignOutButton
                redirectTo="/cuenta/login"
                className="label-sm flex min-h-10 items-center gap-1.5 px-1 text-bone-quiet outline-none transition-colors hover:text-gold focus-visible:ring-1 focus-visible:ring-gold"
              />
            </div>
            <CuentaTabs />
          </div>
        </header>
        <main className="min-h-screen">
          <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">{children}</div>
        </main>
      </div>
    </Toaster>
  );
}
