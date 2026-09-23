import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { SearchBox } from "@/components/admin/ui/SearchBox";
import { Icon } from "@/components/admin/ui/icons";
import { btn } from "@/components/admin/ui/styles";
import { GUIDES, GUIDE_SLUGS, isGuideSlug } from "@/lib/guides";
import { guideLeadRepository } from "@/src/composition";
import { guiaLeadsHref, parseGuiaLeadsSearchParams } from "@/src/domain/admin/guia-leads-list";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { GuiaTabs } from "./_components/GuiaTabs";
import { LeadsTable } from "./_components/LeadsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guías — Admin", robots: { index: false } };

/**
 * Leads de las guías gratis: quién las pidió, desde qué formulario, cuántas
 * veces y si llegó a descargarla. No hay nada que "gestionar" (sin estados ni badge):
 * es una lista para mirar y llevarse al correo. Mismo permiso que Clientes.
 */
export default async function GuiaLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("customers.manage");
  const query = parseGuiaLeadsSearchParams(await searchParams, GUIDE_SLUGS);
  const list = await guideLeadRepository().list(query, GUIDE_SLUGS);
  // "Ver la página" apunta a la guía filtrada; sin filtro, a la primera del registro.
  const verGuia = GUIDES[isGuideSlug(query.guide ?? "") ? (query.guide as never) : GUIDE_SLUGS[0]];
  const csvHref = query.guide ? `/admin/guia/leads.csv?g=${query.guide}` : "/admin/guia/leads.csv";

  return (
    <>
      <PageHeader
        kicker="Guías"
        title="Leads"
        action={
          <div className="flex flex-wrap gap-2">
            {/* <a> y no <Link>: es una descarga (route handler con Content-Disposition). */}
            {/* El CSV sigue el filtro: descargar "todas" cuando estás mirando una sola
                sorprende. */}
            <a href={csvHref} className={btn("secondary", "md")}>
              <Icon name="doc" size={16} />
              Descargar CSV
            </a>
            <Button href={verGuia.path} icon="external" variant="secondary">
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
            hint="Cada correo que pide una guía aparece acá."
            action={
              <Button href={verGuia.path} icon="external" size="sm">
                Ver la página
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <GuiaTabs query={query} counts={list.countsByGuide} grandTotal={list.grandTotal} />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
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
