"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/cuenta", label: "Resumen" },
  { href: "/cuenta/reservas", label: "Reservas" },
  // El curso va aparte de Reservas: no es una reserva, es un asiento en una
  // generación, con su propia agenda y su propio estado de pago.
  { href: "/cuenta/curso", label: "Curso" },
  { href: "/cuenta/perfil", label: "Perfil" },
] as const;

/** Fila de tabs del área de cliente: activo en gold con subrayado. */
export default function CuentaTabs() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/cuenta" ? path === "/cuenta" : path.startsWith(href));

  return (
    <nav className="flex gap-6 overflow-x-auto" aria-label="Secciones de mi cuenta">
      {TABS.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            // El color solo no basta para saber cuál está activa (WCAG 1.4.1).
            aria-current={active ? "page" : undefined}
            className={`label whitespace-nowrap border-b-2 py-3 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-gold ${
              active ? "border-gold text-gold" : "border-transparent text-bone-dim hover:text-bone"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
