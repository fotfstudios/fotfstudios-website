import Link from "next/link";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { SearchBox } from "@/components/admin/ui/SearchBox";
import { fmtDate } from "@/components/admin/format";
import { fmtPts } from "@/components/cuenta/format";
import { customerDirectory } from "@/src/composition";
import { CLIENTE_ORDENES, clientesHref, parseClientesSearchParams, type ClienteOrden } from "@/src/domain/admin/clientes-list";
import { customerLabel } from "@/src/domain/customers/customer-input";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { NuevoClienteButton } from "./_components/NuevoClienteButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes — Admin", robots: { index: false } };

const ORDEN_LABEL: Record<ClienteOrden, string> = {
  recientes: "Recientes",
  nombre: "Nombre",
  puntos: "Más puntos",
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Primer chequeo en el servidor de este permiso en todo el sistema: hasta acá
  // solo decidía si se mostraba un enlace. El dueño lo tiene por super_admin; el
  // staff, hasta que él lo habilite en /admin/roles.
  await requirePermission("customers.manage");
  const query = parseClientesSearchParams(await searchParams);
  const list = await customerDirectory().list(query);
  const hasFilters = query.q !== "" || query.orden !== "recientes" || query.page > 1;

  return (
    <>
      <PageHeader
        kicker="Operación"
        title="Clientes"
        editorial="Quién viene, qué tiene, cómo ubicarlo."
        action={<NuevoClienteButton />}
      />

      {list.grandTotal === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="user"
            title="Sin clientes todavía"
            hint="Cada reserva pagada con email crea su ficha sola. También puedes crearla a mano."
            action={<NuevoClienteButton size="sm" />}
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <SearchBox
              defaultValue={query.q}
              basePath="/admin/clientes"
              placeholder="Nombre, email o teléfono…"
              ariaLabel="Buscar cliente por nombre, email o teléfono"
            />
            <nav aria-label="Orden" className="flex items-center gap-1">
              {CLIENTE_ORDENES.map((o) => (
                <Link
                  key={o}
                  href={clientesHref(query, { orden: o })}
                  aria-current={query.orden === o ? "true" : undefined}
                  className={`label-sm px-3 py-1.5 transition-colors ${
                    query.orden === o ? "text-gold" : "text-bone-mute hover:text-bone"
                  }`}
                >
                  {ORDEN_LABEL[o]}
                </Link>
              ))}
            </nav>
          </div>

          <div className="mt-4">
            {list.rows.length === 0 ? (
              <EmptyState
                size="compact"
                icon="user"
                title="Sin resultados"
                hint="Prueba con otro nombre, email o teléfono."
                action={
                  hasFilters ? (
                    <Button variant="ghost" size="sm" href="/admin/clientes">
                      Limpiar filtros
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <DataTable
                  minWidthClassName="min-w-[40rem]"
                  head={
                    <>
                      <Th>Cliente</Th>
                      <Th>Contacto</Th>
                      <Th right>Puntos</Th>
                      <Th>Cuenta</Th>
                      <Th>Desde</Th>
                    </>
                  }
                >
                  {list.rows.map((c) => (
                    <Tr key={c.id}>
                      <Td>
                        <Link href={`/admin/clientes/${c.id}`} className="text-bone hover:text-gold">
                          {customerLabel(c)}
                        </Link>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs text-bone-dim">
                          {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </Td>
                      <Td right>
                        <span className={`font-mono ${c.pointsBalance > 0 ? "text-gold" : "text-bone-mute"}`}>
                          {fmtPts(c.pointsBalance)}
                        </span>
                      </Td>
                      <Td>
                        {c.authUserId ? (
                          <span className="label-sm text-bone-dim">Con cuenta</span>
                        ) : (
                          <span className="label-sm text-bone-mute">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-bone-dim">{fmtDate(c.createdAt)}</span>
                      </Td>
                    </Tr>
                  ))}
                </DataTable>
                <Pagination query={query} total={list.total} href={(p) => clientesHref(query, { page: p })} />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
