import { DateTime } from "luxon";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { fmtDate, fmtDateTime, fmtTimeRange } from "@/components/admin/format";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import type { ReservaOrden } from "@/src/domain/admin/reservas-list";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";

const TZ = "America/Santiago";

type Bucket = "hoy" | "manana" | "semana" | "proximas" | "pasadas";
const BUCKET_LABEL: Record<Bucket, string> = {
  hoy: "Hoy",
  manana: "Mañana",
  semana: "Esta semana",
  proximas: "Próximas",
  pasadas: "Pasadas",
};

function bucketFor(iso: string, today: DateTime): Bucket {
  const d = DateTime.fromISO(iso).setZone(TZ).startOf("day");
  const diff = d.diff(today, "days").days;
  if (diff < 0) return "pasadas";
  if (diff === 0) return "hoy";
  if (diff === 1) return "manana";
  return d <= today.endOf("week") ? "semana" : "proximas";
}

/**
 * Página de reservas ya filtrada/ordenada por el server. Bajo el orden por
 * fecha las filas vienen contiguas en el tiempo, así que los separadores
 * (Hoy/Mañana/…) se emiten al cambiar de bucket recorriendo las filas tal
 * cual llegan; con otros órdenes la agrupación no aplica y la tabla es plana.
 */
export function BookingsTable({ rows, orden }: { rows: AdminBooking[]; orden: ReservaOrden }) {
  const now = DateTime.now().setZone(TZ);
  const today = now.startOf("day");
  const grouped = orden === "fecha";

  const buckets = grouped ? rows.map((b) => bucketFor(b.startsAt, today)) : [];
  const bucketCounts = buckets.reduce<Partial<Record<Bucket, number>>>((acc, k) => {
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const body: ReactNode[] = rows.map((b, i) => {
    const header = grouped && buckets[i] !== buckets[i - 1] ? buckets[i] : null;
    return (
      <Fragment key={b.id}>
        {header && (
          <tr className="border-b hairline bg-ink/50">
            <td colSpan={5} className="label-sm px-4 py-2 text-bone-mute">
              {BUCKET_LABEL[header]} · {bucketCounts[header]}
            </td>
          </tr>
        )}
        <BookingRow b={b} now={now} />
      </Fragment>
    );
  });

  return (
    <DataTable
      minWidthClassName="min-w-[42rem]"
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
      {body}
    </DataTable>
  );
}

function BookingRow({ b, now }: { b: AdminBooking; now: DateTime }) {
  const isBlock = b.kind === "block";
  const isCourtesy = !isBlock && !b.orderId;
  const isRefunded = b.orderStatus === "refunded";
  const overdue =
    b.orderStatus === "pending_payment" &&
    b.status !== "cancelled" &&
    b.status !== "expired" &&
    DateTime.fromISO(b.startsAt) < now;
  const name = b.customerName ?? b.customerEmail ?? "—";
  const secondary = b.customerName ? (b.customerEmail ?? b.customerPhone) : b.customerPhone;

  return (
    <Tr muted={isBlock} className="group relative focus-within:bg-ink-soft">
      <Td className="whitespace-nowrap">
        <div className="font-mono text-bone">{fmtDate(b.startsAt)}</div>
        <div className="mt-0.5 font-mono text-xs text-bone-mute">{fmtTimeRange(b.startsAt, b.endsAt)}</div>
      </Td>
      <Td>
        {isBlock ? (
          <span className="label-sm inline-flex items-center gap-1.5 text-bone-mute">
            <Icon name="block" size={13} /> Bloqueo
          </span>
        ) : (
          <>
            <div className="flex max-w-64 items-center gap-2">
              <span className="truncate text-bone">{name}</span>
              {isCourtesy && <span className="label-sm shrink-0 text-gold">Cortesía</span>}
            </div>
            {secondary && (
              <div className="mt-0.5 max-w-64 truncate font-mono text-xs text-bone-mute">{secondary}</div>
            )}
          </>
        )}
      </Td>
      <Td>
        <StatusPill status={b.status} />
        {isRefunded && <div className="label-sm mt-1 text-bone-mute">Reembolsada</div>}
        {overdue && <div className="label-sm mt-1 text-sirena">Pago vencido</div>}
      </Td>
      <Td right className="whitespace-nowrap">
        <div className={`font-mono ${isRefunded ? "text-bone-mute" : "text-bone"}`}>
          {b.amount ? formatCLP(b.amount) : "—"}
        </div>
        {b.refundedAmount ? (
          <div className="mt-0.5 font-mono text-xs text-bone-mute">−{formatCLP(b.refundedAmount)}</div>
        ) : null}
      </Td>
      <Td right>
        <Link
          href={`/admin/reservas/${b.id}`}
          aria-label={
            isBlock
              ? `Ver bloqueo — ${fmtDateTime(b.startsAt)}`
              : `Ver reserva de ${name} — ${fmtDateTime(b.startsAt)}`
          }
          className="inline-flex text-bone-mute outline-none transition-colors after:absolute after:inset-0 group-hover:text-gold focus-visible:after:border focus-visible:after:border-gold"
        >
          <Icon name="chevron" size={18} />
        </Link>
      </Td>
    </Tr>
  );
}
