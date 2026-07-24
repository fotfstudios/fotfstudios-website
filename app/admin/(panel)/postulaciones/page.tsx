import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { applicationRepository } from "@/src/composition";
import { parsePostulacionesSearchParams } from "@/src/domain/admin/postulaciones-list";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { ApplicationsTable } from "./_components/ApplicationsTable";
import { Pagination } from "./_components/Pagination";
import { Tabs } from "./_components/Tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Postulaciones — Admin", robots: { index: false } };

export default async function PostulacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("applications.manage");
  const query = parsePostulacionesSearchParams(await searchParams);
  const list = await applicationRepository().listApplications(query);
  const grandTotal = list.tabCounts.todas;

  return (
    <>
      <PageHeader
        kicker="Operación"
        title="Postulaciones"
        editorial="DJs que quieren sumarse al equipo."
      />

      {grandTotal === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="user"
            title="Sin postulaciones todavía"
            hint="Las postulaciones enviadas desde /unete aparecerán acá."
            action={
              <Button href="/unete" icon="external" size="sm">
                Ver la página
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Tabs query={query} counts={list.tabCounts} />
          <div className="mt-4">
            {list.rows.length === 0 ? (
              <EmptyState
                size="compact"
                icon="user"
                title="Sin postulaciones en este estado"
                hint="Prueba con otro tab."
              />
            ) : (
              <>
                <ApplicationsTable rows={list.rows} />
                <Pagination query={query} total={list.total} />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
