"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Logo from "@/components/Logo";
import SignOutButton from "@/components/admin/SignOutButton";
import { Icon, type IconName } from "./icons";

type Item = { href: string; label: string; icon: IconName };
type Group = { title: string; items: Item[] };

function groups(show: { members: boolean; roles: boolean }): Group[] {
  const config: Item[] = [];
  if (show.members) config.push({ href: "/admin/miembros", label: "Miembros", icon: "members" });
  if (show.roles) config.push({ href: "/admin/roles", label: "Roles", icon: "roles" });
  return [
    {
      title: "Operación",
      items: [
        { href: "/admin", label: "Hoy", icon: "today" },
        { href: "/admin/reservas", label: "Reservas", icon: "bookings" },
        { href: "/admin/reservas/nueva", label: "Nueva reserva", icon: "add" },
        { href: "/admin/bloqueos", label: "Bloqueos", icon: "block" },
      ],
    },
    ...(config.length ? [{ title: "Configuración", items: config }] : []),
  ];
}

/** ¿Qué item es el activo? El href más específico (prefijo más largo) que matchea. */
function activeHref(pathname: string, all: Item[]): string {
  let best = "";
  for (const it of all) {
    const match = pathname === it.href || (it.href !== "/admin" && pathname.startsWith(it.href + "/"));
    if (match && it.href.length > best.length) best = it.href;
  }
  return best;
}

function NavList({ data, active, onNavigate }: { data: Group[]; active: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-7">
      {data.map((g) => (
        <div key={g.title}>
          <p className="label-sm px-3 text-bone-mute/70">{g.title}</p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {g.items.map((it) => {
              const on = it.href === active;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={`group relative flex items-center gap-3 px-3 py-2.5 label transition-colors ${
                      on ? "text-gold" : "text-bone-dim hover:text-bone"
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-gold transition-opacity ${
                        on ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <Icon name={it.icon} size={17} className={on ? "text-gold" : "text-bone-mute group-hover:text-bone-dim"} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ show }: { show: { members: boolean; roles: boolean } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const data = groups(show);
  const active = activeHref(pathname, data.flatMap((g) => g.items));

  const Brand = (
    <Link href="/admin" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
      <Logo variant="mini" color="gold" height={26} />
      <span className="label text-bone-mute">Admin</span>
    </Link>
  );

  return (
    <>
      {/* Desktop: sidebar fija */}
      <aside className="hidden border-r hairline bg-ink lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col">
        <div className="border-b hairline px-5 py-5">{Brand}</div>
        <div className="flex-1 overflow-y-auto px-3 py-6">
          <NavList data={data} active={active} />
        </div>
        <div className="border-t hairline px-3 py-4">
          <SignOutButton />
        </div>
      </aside>

      {/* Móvil: barra superior + drawer */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b hairline bg-ink px-4 py-3 lg:hidden">
        {Brand}
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => setOpen(true)}
          className="text-bone-dim transition-colors hover:text-gold"
        >
          <Icon name="menu" size={22} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[80%] flex-col border-r hairline bg-ink">
            <div className="flex items-center justify-between border-b hairline px-5 py-4">
              {Brand}
              <button type="button" aria-label="Cerrar menú" onClick={() => setOpen(false)} className="text-bone-mute hover:text-gold">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-6">
              <NavList data={data} active={active} onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t hairline px-3 py-4">
              <SignOutButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
