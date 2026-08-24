"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type ActionDataResult, type ActionResult, run, runData } from "@/components/admin/ui/action";
import { GENERATION_STATUSES, type GenerationStatus } from "@/src/domain/course/course";
import { planSessions, selfOverlap } from "@/src/domain/course/sessions";
import { adminRepository, courseRepository, db, notificationService, paymentService } from "@/src/composition";
import { hostFromHeaders } from "@/lib/urls";
import { fmtDateTime } from "@/components/admin/format";
import { TERMS_VERSION } from "@/lib/site";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Tope de texto libre: el admin es de confianza, un request forjado no. */
const MAX_FIELD = 200;

function required(fd: FormData, k: string, label: string): string {
  const v = str(fd, k);
  if (!v) throw new Error(`Falta ${label}.`);
  if (v.length > MAX_FIELD) throw new Error(`${label}: demasiado largo.`);
  return v;
}

/** Precio en CLP desde el formulario. Entero, no negativo, con tope sano. */
function precio(fd: FormData, k: string, label: string): number {
  const n = num(fd, k);
  if (!Number.isInteger(n) || n < 0 || n > 9_999_990) throw new Error(`${label}: precio inválido.`);
  return n;
}

export async function createGenerationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");

    const seats = num(fd, "seats");
    if (!Number.isInteger(seats) || seats < 1 || seats > 12) {
      throw new Error("Cupos: entre 1 y 12.");
    }
    const deadline = str(fd, "enrollDeadline");
    const startsOn = str(fd, "startsOn");
    if (deadline && !DATE_RE.test(deadline)) throw new Error("Fecha de cierre inválida.");
    if (startsOn && !DATE_RE.test(startsOn)) throw new Error("Fecha de inicio inválida.");

    await courseRepository().createGeneration({
      code: required(fd, "code", "el código"),
      name: required(fd, "name", "el nombre"),
      seats,
      prices: {
        duo: precio(fd, "priceDuo", "Dúo"),
        individual: precio(fd, "priceIndividual", "Individual"),
        prueba: precio(fd, "pruebaPrice", "Sesión de prueba"),
      },
      pricingLabel: str(fd, "pricingLabel") || null,
      enrollDeadline: deadline || null,
      startsOn: startsOn || null,
    });
    revalidatePath("/admin/curso");
    revalidatePath("/admin/curso/generaciones");
  });
}

export async function setGenerationStatusAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const id = str(fd, "id");
    const status = str(fd, "status");
    if (!(GENERATION_STATUSES as readonly string[]).includes(status)) throw new Error("Estado inválido.");

    try {
      await courseRepository().setGenerationStatus(id, status as GenerationStatus);
    } catch (e) {
      // El índice parcial `course_generations_one_open` permite UNA sola abierta:
      // el mensaje crudo de Postgres no le dice nada al dueño.
      const msg = e instanceof Error ? e.message : "";
      throw new Error(
        /one_open/.test(msg) ? "Ya hay una generación abierta. Ciérrala primero." : "No se pudo cambiar el estado.",
      );
    }
    revalidatePath("/admin/curso");
    revalidatePath("/admin/curso/generaciones");
  });
}

/**
 * Agenda la grilla completa de una generación. Todo o nada: si una sesión choca,
 * no queda ninguna (una generación a medio agendar es peor que ninguna).
 */
export async function scheduleGenerationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const id = str(fd, "id");
    const date = str(fd, "firstDate");
    const startMinute = num(fd, "startMinute");
    const durationHours = num(fd, "durationHours");
    const sessions = num(fd, "sessions");

    if (!DATE_RE.test(date)) throw new Error("Fecha inválida.");
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) throw new Error("Hora inválida.");
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 12) {
      throw new Error("Duración inválida: entre 1 y 12 horas.");
    }
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > 12) throw new Error("Sesiones: entre 1 y 12.");

    const resource = await adminRepository().defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");

    const plan = planSessions({
      firstDate: date,
      startMinute,
      durationHours,
      titles: Array.from({ length: sessions }, (_, i) => `Sesión ${i + 1}`),
      tz: resource.timezone,
    });

    // Se valida el auto-solape ANTES de la DB: el EXCLUDE compara filas distintas,
    // así que un plan que se pisa a sí mismo fallaría recién en la segunda
    // inserción y culparía a la sesión equivocada.
    const overlap = selfOverlap(plan);
    if (overlap) throw new Error(`La sesión ${overlap.n} se pisa con otra del mismo plan.`);

    try {
      await courseRepository().scheduleSessions(id, plan);
    } catch (e) {
      throw new Error(scheduleErrorMessage(e instanceof Error ? e.message : ""));
    }
    revalidatePath("/admin/curso");
    revalidatePath("/admin/curso/generaciones");
    revalidatePath("/admin/agenda");
  });
}

/** Errores de los RPC → frase para el dueño (nunca el código crudo). */
function scheduleErrorMessage(raw: string): string {
  const slot = /curso_slot_taken:(\d+)/.exec(raw);
  if (slot) return `La sesión ${slot[1]} choca con otra reserva o bloqueo. No se agendó ninguna.`;
  const past = /curso_in_past:(\d+)/.exec(raw);
  if (past) return `La sesión ${past[1]} queda en el pasado.`;
  if (/curso_already_scheduled/.test(raw)) return "Esta generación ya tiene sus sesiones agendadas.";
  if (/curso_generation_not_schedulable/.test(raw)) return "Solo se agendan generaciones en borrador o abiertas.";
  return "No se pudieron agendar las sesiones.";
}

export async function cancelSessionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    await courseRepository().cancelSession(str(fd, "sessionId"));
    revalidatePath("/admin/curso");
    revalidatePath("/admin/agenda");
  });
}

/**
 * Inscribe a una persona (o a un dúo) en la generación vigente: toma los cupos y
 * crea el pedido en una sola transacción. El PRECIO no viaja en el formulario —
 * sale de la generación— porque el dueño elige a quién inscribir, no cuánto
 * cobrarle.
 */
export async function createEnrollmentAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const generationId = str(fd, "generationId");
    const plan = str(fd, "plan");
    if (!generationId) throw new Error("Falta la generación.");
    if (plan !== "duo" && plan !== "individual") throw new Error("Formato inválido.");

    const students = [
      { name: required(fd, "name1", "el nombre"), email: required(fd, "email1", "el email"), phone: str(fd, "phone1") || null },
    ];
    if (plan === "duo") {
      students.push({
        name: required(fd, "name2", "el nombre de la segunda persona"),
        email: required(fd, "email2", "el email de la segunda persona"),
        phone: str(fd, "phone2") || null,
      });
    }

    const repo = courseRepository();
    try {
      await repo.createEnrollment({
        generationId,
        plan,
        students,
        leadId: str(fd, "leadId") || null,
        notes: str(fd, "notes") || null,
        // El staff atestigua el consentimiento, igual que en la reserva manual.
        termsSource: "staff",
        termsVersion: TERMS_VERSION,
      });
    } catch (e) {
      throw new Error(enrollErrorMessage(e instanceof Error ? e.message : ""));
    }

    revalidatePath("/admin/curso");
    revalidatePath("/admin/curso/solicitudes");
  });
}

function enrollErrorMessage(raw: string): string {
  if (/curso_sin_cupos/.test(raw)) return "No quedan cupos suficientes en esta generación.";
  if (/curso_generation_closed/.test(raw)) return "La generación no está recibiendo inscripciones.";
  if (/curso_duo_necesita_dos/.test(raw)) return "Un dúo necesita las dos personas.";
  if (/curso_individual_es_uno/.test(raw)) return "El formato individual lleva una sola persona.";
  if (/seat_unique|seat_out_of_range/.test(raw)) return "No quedan cupos suficientes en esta generación.";
  return "No se pudo crear la inscripción.";
}

/** Pago offline (efectivo/transferencia): cobra el total y emite la boleta pendiente. */
export async function markCoursePaidAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.billing");
    const enrollmentId = str(fd, "enrollmentId");
    const method = str(fd, "method");
    if (method !== "efectivo" && method !== "transferencia") throw new Error("Método inválido.");

    const repo = courseRepository();
    const inscripcion = await repo.enrollmentById(enrollmentId);
    if (!inscripcion?.orderId) throw new Error("Esta inscripción no tiene pedido.");
    if (inscripcion.status === "pagada") throw new Error("Esta inscripción ya está pagada.");

    const status = await repo.confirmCoursePayment(inscripcion.orderId, `offline:${method}`, method);
    if (status !== "confirmed") throw new Error("No se pudo registrar el pago (la inscripción pudo anularse).");

    // Best-effort: el email nunca voltea un pago ya registrado.
    await notifyPaid(inscripcion.orderId, method).catch((e) => console.error("[curso:pago:email]", e));

    revalidatePath("/admin/curso");
    revalidatePath(`/admin/curso/inscripciones/${enrollmentId}`);
  });
}

async function notifyPaid(orderId: string, method: string): Promise<void> {
  const repo = courseRepository();
  const inscripciones = await repo.enrollmentsByOrder(orderId);
  if (inscripciones.length === 0) return;
  const gen = await repo.getGeneration(inscripciones[0].generationId);
  const sesiones = gen ? await repo.listSessions(gen.id) : [];
  await notificationService().notifyCoursePaid({
    students: inscripciones.map((i) => ({ name: i.studentName, email: i.studentEmail })),
    generation: inscripciones[0].generationCode,
    totalClp: inscripciones[0].orderAmountClp ?? 0,
    method,
    sessions: sesiones
      .filter((s) => s.status === "agendada" && s.startsAt)
      .map((s) => fmtDateTime(s.startsAt!)),
    seatsLeft: gen?.seatsLeft ?? 0,
  });
}

/** Anula una inscripción impaga: libera los cupos y cancela el pedido. */
export async function cancelEnrollmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.billing");
    const enrollmentId = str(fd, "enrollmentId");
    const repo = courseRepository();
    const inscripcion = await repo.enrollmentById(enrollmentId);
    if (!inscripcion?.orderId) throw new Error("Esta inscripción no tiene pedido.");

    const compañeros = await repo.enrollmentsByOrder(inscripcion.orderId);
    try {
      await repo.cancelCourseOrder(inscripcion.orderId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      throw new Error(
        /curso_enrollment_paid/.test(msg)
          ? "Una inscripción pagada se anula desde el reembolso, no desde acá."
          : "No se pudo anular la inscripción.",
      );
    }

    await notificationService()
      .notifyCourseCancelled({
        students: compañeros.map((i) => ({ name: i.studentName, email: i.studentEmail })),
        generation: compañeros[0]?.generationCode ?? "",
      })
      .catch((e) => console.error("[curso:anular:email]", e));

    revalidatePath("/admin/curso");
    revalidatePath(`/admin/curso/inscripciones/${enrollmentId}`);
  });
}

/** Notas operativas de la inscripción. */
export async function setEnrollmentNotesAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const id = str(fd, "enrollmentId");
    const notes = str(fd, "notes").slice(0, 500);
    await courseRepository().setEnrollmentNotes(id, notes || null);
    revalidatePath(`/admin/curso/inscripciones/${id}`);
  });
}

/** Ventana del link de pago del curso: el alumno paga cuando puede, sin hold que vencer. */
const COURSE_LINK_HOURS = 72;

/**
 * Genera un link de pago de Mercado Pago para una inscripción pendiente y se lo
 * manda al alumno. El webhook confirma: acá NO se toca el estado del pago.
 */
export async function shareCoursePaymentLinkAction(
  enrollmentId: string,
): Promise<ActionDataResult<{ initPoint: string; amount: number }>> {
  return runData(async () => {
    await requirePermission("course.billing");
    const repo = courseRepository();
    const inscripcion = await repo.enrollmentById(enrollmentId);
    if (!inscripcion?.orderId) throw new Error("Esta inscripción no tiene pedido.");
    if (inscripcion.status !== "reservada") throw new Error("Esta inscripción no está pendiente de pago.");

    const host = hostFromHeaders(await headers());
    const pref = await paymentService(db(), host).createPreferenceForOrder(inscripcion.orderId, {
      // Sin hold que vencer: la ventana la define la paciencia del dueño, no la sala.
      expiresInMinutes: COURSE_LINK_HOURS * 60,
      description: `Curso de DJ FOTF · ${inscripcion.generationCode}`,
      // /reserva/estado espera una reserva y está detrás de bookingEnabled().
      backPath: "/curso-dj/pago",
    });
    if (!pref.ok) throw new Error(pref.error);

    await notificationService()
      .notifyCoursePaymentLink({
        name: inscripcion.studentName,
        email: inscripcion.studentEmail,
        generation: inscripcion.generationCode,
        totalClp: inscripcion.orderAmountClp ?? inscripcion.priceClp,
        initPoint: pref.value.initPoint,
        expiresInHours: COURSE_LINK_HOURS,
      })
      .catch((e) => console.error("[curso:link:email]", e));

    revalidatePath(`/admin/curso/inscripciones/${enrollmentId}`);
    return { initPoint: pref.value.initPoint, amount: inscripcion.orderAmountClp ?? inscripcion.priceClp };
  });
}
