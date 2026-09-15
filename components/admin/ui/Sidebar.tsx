"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import SignOutButton from "@/components/admin/SignOutButton";
import { Icon, type IconName } from "./icons";

type Item = { href: string; label: string; icon: IconName; badge?: number };
type Group = { title: string; items: Item[] };

function groups(
  show: { members: boolean; roles: boolean; analytics: boolean; applications: boolean; course: boolean; customers: boolean; lock: boolean; sii: boolean },
  porHacer: number,
  solicitudes: number,
  pendientesSii: number,
): Group[] {
  const analysis: Item[] = show.analytics
    ? [{ href: "/admin/analitica", label: "Analíticas", icon: "chart" }]
    : [];
  const config: Item[] = [];
  if (show.members) config.push({ href: "/admin/miembros", label: "Miembros", icon: "members" });
  if (show.roles) config.push({ href: "/admin/roles", label: "Roles", icon: "roles" });
  const operacion: Item[] = [
    { href: "/admin", label: "Hoy", icon: "today", badge: porHacer },
    { href: "/admin/agenda", label: "Agenda", icon: "clock" },
    { href: "/admin/reservas", label: "Reservas", icon: "bookings" },
    { href: "/admin/reservas/nueva", label: "Nueva reserva", icon: "add" },
    { href: "/admin/bloqueos", label: "Bloqueos", icon: "block" },
  ];
  // Clientes va junto a Reservas (es su directorio), pero solo con el permiso:
  // sin él la sección da 403 y un enlace muerto en el menú es peor que ninguno.
  if (show.customers) operacion.splice(3, 0, { href: "/admin/clientes", label: "Clientes", icon: "members" });
  // Cerradura después de Bloqueos: es operación de sala, no de agenda. Con el mismo
  // permiso que la card de acceso de la ficha.
  if (show.lock) operacion.push({ href: "/admin/cerradura", label: "Cerradura", icon: "lock" });
  // Curso antes que Postulaciones: el curso es dinero de clientes, postulaciones
  // es contratación. Operación está ordenada por cercanía al ingreso.
  if (show.course) operacion.push({ href: "/admin/curso", label: "Curso", icon: "curso", badge: solicitudes });
  // SII después de Curso: es la cola de la plata que ya entró (boletas y NC por emitir),
  // con el mismo permiso que el botón "Registrar folio". Sin permiso, sin enlace.
  if (show.sii) operacion.push({ href: "/admin/sii", label: "SII", icon: "doc", badge: pendientesSii });
  if (show.applications) {
    operacion.push({ href: "/admin/postulaciones", label: "Postulaciones", icon: "user" });
  }
  return [
    {
      title: "Operación",
      items: operacion,
    },
    ...(analysis.length ? [{ title: "Análisis", items: analysis }] : []),
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
          <p className="label-sm px-3 text-bone-quiet">{g.title}</p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {g.items.map((it) => {
              const on = it.href === active;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={`group relative flex items-center gap-3 px-3 py-3 label transition-colors lg:py-2.5 ${
                      on ? "text-gold" : "text-bone-dim hover:text-bone"
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-gold transition-opacity ${
                        on ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <Icon name={it.icon} size={17} className={on ? "text-gold" : "text-bone-quiet group-hover:text-bone-dim"} />
                    {it.label}
                    {it.badge ? (
                      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-gold px-1.5 font-mono text-[10px] font-bold text-ink">
                        {it.badge}
                      </span>
                    ) : null}
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

export function Sidebar({
  show,
  porHacer = 0,
  solicitudes = 0,
  pendientesSii = 0,
}: {
  show: { members: boolean; roles: boolean; analytics: boolean; applications: boolean; course: boolean; customers: boolean; lock: boolean; sii: boolean };
  porHacer?: number;
  solicitudes?: number;
  pendientesSii?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const data = groups(show, porHacer, solicitudes, pendientesSii);
  const active = activeHref(pathname, data.flatMap((g) => g.items));

  // El drawer es un <dialog> siempre montado: showModal()/close() siguen a `open`.
  // Al cerrar con close() el navegador devuelve el foco al botón del menú.
  useEffect(() => {
    const el = drawer.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  // Si el viewport pasa a desktop con el drawer abierto, lg:hidden lo oculta pero
  // seguiría siendo modal (página inerte): se cierra.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const Brand = (
    <Link href="/admin" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
      <Logo variant="mini" color="gold" height={26} />
      <span className="label text-bone-quiet">Admin</span>
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
          className="-m-3 p-3 text-bone-dim transition-colors hover:text-gold"
        >
          <Icon name="menu" size={22} />
        </button>
      </div>
      {/* Drawer: <dialog> modal (foco atrapado, Escape, fondo inerte). Un click en el
          scrim llega con el <dialog> como target; el panel interior cubre el resto. */}
      <dialog
        ref={drawer}
        aria-label="Menú"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-0 h-full max-h-none w-72 max-w-[80%] border-r hairline bg-ink p-0 text-bone backdrop:bg-ink/80 backdrop:backdrop-blur-sm lg:hidden"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b hairline px-5 py-4">
            {Brand}
            <button type="button" aria-label="Cerrar menú" onClick={() => setOpen(false)} className="-m-3 p-3 text-bone-quiet hover:text-gold">
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
      </dialog>
    </>
  );
}
