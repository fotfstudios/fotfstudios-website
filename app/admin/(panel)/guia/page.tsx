import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { SearchBox } from "@/components/admin/ui/SearchBox";
import { Icon } from "@/components/admin/ui/icons";
import { btn } from "@/components/admin/ui/styles";
import { guideLeadRepository } from "@/src/composition";
import { guiaLeadsHref, parseGuiaLeadsSearchParams } from "@/src/domain/admin/guia-leads-list";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { LeadsTable } from "./_components/LeadsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guía DJ — Admin", robots: { index: false } };

/**
 * Leads de la guía gratis (/guia-dj): quién la pidió, desde qué formulario, cuántas
 * veces y si llegó a descargarla. No hay nada que "gestionar" (sin estados ni badge):
 * es una lista para mirar y llevarse al correo. Mismo permiso que Clientes.
 */
export default async function GuiaLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("customers.manage");
  const query = parseGuiaLeadsSearchParams(await searchParams);
  const list = await guideLeadRepository().list(query);

  return (
    <>
      <PageHeader
        kicker="Guía DJ"
        title="Leads"
        action={
          <div className="flex flex-wrap gap-2">
            {/* <a> y no <Link>: es una descarga (route handler con Content-Disposition). */}
            <a href="/admin/guia/leads.csv" className={btn("secondary", "md")}>
              <Icon name="doc" size={16} />
              Descargar CSV
            </a>
            <Button href="/guia-dj" icon="external" variant="secondary">
              Ver la página
            </Button>
          </div>
        }
      />

      {list.grandTotal === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="user"
            title="Sin leads todavía"
            hint="Cada correo que pide la guía en /guia-dj aparece acá."
            action={
              <Button href="/guia-dj" icon="external" size="sm">
                Ver la página
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <SearchBox defaultValue={query.q} basePath="/admin/guia" placeholder="Buscar por email…" ariaLabel="Buscar por email" />
            <p className="label text-bone-quiet">
              {list.total === list.grandTotal ? `${list.grandTotal} leads` : `${list.total} de ${list.grandTotal} leads`}
            </p>
          </div>

          {list.rows.length === 0 ? (
            <div className="mt-6">
              <EmptyState size="compact" icon="search" title="Sin resultados" hint="Prueba con otra parte del email." />
            </div>
          ) : (
            <div className="mt-6">
              <LeadsTable rows={list.rows} />
              <Pagination query={query} total={list.total} href={(p) => guiaLeadsHref(query, { page: p })} />
            </div>
          )}
        </>
      )}
    </>
  );
}
