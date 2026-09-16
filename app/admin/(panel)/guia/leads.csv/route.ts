import { guideLeadRepository } from "@/src/composition";
import { guiaLeadsCsv } from "@/src/domain/admin/guia-leads-list";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";

/** Tope del export: muy por encima de lo que la landing puede juntar; evita un CSV infinito. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /admin/guia/leads.csv → todos los leads de la guía como CSV (UTF-8 con BOM, CRLF)
 * para cargarlos en la herramienta de correo. Mismo permiso que la página; sin él, 403
 * (el middleware ya manda al login si no hay sesión).
 */
export async function GET(): Promise<Response> {
  try {
    await requirePermission("customers.manage");
  } catch {
    return new Response("no autorizado", { status: 403 });
  }

  const rows = await guideLeadRepository().exportAll(EXPORT_LIMIT);
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(guiaLeadsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guia-leads-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
