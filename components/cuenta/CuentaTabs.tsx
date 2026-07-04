"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/cuenta", label: "Resumen" },
  { href: "/cuenta/reservas", label: "Reservas" },
  { href: "/cuenta/perfil", label: "Perfil" },
] as const;

/** Fila de tabs del área de cliente: activo en gold con subrayado. */
export default function CuentaTabs() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/cuenta" ? path === "/cuenta" : path.startsWith(href));

  return (
    <nav className="flex gap-6 overflow-x-auto" aria-label="Secciones de mi cuenta">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`label whitespace-nowrap border-b-2 pb-2.5 transition-colors ${
            isActive(t.href)
              ? "border-gold text-gold"
              : "border-transparent text-bone-dim hover:text-bone"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
