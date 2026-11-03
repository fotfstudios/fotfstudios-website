import { leadsRepository } from "@/src/composition";
import { leadsCsv, parseLeadsSearchParams } from "@/src/domain/admin/leads-list";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";

/**
 * GET /admin/leads/leads.csv?etapa=&q= → los leads (con los filtros activos) como CSV
 * (UTF-8 con BOM, CRLF) para la planilla / herramienta de correo. Mismo permiso que la
 * página; sin él, 403.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requirePermission("leads.manage");
  } catch {
    return new Response("no autorizado", { status: 403 });
  }

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const query = parseLeadsSearchParams(sp);
  const rows = await leadsRepository().exportAll({ stage: query.stage, q: query.q });
  const fecha = new Date().toISOString().slice(0, 10);
  const parte = query.stage ?? "todas";
  return new Response(leadsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${parte}-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
