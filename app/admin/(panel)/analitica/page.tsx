import Link from "next/link";
import { DateTime } from "luxon";
import { fmtPct } from "@/components/admin/format";
import { Bars } from "@/components/admin/ui/Bars";
import { Card } from "@/components/admin/ui/Card";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { MeterCell } from "@/components/admin/ui/MeterCell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { adminRepository } from "@/src/composition";
import { computeAnalytics } from "@/src/domain/analytics/metrics";
import { formatCLP } from "@/src/domain/money/money";
import { dayBoundsUtc, monthDates, todayInTz } from "@/src/domain/scheduling/time";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analíticas — Admin", robots: { index: false } };

const TZ = "America/Santiago";
const RANGES = ["7", "30", "90"] as const;

/** Fechas locales consecutivas terminando HOY (largo n). */
function lastDates(n: number): string[] {
  const today = DateTime.fromISO(todayInTz(TZ), { zone: TZ });
  return Array.from({ length: n }, (_, i) => today.minus({ days: n - 1 - i }).toFormat("yyyy-MM-dd"));
}

function resolveRange(r: string | undefined, m: string | undefined) {
  if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) {
    const dates = monthDates(m);
    const prevMonth = DateTime.fromISO(`${m}-01`).minus({ months: 1 }).toFormat("yyyy-MM");
    return {
      mode: "month" as const,
      month: m,
      dates,
      prevDates: monthDates(prevMonth),
      bucket: "day" as const,
      title: DateTime.fromISO(`${m}-01`).setLocale("es").toFormat("LLLL yyyy"),
    };
  }
  const days = RANGES.includes(r as (typeof RANGES)[number]) ? Number(r) : 30;
  const dates = lastDates(days);
  const prevEnd = DateTime.fromISO(dates[0], { zone: TZ }).minus({ days: 1 });
  const prevDates = Array.from({ length: days }, (_, i) =>
    prevEnd.minus({ days: days - 1 - i }).toFormat("yyyy-MM-dd"),
  );
  return {
    mode: "range" as const,
    days,
    dates,
    prevDates,
    bucket: days === 90 ? ("week" as const) : ("day" as const),
    title: `Últimos ${days} días`,
  };
}

export default async function AnaliticaPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; m?: string }>;
}) {
  await requirePermission("analytics.view");
  const { r, m } = await searchParams;
  const range = resolveRange(r, m);

  const startUtc = dayBoundsUtc(range.dates[0], TZ).startUtc;
  const endUtc = dayBoundsUtc(range.dates[range.dates.length - 1], TZ).endUtc;
  const prevStartUtc = dayBoundsUtc(range.prevDates[0], TZ).startUtc;
  const prevEndUtc = dayBoundsUtc(range.prevDates[range.prevDates.length - 1], TZ).endUtc;

  const repo = adminRepository();
  const [rows, prevRows, schedule, priorCustomerEmails] = await Promise.all([
    repo.analyticsReservations(startUtc, endUtc),
    repo.analyticsReservations(prevStartUtc, prevEndUtc),
    repo.analyticsSchedule(),
    repo.priorCustomerEmails(startUtc),
  ]);
  const orderIds = [...new Set(rows.map((x) => x.order?.id).filter((id): id is string => !!id))];
  const lines = await repo.analyticsLines(orderIds);

  const s = computeAnalytics({
    rows,
    prevRows,
    lines,
    dates: range.dates,
    prevDates: range.prevDates,
    tz: TZ,
    bucket: range.bucket,
    openingHours: schedule.openingHours,
    exceptions: schedule.exceptions,
    priorCustomerEmails,
  });

  // Navegación mensual (tope: mes actual).
  const currentMonth = todayInTz(TZ).slice(0, 7);
  const navMonth = range.mode === "month" ? range.month : currentMonth;
  const prevM = DateTime.fromISO(`${navMonth}-01`).minus({ months: 1 }).toFormat("yyyy-MM");
  const nextM = DateTime.fromISO(`${navMonth}-01`).plus({ months: 1 }).toFormat("yyyy-MM");
  const monthLabel = DateTime.fromISO(`${navMonth}-01`).setLocale("es").toFormat("LLLL yyyy");

  const pill = (active: boolean) =>
    `label px-4 py-2 transition-colors ${active ? "bg-gold text-ink" : "border hairline text-bone-dim hover:text-gold"}`;
  const delta = (pct: number | null) => (pct == null ? null : { pct });
  const noData = rows.filter((x) => x.kind === "booking").length === 0;

  return (
    <>
      <PageHeader
        kicker="Análisis"
        title="Analíticas"
        editorial="Los números de la cabina, sin vueltas."
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {RANGES.map((d) => (
          <Link key={d} href={`/admin/analitica?r=${d}`} className={pill(range.mode === "range" && range.days === Number(d))}>
            {d} días
          </Link>
        ))}
        <span className="mx-2 h-5 w-px bg-ink-line" aria-hidden />
        <div className="flex items-center gap-2">
          <Link href={`/admin/analitica?m=${prevM}`} aria-label="Mes anterior" className={pill(false)}>
            ‹
          </Link>
          <Link
            href={`/admin/analitica?m=${navMonth}`}
            className={`label px-2 ${range.mode === "month" ? "text-gold" : "text-bone-dim hover:text-gold"}`}
          >
            {monthLabel}
          </Link>
          {nextM <= currentMonth ? (
            <Link href={`/admin/analitica?m=${nextM}`} aria-label="Mes siguiente" className={pill(false)}>
              ›
            </Link>
          ) : (
            <span className={`${pill(false)} pointer-events-none opacity-30`}>›</span>
          )}
        </div>
        <span className="ml-auto label-sm text-bone-mute">{range.title}</span>
      </div>

      {noData ? (
        <div className="mt-8">
          <EmptyState
            icon="chart"
            title="Sin datos en este rango"
            hint="Cuando haya reservas en el período, verás ingresos, ocupación y clientes aquí."
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Ingresos" value={formatCLP(s.revenue.total)} delta={delta(s.revenue.deltaPct)} />
            <Stat label="Ocupación" value={fmtPct(s.occupancy.pct)} delta={delta(s.occupancy.deltaPct)} />
            <Stat label="Sesiones pagadas" value={String(s.sessions.paid)} delta={delta(s.sessions.deltaPct)} />
            <Stat label="Ticket promedio" value={s.sessions.avgTicket != null ? formatCLP(s.sessions.avgTicket) : "—"} />
          </div>

          <div className="mt-8">
            <Card title={range.bucket === "week" ? "Ingresos por semana" : "Ingresos por día"}>
              <Bars
                data={s.revenue.buckets}
                format={formatCLP}
                ariaLabel={`Ingresos por ${range.bucket === "week" ? "semana" : "día"}, ${range.title}: total ${formatCLP(s.revenue.total)}`}
              />
              <p className="label-sm mt-3 text-bone-mute">
                Comisiones MP (solo pagos online): {formatCLP(s.revenue.mpFees)} · Reembolsado:{" "}
                {formatCLP(s.revenue.refundedTotal)}
              </p>
            </Card>
          </div>

          <div className="mt-3">
            <Card title="Ocupación por día de semana">
              <Bars
                data={s.occupancy.byWeekday.map((d) => ({ label: d.label, value: d.pct }))}
                format={fmtPct}
                ariaLabel={`Ocupación por día de semana, ${range.title}: promedio ${fmtPct(s.occupancy.pct)}`}
              />
              <p className="label-sm mt-3 text-bone-mute">
                {Math.round(s.occupancy.bookedMinutes / 60)} h reservadas de{" "}
                {Math.round(s.occupancy.openMinutes / 60)} h abiertas (horario real, con excepciones).
              </p>
            </Card>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card title="Embudo de reservas" bodyClassName="p-0">
              <ul className="text-sm">
                {(
                  [
                    ["Pagadas online", s.funnel.online, "text-bone"],
                    ["Pagadas offline", s.funnel.offline, "text-bone"],
                    ["Cortesías", s.funnel.courtesy, "text-bone-dim"],
                    ["Canceladas (sin reembolso)", s.funnel.cancelled, "text-bone-dim"],
                    ["Reembolsadas", s.funnel.refunded, "text-bone-dim"],
                    ["Holds vencidos sin pago", s.funnel.expiredHolds, "text-bone-mute"],
                  ] as const
                ).map(([label, n, tone]) => (
                  <li key={label} className="flex items-center justify-between border-b hairline px-5 py-3 last:border-b-0">
                    <span className="text-bone-dim">{label}</span>
                    <span className={`font-mono ${tone}`}>{n}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Add-ons (attach sobre sesiones pagadas)" bodyClassName={s.addons.length ? "p-0" : undefined}>
              {s.addons.length === 0 ? (
                <EmptyState size="compact" title="Sin add-ons en el rango" hint="Grabaciones y sesiones guiadas aparecerán aquí." />
              ) : (
                <ul className="text-sm">
                  {s.addons.map((a) => (
                    <li key={a.key} className="flex items-center justify-between gap-4 border-b hairline px-5 py-3 last:border-b-0">
                      <span className="min-w-0 truncate text-bone-dim">{a.label}</span>
                      <MeterCell pct={a.attachPct} label={`${a.count} · ${fmtPct(a.attachPct)}`} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-3">
            <Card title="Clientes">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Nuevos" value={String(s.customers.new)} />
                <Stat label="Recurrentes" value={String(s.customers.returning)} />
                <Stat
                  label="Lead time mediano"
                  value={
                    s.customers.leadTimeMedianHours != null
                      ? s.customers.leadTimeMedianHours >= 48
                        ? `${Math.round(s.customers.leadTimeMedianHours / 24)} días`
                        : `${Math.round(s.customers.leadTimeMedianHours)} h`
                      : "—"
                  }
                />
              </div>
              {s.customers.top.length > 0 && (
                <div className="mt-5">
                  <DataTable
                    head={
                      <>
                        <Th>Cliente</Th>
                        <Th right>Sesiones</Th>
                        <Th right>Ingresos</Th>
                      </>
                    }
                  >
                    {s.customers.top.map((c) => (
                      <Tr key={c.email}>
                        <Td className="max-w-[16rem] truncate">{c.email}</Td>
                        <Td right>{c.sessions}</Td>
                        <Td right>
                          <span className="font-mono">{formatCLP(c.revenue)}</span>
                        </Td>
                      </Tr>
                    ))}
                  </DataTable>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
