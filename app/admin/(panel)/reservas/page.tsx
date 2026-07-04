import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { adminRepository } from "@/src/composition";
import { parseReservasSearchParams, reservasHref } from "@/src/domain/admin/reservas-list";
import { formatCLP } from "@/src/domain/money/money";
import { BookingsTable } from "./_components/BookingsTable";
import { FilterBar } from "./_components/FilterBar";
import { Pagination } from "./_components/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reservas — Admin", robots: { index: false } };

export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseReservasSearchParams(await searchParams);
  const repo = adminRepository();
  const [list, kpis] = await Promise.all([repo.listBookings(query), repo.reservasKpis()]);

  // "Limpiar filtros" vuelve al default; si el default (próximas) es lo que está
  // vacío, lo útil es abrir el rango temporal.
  const hasFilters =
    query.q !== "" ||
    query.estado !== "todas" ||
    query.tiempo !== "proximas" ||
    query.orden !== "fecha" ||
    query.page > 1;

  return (
    <>
      <PageHeader
        kicker="Operación"
        title="Reservas"
        editorial="Todo lo que pasa por la sala."
        action={
          <Button href="/admin/reservas/nueva" icon="add">
            Nueva reserva
          </Button>
        }
      />

      {list.grandTotal === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="bookings"
            title="Sin reservas todavía"
            hint="Las reservas pagadas en el sitio y las que crees manualmente aparecerán acá."
            action={
              <Button href="/admin/reservas/nueva" icon="add" size="sm">
                Nueva reserva
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Hoy" value={String(kpis.sesionesHoy)} />
            <Stat label="Próximos 7 días" value={String(kpis.proximos7d)} />
            <Stat
              label="Pagos pendientes"
              value={String(kpis.pagosPendientes)}
              accent={kpis.pagosPendientes > 0}
            />
            <Stat label="Ingresos 30 días" value={formatCLP(kpis.ingresos30d)} />
          </div>

          <FilterBar query={query} counts={list.tabCounts} />

          <div className="mt-4">
            {list.rows.length === 0 ? (
              <EmptyState
                size="compact"
                icon="bookings"
                title="Sin resultados"
                hint="Probá con otro filtro o búsqueda."
                action={
                  hasFilters ? (
                    <Button variant="ghost" size="sm" href="/admin/reservas">
                      Limpiar filtros
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" href={reservasHref(query, { tiempo: "todas" })}>
                      Ver pasadas también
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <BookingsTable
                  rows={list.rows}
                  orden={query.orden}
                  exactCounts={list.total <= query.perPage}
                />
                <Pagination query={query} total={list.total} />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
