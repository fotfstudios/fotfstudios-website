import { GUIDE_SLUGS } from "@/lib/guides";
import { guideLeadRepository } from "@/src/composition";
import { guiaLeadsCsv, parseGuiaLeadsSearchParams } from "@/src/domain/admin/guia-leads-list";
import { GUIDE_SLUG_RE } from "@/src/domain/guide/lead";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";

/** Tope del export: muy por encima de lo que la landing puede juntar; evita un CSV infinito. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /admin/guia/leads.csv?g=<slug> → los leads como CSV (UTF-8 con BOM, CRLF) para
 * cargarlos en la herramienta de correo. Sin `g`, todas las guías. Mismo permiso que la
 * página; sin él, 403 (el middleware ya manda al login si no hay sesión).
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requirePermission("customers.manage");
  } catch {
    return new Response("no autorizado", { status: 403 });
  }

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { guide } = parseGuiaLeadsSearchParams(sp, GUIDE_SLUGS);

  const rows = await guideLeadRepository().exportAll({ guide, limit: EXPORT_LIMIT });
  const fecha = new Date().toISOString().slice(0, 10);
  // El slug ya viene validado contra el registro, pero Content-Disposition es una
  // superficie de inyección de cabeceras: se comprueba la forma igual antes de escribirlo.
  const parte = guide && GUIDE_SLUG_RE.test(guide) ? guide : "todas";
  return new Response(guiaLeadsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guia-leads-${parte}-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
