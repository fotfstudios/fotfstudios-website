import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { SearchBox } from "@/components/admin/ui/SearchBox";
import { Icon } from "@/components/admin/ui/icons";
import { btn } from "@/components/admin/ui/styles";
import { newsletterRepository } from "@/src/composition";
import { novedadesHref, parseNovedadesSearchParams } from "@/src/domain/admin/novedades-list";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { EstadoTabs } from "./_components/EstadoTabs";
import { SuscriptoresTable } from "./_components/SuscriptoresTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novedades — Admin", robots: { index: false } };

/**
 * Suscriptores del newsletter ("Sigue aprendiendo" en /curso-dj). Una lista para mirar y
 * llevarse al correo: el envío de los avisos se hace fuera (el CSV sale solo con activos).
 * Mismo permiso que Clientes y Guías.
 */
export default async function NovedadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("customers.manage");
  const query = parseNovedadesSearchParams(await searchParams);
  const list = await newsletterRepository().list(query);

  return (
    <>
      <PageHeader
        kicker="Novedades"
        title="Suscriptores"
        action={
          <div className="flex flex-wrap gap-2">
            {/* <a> y no <Link>: es una descarga (route handler con Content-Disposition). */}
            <a href="/admin/novedades/suscriptores.csv" className={btn("secondary", "md")}>
              <Icon name="doc" size={16} />
              Descargar CSV (activos)
            </a>
            <Button href="/curso-dj#novedades" icon="external" variant="secondary">
              Ver el formulario
            </Button>
          </div>
        }
      />

      {list.counts.todos === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="user"
            title="Sin suscriptores todavía"
            hint="Cada correo que se suscribe desde /curso-dj aparece acá."
          />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <EstadoTabs query={query} counts={list.counts} />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <SearchBox
              defaultValue={query.q}
              basePath="/admin/novedades"
              placeholder="Buscar por email…"
              ariaLabel="Buscar por email"
            />
            <p className="label text-bone-quiet">{list.total} suscriptores</p>
          </div>

          {list.rows.length === 0 ? (
            <div className="mt-6">
              <EmptyState size="compact" icon="search" title="Sin resultados" hint="Prueba con otra parte del email." />
            </div>
          ) : (
            <div className="mt-6">
              <SuscriptoresTable rows={list.rows} />
              <Pagination query={query} total={list.total} href={(p) => novedadesHref(query, { page: p })} />
            </div>
          )}
        </>
      )}
    </>
  );
}
