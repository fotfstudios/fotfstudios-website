import Link from "next/link";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { SearchBox } from "@/components/admin/ui/SearchBox";
import { Stat } from "@/components/admin/ui/Stat";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { leadsRepository } from "@/src/composition";
import { parseLeadsSearchParams, leadsHref } from "@/src/domain/admin/leads-list";
import { LEAD_STAGES, STAGE_LABELS } from "@/src/domain/outreach/pipeline";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { LeadsTable } from "./_components/LeadsTable";
import { Board } from "./_components/Board";
import { AddLeadDialog } from "./_components/AddLeadDialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads — Admin", robots: { index: false } };

const chipCls = (on: boolean) =>
  `border hairline px-3 py-1.5 label-sm transition-colors ${on ? "border-gold text-gold" : "text-bone-quiet hover:text-gold"}`;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("leads.manage");
  const query = parseLeadsSearchParams(await searchParams);
  const repo = leadsRepository();

  const [counts, members] = await Promise.all([repo.stageCounts(), repo.assignableMembers()]);
  const total = LEAD_STAGES.reduce((n, s) => n + counts[s], 0);

  const csvParams = new URLSearchParams();
  if (query.stage) csvParams.set("etapa", query.stage);
  if (query.q) csvParams.set("q", query.q);
  const csvHref = `/admin/leads/leads.csv${csvParams.toString() ? `?${csvParams}` : ""}`;

  return (
    <>
      <PageHeader kicker="Operación" title="Leads" />

      {total === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="user"
            title="Sin leads todavía"
            hint="Las guías, el newsletter, las solicitudes de curso y las postulaciones crean fichas acá. También puedes agregar una a mano."
            action={<AddLeadDialog />}
          />
        </div>
      ) : (
        <>
          {/* KPIs por etapa */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {LEAD_STAGES.map((s) => (
              <Stat key={s} label={STAGE_LABELS[s]} value={String(counts[s])} accent={s === "ganado"} />
            ))}
          </div>

          {/* Controles: vista, búsqueda, filtro por etapa */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              <Link href={leadsHref(query, { view: "lista" })} className={chipCls(query.view === "lista")}>
                Lista
              </Link>
              <Link href={leadsHref(query, { view: "tablero" })} className={chipCls(query.view === "tablero")}>
                Tablero
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <a href={csvHref} className={chipCls(false)}>
                Descargar CSV
              </a>
              <AddLeadDialog />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href={leadsHref(query, { stage: null })} className={chipCls(query.stage === null)}>
              Todas
            </Link>
            {LEAD_STAGES.map((s) => (
              <Link key={s} href={leadsHref(query, { stage: s })} className={chipCls(query.stage === s)}>
                {STAGE_LABELS[s]}
              </Link>
            ))}
          </div>

          <div className="mt-4 max-w-md">
            <SearchBox
              defaultValue={query.q ?? ""}
              basePath="/admin/leads"
              placeholder="Buscar por correo o nombre"
              ariaLabel="Buscar leads"
            />
          </div>

          {query.view === "tablero" ? (
            <Board rows={await repo.board()} />
          ) : (
            <LeadsTableSection query={query} members={members} />
          )}
        </>
      )}
    </>
  );
}

async function LeadsTableSection({
  query,
  members,
}: {
  query: ReturnType<typeof parseLeadsSearchParams>;
  members: { id: string; email: string }[];
}) {
  const { rows, total } = await leadsRepository().list(query);
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState size="compact" icon="user" title="Sin leads con estos filtros" hint="Prueba con otra etapa o búsqueda." />
      </div>
    );
  }
  return (
    <div className="mt-6">
      <LeadsTable rows={rows} members={members} />
      <Pagination query={{ page: query.page, perPage: query.perPage }} total={total} href={(p) => leadsHref(query, { page: p })} />
    </div>
  );
}
