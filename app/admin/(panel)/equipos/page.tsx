import Link from "next/link";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { SearchBox } from "@/components/admin/ui/SearchBox";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { fmtDate } from "@/components/admin/format";
import { equipmentRepository } from "@/src/composition";
import { equiposHref, parseEquiposSearchParams } from "@/src/domain/admin/equipos-list";
import { EQUIPMENT_CATEGORIES, positionLabel } from "@/src/domain/equipment/equipment";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { EquiposFilters } from "./_components/EquiposFilters";
import { NuevoEquipoButton } from "./_components/NuevoEquipoButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipos — Admin", robots: { index: false } };

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("equipment.manage");
  const query = parseEquiposSearchParams(await searchParams);
  const repo = equipmentRepository();
  const [list, catalog] = await Promise.all([repo.list(query), repo.positions()]);
  const hasFilters = query.q !== "" || query.categoria !== "" || query.estado !== "activos" || query.page > 1;

  return (
    <>
      <PageHeader kicker="Operación" title="Equipos" action={<NuevoEquipoButton catalog={catalog} />} />

      {list.grandTotal === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="doc"
            title="Sin equipos todavía"
            hint="Registra cada unidad con su serie y dónde está. Los cables y adaptadores van como lote con cantidad."
            action={<NuevoEquipoButton catalog={catalog} size="sm" />}
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <SearchBox
              defaultValue={query.q}
              basePath="/admin/equipos"
              placeholder="Marca, modelo, apodo o serie…"
              ariaLabel="Buscar equipo por marca, modelo, apodo o serie"
            />
            <EquiposFilters query={query} />
          </div>

          <div className="mt-4">
            {list.rows.length === 0 ? (
              <EmptyState
                size="compact"
                icon="doc"
                title="Sin resultados"
                hint="Prueba con otra búsqueda o cambia los filtros."
                action={
                  hasFilters ? (
                    <Button variant="ghost" size="sm" href="/admin/equipos">
                      Limpiar filtros
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <DataTable
                  minWidthClassName="min-w-[48rem]"
                  head={
                    <>
                      <Th>Equipo</Th>
                      <Th>Categoría</Th>
                      <Th right>Cant.</Th>
                      <Th>Serie</Th>
                      <Th>Ubicación</Th>
                      <Th>Estado</Th>
                      <Th>Actualizado</Th>
                    </>
                  }
                >
                  {list.rows.map((e) => (
                    <Tr key={e.id}>
                      <Td>
                        <Link href={`/admin/equipos/${e.id}`} className="text-bone hover:text-gold">
                          {e.brand} {e.model}
                        </Link>
                        {e.nickname && <span className="ml-2 label-sm text-bone-quiet">{e.nickname}</span>}
                      </Td>
                      <Td>
                        <span className="text-bone-dim">{EQUIPMENT_CATEGORIES[e.category]}</span>
                      </Td>
                      <Td right>
                        <span className="font-mono text-bone-dim">{e.quantity}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs text-bone-dim">{e.serialNumber ?? "—"}</span>
                      </Td>
                      <Td>
                        <span className="text-bone-dim">{positionLabel(e)}</span>
                      </Td>
                      <Td>
                        <StatusPill status={e.status} />
                      </Td>
                      <Td>
                        <span className="text-bone-dim">{fmtDate(e.updatedAt)}</span>
                      </Td>
                    </Tr>
                  ))}
                </DataTable>
                <Pagination query={query} total={list.total} href={(p) => equiposHref(query, { page: p })} />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
