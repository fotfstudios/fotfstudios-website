import { DateTime } from "luxon";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { fmtDate, fmtDateTime, fmtTimeRange } from "@/components/admin/format";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { isCourseSession, isMaintenanceBlock } from "@/src/domain/scheduling/reservation-kind";
import { paymentBadge, type PaymentBadgeTone } from "@/src/domain/admin/payment-badge";
import type { ReservaOrden } from "@/src/domain/admin/reservas-list";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";

const TZ = "America/Santiago";

/** Color de la columna Pago. Sirena solo para lo urgente (pago vencido). */
const TONE: Record<PaymentBadgeTone, string> = {
  ok: "text-bone",
  pending: "text-gold",
  muted: "text-bone-quiet",
  alert: "text-sirena",
};

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
 * `exactCounts`: los "· n" de los separadores solo se muestran cuando el
 * resultado cabe en una página (si no, contarían solo la página y mentirían).
 */
export function BookingsTable({
  rows,
  orden,
  exactCounts,
}: {
  rows: AdminBooking[];
  orden: ReservaOrden;
  exactCounts: boolean;
}) {
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
            <td colSpan={6} className="label-sm px-4 py-2 text-bone-quiet">
              {BUCKET_LABEL[header]}
              {exactCounts ? ` · ${bucketCounts[header]}` : ""}
            </td>
          </tr>
        )}
        <BookingRow b={b} now={now} />
      </Fragment>
    );
  });

  return (
    <DataTable
      minWidthClassName="min-w-[50rem]"
      head={
        <>
          <Th>Cuándo</Th>
          <Th>Cliente</Th>
          <Th>Estado</Th>
          <Th>Pago</Th>
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
  const isBlock = isMaintenanceBlock(b.kind);
  const isCurso = isCourseSession(b.kind);
  const isRefunded = b.orderStatus === "refunded";
  // El cobro va en su propia columna (antes el estado de la reserva hacía de todo).
  const pago = paymentBadge(b, now.toJSDate());
  const name = b.customerName ?? b.customerEmail ?? (isCurso ? "Sin alumno asignado" : "—");
  const secondary = b.customerName ? (b.customerEmail ?? b.customerPhone) : b.customerPhone;

  return (
    <Tr muted={isBlock} className="group relative focus-within:bg-ink-soft">
      <Td className="whitespace-nowrap">
        <div className="font-mono text-bone">{fmtDate(b.startsAt)}</div>
        <div className="mt-0.5 font-mono text-xs text-bone-quiet">{fmtTimeRange(b.startsAt, b.endsAt)}</div>
      </Td>
      <Td>
        {isBlock ? (
          <span className="label-sm inline-flex items-center gap-1.5 text-bone-quiet">
            <Icon name="block" size={13} /> Bloqueo
          </span>
        ) : (
          <>
            <div className="flex max-w-64 items-center gap-2">
              <span className="truncate text-bone">{name}</span>
              {b.kind === "prueba" && <span className="label-sm shrink-0 text-gold">Prueba del curso</span>}
              {isCurso && (
                <span className="label-sm shrink-0 text-gold">
                  Curso{b.courseSession ? ` · Sesión ${b.courseSession.n}` : ""}
                </span>
              )}
            </div>
            {secondary && (
              <div className="mt-0.5 max-w-64 truncate font-mono text-xs text-bone-quiet">{secondary}</div>
            )}
          </>
        )}
      </Td>
      <Td>
        <StatusPill status={b.status} />
      </Td>
      <Td>
        {pago ? (
          <>
            <div className={`label-sm ${TONE[pago.tone]}`}>{pago.label}</div>
            {pago.dueAt && <div className="mt-0.5 font-mono text-xs text-bone-quiet">vence {fmtDateTime(pago.dueAt)}</div>}
          </>
        ) : (
          <span className="text-bone-quiet">—</span>
        )}
      </Td>
      <Td right className="whitespace-nowrap">
        <div className={`font-mono ${isRefunded ? "text-bone-quiet" : "text-bone"}`}>
          {b.amount ? formatCLP(b.amount) : "—"}
        </div>
        {b.refundedAmount ? (
          <div className="mt-0.5 font-mono text-xs text-bone-quiet">−{formatCLP(b.refundedAmount)}</div>
        ) : null}
      </Td>
      <Td right>
        <Link
          href={`/admin/reservas/${b.id}`}
          aria-label={
            isBlock
              ? `Ver bloqueo — ${fmtDateTime(b.startsAt)}`
              : isCurso
                ? `Ver sesión del curso — ${fmtDateTime(b.startsAt)}`
              : `Ver reserva de ${name} — ${fmtDateTime(b.startsAt)}`
          }
          className="inline-flex text-bone-quiet outline-none transition-colors after:absolute after:inset-0 group-hover:text-gold focus-visible:after:border focus-visible:after:border-gold"
        >
          <Icon name="chevron" size={18} />
        </Link>
      </Td>
    </Tr>
  );
}
