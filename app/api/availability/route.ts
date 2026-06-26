import { availabilityService } from "@/src/composition";

export const dynamic = "force-dynamic";

/** GET /api/availability?resource=<id>&date=YYYY-MM-DD → horario + horas ocupadas. */
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const resource = params.get("resource");
  const date = params.get("date");
  if (!resource || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "parámetros inválidos" }, { status: 400 });
  }
  try {
    const r = await availabilityService().getDayAvailability(resource, date);
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    return Response.json(r.value);
  } catch (e) {
    console.error("[availability]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
