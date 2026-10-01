"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { isCourseLeadStatus } from "@/src/domain/course/lead";
import { courseRepository, notificationService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

/**
 * Triage de la bandeja. Reversible a propósito: descartar por error no debe ser
 * un callejón sin salida. Pasar a 'inscrita' NO se hace acá — eso lo hace la
 * inscripción, que además toma el cupo.
 */
export async function setLeadStatusAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const id = String(fd.get("id") ?? "").trim();
    const status = String(fd.get("status") ?? "").trim();
    if (!id) throw new Error("Falta la solicitud.");
    if (!isCourseLeadStatus(status)) throw new Error("Estado inválido.");
    if (status === "inscrita") {
      throw new Error("Para inscribir, usa el botón de inscripción: ahí se toma el cupo.");
    }
    await courseRepository().updateLeadStatus(id, status);
    revalidatePath("/admin/curso/solicitudes");
    revalidatePath("/admin/curso");
  });
}

/**
 * Pide una reseña en Google a quien ya vino a la sala (sesión de prueba o curso).
 * Manual a propósito: solo el dueño sabe si la persona efectivamente vino. Queda en
 * notification_log (plantilla courseReviewRequest) como cualquier otro correo.
 */
export async function requestReviewAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new Error("Falta la solicitud.");
    const lead = await courseRepository().getLead(id);
    if (!lead) throw new Error("No encontramos la solicitud.");
    if (lead.status !== "contactada" && lead.status !== "inscrita") {
      throw new Error("Pide la reseña solo a quien ya vino a la sala.");
    }
    await notificationService().notifyReviewRequest({ email: lead.email, name: lead.name });
  });
}
