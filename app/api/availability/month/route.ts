import { availabilityService } from "@/src/composition";

export const dynamic = "force-dynamic";

/** GET /api/availability/month?resource=<id>&month=YYYY-MM → estado por día. */
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const resource = params.get("resource");
  const month = params.get("month");
  if (!resource || !month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "parámetros inválidos" }, { status: 400 });
  }
  try {
    const r = await availabilityService().getMonthAvailability(resource, month);
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    return Response.json(r.value);
  } catch (e) {
    console.error("[availability/month]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
