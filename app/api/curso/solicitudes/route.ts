import { createHash } from "node:crypto";
import { courseRepository, db, notificationService, rateLimiter } from "@/src/composition";
import { parseCourseLead } from "@/src/domain/course/lead";
import { clientIpFromHeaders } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

// Antiabuso por IP: 5 solicitudes cada 10 min. La IP se hashea con sal antes de
// tocar la DB (nunca guardamos IPs crudas). Sal propia: el cupo del curso y las
// postulaciones de DJ son embudos distintos y no deben compartir contador.
const RATE_MAX = 5;
const RATE_WINDOW_S = 600;
const RATE_SALT = "fotf-curso-v1";

function rateKey(ip: string): string {
  return "curso-leads:" + createHash("sha256").update(RATE_SALT + ip).digest("hex");
}

/**
 * POST /api/curso/solicitudes → alta pública de una solicitud del Curso de DJ.
 *
 * Una solicitud NO toma cupo: se guarda como 'nueva' y el asiento se consume recién
 * cuando el dueño la confirma en el admin. Eso saca la carrera de asientos del borde
 * público — un bot no puede agotar la generación.
 *
 * Valida con parseCourseLead() (el MISMO módulo que corre el formulario), aplica rate
 * limit sobre las solicitudes bien formadas, inserta estampando la generación vigente y
 * dispara best-effort el aviso al dueño + confirmación al alumno. El honeypot devuelve
 * 200 idéntico al éxito para no delatar el filtro.
 */
export async function POST(req: Request): Promise<Response> {
  // Anti-abuso barato: un body gigante ni llega a JSON.parse (los campos suman < 2 KB).
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 8_192) return Response.json({ error: "validacion" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "json_invalido" }, { status: 400 });
  }

  const parsed = parseCourseLead(body);
  if (parsed.kind === "spam") return Response.json({ ok: true });
  if (parsed.kind === "invalid") {
    return Response.json({ error: "validacion", issues: parsed.issues }, { status: 400 });
  }

  const client = db();

  // Fail-open: un problema de DB en el limitador no debe bloquear a alguien legítimo
  // que quiere pagar un curso.
  try {
    const ip = clientIpFromHeaders(req.headers) ?? "unknown";
    const allowed = await rateLimiter(client).hit(rateKey(ip), RATE_MAX, RATE_WINDOW_S);
    if (!allowed) return Response.json({ error: "rate_limited" }, { status: 429 });
  } catch (e) {
    console.error("[curso-leads:ratelimit]", e);
  }

  try {
    const repo = courseRepository(client);
    // La generación vigente se estampa al enviar: si mañana se abre otra, esta
    // solicitud sigue perteneciendo a la que estaba abierta cuando la persona escribió.
    const generacion = await repo.currentGeneration().catch(() => null);
    await repo.createLead(parsed.value, generacion?.id ?? null);

    await notificationService(client)
      .notifyCourseLead(parsed.value, generacion ? { code: generacion.code, seatsLeft: generacion.seatsLeft } : null)
      .catch((e) => console.error("[curso-leads:email]", e));

    return Response.json({ ok: true });
  } catch (e) {
    console.error("[curso-leads]", e);
    return Response.json({ error: "no_disponible" }, { status: 503 });
  }
}
