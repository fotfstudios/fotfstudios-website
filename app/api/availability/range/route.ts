import { DateTime } from "luxon";
import { availabilityService } from "@/src/composition";

export const dynamic = "force-dynamic";

const MAX_DAYS = 31;

/**
 * GET /api/availability/range?resource=<id>&from=YYYY-MM-DD&days=1..31 → horario,
 * ocupación y corte de inicios por día (la tira de días de /reservar). Recortado al
 * horizonte de reservas en línea; el cliente calcula los inicios por duración.
 */
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const resource = params.get("resource");
  const from = params.get("from") ?? "";
  const days = Number(params.get("days"));
  if (
    !resource ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !DateTime.fromISO(from).isValid ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > MAX_DAYS
  ) {
    return Response.json({ error: "parámetros inválidos" }, { status: 400 });
  }
  try {
    const r = await availabilityService().getRangeAvailability(resource, from, days);
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    return Response.json(r.value);
  } catch (e) {
    console.error("[availability/range]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
