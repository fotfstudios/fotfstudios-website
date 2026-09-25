import { newsletterRepository } from "@/src/composition";
import { novedadesCsv } from "@/src/domain/admin/novedades-list";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";

/** Tope del export: muy por encima de lo que la landing puede juntar; evita un CSV infinito. */
const EXPORT_LIMIT = 10_000;

/**
 * GET /admin/novedades/suscriptores.csv → suscriptores ACTIVOS como CSV (UTF-8 con BOM,
 * CRLF) para la herramienta de correo. Las bajas nunca salen: es la lista a la que se le
 * escribe. Sin permiso, 403.
 */
export async function GET(): Promise<Response> {
  try {
    await requirePermission("customers.manage");
  } catch {
    return new Response("no autorizado", { status: 403 });
  }

  const rows = await newsletterRepository().exportActive(EXPORT_LIMIT);
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(novedadesCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="novedades-suscriptores-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
