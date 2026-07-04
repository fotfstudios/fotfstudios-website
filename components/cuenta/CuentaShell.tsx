import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/Logo";
import SignOutButton from "@/components/admin/SignOutButton";
import { Toaster } from "@/components/admin/ui/Toaster";
import CuentaTabs from "./CuentaTabs";
import { fmtPts } from "./format";

/**
 * Shell del área de clientes: header sticky (logo → sitio, chip de puntos,
 * CTA reservar, salir) + tabs. Sin sidebar — tres secciones caben en una fila.
 */
export default function CuentaShell({ balance, children }: { balance: number; children: ReactNode }) {
  return (
    <Toaster>
      <header className="sticky top-0 z-40 border-b hairline bg-ink/85 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-3 py-3.5">
            <Link href="/" aria-label="Volver al sitio" className="shrink-0">
              <Logo variant="mini" color="gold" height={24} />
            </Link>
            <Link href="/cuenta" className="label text-bone-mute transition-colors hover:text-bone">
              Mi cuenta
            </Link>
            <div className="flex-1" />
            <Link
              href="/cuenta"
              className="label-sm shrink-0 border hairline px-2.5 py-1 font-mono text-gold"
              title="Tus puntos disponibles"
            >
              {fmtPts(balance)} pts
            </Link>
            <Link
              href="/reservar"
              className="label-sm hidden bg-gold px-4 py-2 text-ink transition-opacity hover:opacity-90 sm:inline-block"
            >
              Reservar
            </Link>
            <SignOutButton
              redirectTo="/cuenta/login"
              className="label-sm flex items-center gap-1.5 px-1 py-2 text-bone-mute transition-colors hover:text-gold"
            />
          </div>
          <CuentaTabs />
        </div>
      </header>
      <main className="booth-glow min-h-screen">
        <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">{children}</div>
      </main>
    </Toaster>
  );
}
