"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import { type ReactNode } from "react";
import { Icon } from "@/components/admin/ui/icons";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";

const TZ = "America/Santiago";
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function AgendaWeek({ weekStartISO, bookings }: { weekStartISO: string; bookings: AdminBooking[] }) {
  const weekStart = DateTime.fromISO(weekStartISO, { zone: TZ });
  const today = DateTime.now().setZone(TZ).toISODate();
  const prev = weekStart.minus({ weeks: 1 }).toISODate();
  const next = weekStart.plus({ weeks: 1 }).toISODate();

  const byDay: Record<string, AdminBooking[]> = {};
  for (const b of bookings) {
    const day = DateTime.fromISO(b.startsAt).setZone(TZ).toISODate()!;
    (byDay[day] ??= []).push(b);
  }
  for (const k in byDay) byDay[k].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const label = `${weekStart.setLocale("es").toFormat("d LLL")} – ${weekStart
    .plus({ days: 6 })
    .setLocale("es")
    .toFormat("d LLL yyyy")}`;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="label text-bone-mute">{label}</span>
        <div className="flex items-center gap-1">
          <NavBtn href={`/admin/agenda?w=${prev}`} aria="Semana anterior">
            <Icon name="chevron" size={16} className="rotate-180" />
          </NavBtn>
          <Link href="/admin/agenda" className="px-3 py-1.5 label-sm text-bone-dim transition-colors hover:text-gold">
            Hoy
          </Link>
          <NavBtn href={`/admin/agenda?w=${next}`} aria="Semana siguiente">
            <Icon name="chevron" size={16} />
          </NavBtn>
        </div>
      </div>

      {bookings.length === 0 && (
        <p className="mb-3 label-sm text-bone-mute">Sin reservas esta semana.</p>
      )}

      <div className="grid gap-2 md:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => {
          const day = weekStart.plus({ days: i });
          const iso = day.toISODate()!;
          const items = byDay[iso] ?? [];
          const isToday = iso === today;
          return (
            <div key={iso} className={`border hairline ${isToday ? "ring-1 ring-inset ring-gold/50" : ""}`}>
              <div className={`border-b hairline px-3 py-2 ${isToday ? "bg-gold/10" : "bg-ink/40"}`}>
                <p className={`label-sm ${isToday ? "text-gold" : "text-bone-mute"}`}>{DAYS[i]}</p>
                <p className={`font-display text-lg ${isToday ? "text-gold" : "text-bone"}`}>{day.day}</p>
              </div>
              <div className="flex flex-col gap-1.5 p-2 md:min-h-36">
                {items.length === 0 ? (
                  <span className="px-1 py-2 label-sm text-bone-mute/40">—</span>
                ) : (
                  items.map((b) => <Cell key={b.id} b={b} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ b }: { b: AdminBooking }) {
  const isBlock = b.kind === "block";
  const start = DateTime.fromISO(b.startsAt).setZone(TZ).toFormat("HH:mm");
  const end = DateTime.fromISO(b.endsAt).setZone(TZ).toFormat("HH:mm");
  const name = isBlock ? "Bloqueo" : (b.customerName ?? b.customerEmail ?? "Reserva");
  return (
    <Link
      href={`/admin/reservas/${b.id}`}
      className={`block border-l-2 px-2.5 py-1.5 transition-colors hover:bg-ink-soft ${
        isBlock ? "border-bone-mute/40 opacity-70" : "border-gold"
      }`}
    >
      <p className="font-mono text-xs text-bone">
        {start}–{end}
      </p>
      <p className="mt-0.5 truncate text-xs text-bone-dim">{name}</p>
    </Link>
  );
}

function NavBtn({ href, aria, children }: { href: string; aria: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={aria}
      className="flex size-8 items-center justify-center border hairline text-bone-dim transition-colors hover:border-gold hover:text-gold"
    >
      {children}
    </Link>
  );
}
