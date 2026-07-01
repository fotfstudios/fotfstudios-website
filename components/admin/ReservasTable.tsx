"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { inputCls } from "@/components/admin/ui/styles";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";

const TZ = "America/Santiago";

type TabKey = "todas" | "confirmadas" | "espera" | "canceladas" | "bloqueos";
const TABS: { key: TabKey; label: string; test: (b: AdminBooking) => boolean }[] = [
  { key: "todas", label: "Todas", test: () => true },
  { key: "confirmadas", label: "Confirmadas", test: (b) => b.kind !== "block" && b.status === "confirmed" },
  { key: "espera", label: "En espera", test: (b) => b.status === "held" },
  { key: "canceladas", label: "Canceladas", test: (b) => b.status === "cancelled" || b.status === "expired" },
  { key: "bloqueos", label: "Bloqueos", test: (b) => b.kind === "block" },
];

type Bucket = "hoy" | "manana" | "semana" | "proximas" | "pasadas";
const BUCKET_LABEL: Record<Bucket, string> = {
  hoy: "Hoy",
  manana: "Mañana",
  semana: "Esta semana",
  proximas: "Próximas",
  pasadas: "Pasadas",
};
const BUCKET_ORDER: Bucket[] = ["hoy", "manana", "semana", "proximas", "pasadas"];

function bucketFor(iso: string, today: DateTime): Bucket {
  const d = DateTime.fromISO(iso).setZone(TZ).startOf("day");
  const diff = d.diff(today, "days").days;
  if (diff < 0) return "pasadas";
  if (diff === 0) return "hoy";
  if (diff === 1) return "manana";
  return d <= today.endOf("week") ? "semana" : "proximas";
}

export function ReservasTable({ bookings }: { bookings: AdminBooking[] }) {
  const [tab, setTab] = useState<TabKey>("todas");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, bookings.filter(t.test).length])) as Record<TabKey, number>,
    [bookings],
  );

  const groups = useMemo(() => {
    const today = DateTime.now().setZone(TZ).startOf("day");
    const needle = q.trim().toLowerCase();
    const test = TABS.find((t) => t.key === tab)!.test;
    const filtered = bookings.filter(test).filter((b) => {
      if (!needle) return true;
      return `${b.customerName ?? ""} ${b.customerEmail ?? ""}`.toLowerCase().includes(needle);
    });
    const g: Record<Bucket, AdminBooking[]> = { hoy: [], manana: [], semana: [], proximas: [], pasadas: [] };
    for (const b of filtered) g[bucketFor(b.startsAt, today)].push(b);
    for (const k of BUCKET_ORDER) {
      g[k].sort((a, b) => (k === "pasadas" ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));
    }
    return g;
  }, [bookings, tab, q]);

  const total = BUCKET_ORDER.reduce((s, k) => s + groups[k].length, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap border-b hairline">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 label-sm transition-colors ${
                tab === t.key ? "border-gold text-gold" : "border-transparent text-bone-mute hover:text-bone"
              }`}
            >
              {t.label} <span className={tab === t.key ? "text-gold/70" : "text-bone-mute/60"}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          aria-label="Buscar cliente"
          className={`${inputCls} max-w-56`}
        />
      </div>

      {total === 0 ? (
        <EmptyState
          size="compact"
          icon="bookings"
          title="Sin resultados"
          hint="Probá con otro filtro o búsqueda."
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTab("todas");
                setQ("");
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <DataTable
          head={
            <>
              <Th>Cuándo</Th>
              <Th>Cliente</Th>
              <Th>Estado</Th>
              <Th right>Monto</Th>
              <Th />
            </>
          }
        >
          {BUCKET_ORDER.filter((k) => groups[k].length > 0).map((k) => (
            <GroupRows key={k} label={BUCKET_LABEL[k]} items={groups[k]} />
          ))}
        </DataTable>
      )}
    </div>
  );
}

function GroupRows({ label, items }: { label: string; items: AdminBooking[] }) {
  return (
    <>
      <tr className="border-b hairline bg-ink/50">
        <td colSpan={5} className="label-sm px-4 py-2 text-bone-mute">
          {label} · {items.length}
        </td>
      </tr>
      {items.map((b) => {
        const isBlock = b.kind === "block";
        const isCourtesy = !isBlock && !b.orderId;
        return (
          <Tr key={b.id} muted={isBlock}>
            <Td className="whitespace-nowrap font-mono text-bone">{fmtDateTime(b.startsAt)}</Td>
            <Td className="text-bone-dim">
              {isBlock ? (
                <span className="inline-flex items-center gap-1.5 label-sm text-bone-mute">
                  <Icon name="block" size={13} /> Bloqueo
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {b.customerName ?? b.customerEmail ?? "—"}
                  {isCourtesy && <span className="label-sm text-gold">Cortesía</span>}
                </span>
              )}
            </Td>
            <Td>
              <StatusPill status={b.status} />
            </Td>
            <Td right className="whitespace-nowrap font-mono text-bone">
              {b.amount ? formatCLP(b.amount) : "—"}
            </Td>
            <Td right>
              <Link
                href={`/admin/reservas/${b.id}`}
                aria-label="Ver detalle"
                className="inline-flex text-bone-mute transition-colors hover:text-gold"
              >
                <Icon name="chevron" size={18} />
              </Link>
            </Td>
          </Tr>
        );
      })}
    </>
  );
}
