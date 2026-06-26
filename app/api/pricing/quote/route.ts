import { pricingService } from "@/src/composition";

export const dynamic = "force-dynamic";

/** GET /api/pricing/quote?resource=&date=&start=&duration=&addons=audio,... → cotización (estimación pública). */
export async function GET(req: Request): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const resource = p.get("resource");
  const date = p.get("date");
  const start = Number(p.get("start"));
  const duration = Number(p.get("duration"));
  const addons = (p.get("addons") ?? "").split(",").filter(Boolean);

  if (!resource || !date || !Number.isFinite(start) || !Number.isFinite(duration)) {
    return Response.json({ error: "parámetros inválidos" }, { status: 400 });
  }

  try {
    const r = await pricingService().quoteBooking({
      resourceId: resource,
      date,
      startMinute: start,
      durationHours: duration,
      addonKeys: addons,
    });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    const q = r.value.quote;
    return Response.json({
      total: q.total,
      net: q.net,
      tax: q.tax,
      discount: q.discount,
      currency: r.value.currency,
      tierLines: q.tierLines,
      addonLines: q.addonLines,
    });
  } catch (e) {
    console.error("[quote]", e);
    return Response.json({ error: "no disponible" }, { status: 503 });
  }
}
