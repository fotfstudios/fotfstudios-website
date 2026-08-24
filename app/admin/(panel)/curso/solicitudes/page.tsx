import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { parseSolicitudesSearchParams } from "@/src/domain/admin/curso-solicitudes-list";
import { courseRepository } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { Pagination } from "./_components/Pagination";
import { SolicitudesTable } from "./_components/SolicitudesTable";
import { Tabs } from "./_components/Tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solicitudes — Admin", robots: { index: false } };

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("course.manage");

  const query = parseSolicitudesSearchParams(await searchParams);
  const list = await courseRepository().listLeads(query);

  return (
    <>
      <PageHeader
        kicker="Curso"
        title="Solicitudes"
        editorial="Quién quiere el cupo."
        action={
          <Button href="/curso-dj" icon="external" variant="secondary">
            Ver la página
          </Button>
        }
      />

      {list.grandTotal === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="user"
            title="Sin solicitudes todavía"
            hint="Las que se envíen desde el formulario de /curso-dj aparecen acá."
            action={
              <Button href="/curso-dj" icon="external" size="sm">
                Ver la página
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <Tabs query={query} counts={list.tabCounts} />
          </div>
          {list.rows.length === 0 ? (
            <div className="mt-6">
              <EmptyState size="compact" icon="user" title="Sin solicitudes en este estado" hint="Prueba otro tab." />
            </div>
          ) : (
            <div className="mt-6">
              <SolicitudesTable rows={list.rows} />
              <Pagination query={query} total={list.total} />
            </div>
          )}
        </>
      )}
    </>
  );
}
