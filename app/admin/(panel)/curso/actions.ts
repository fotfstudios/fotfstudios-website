"use server";

import { revalidatePath } from "next/cache";
import { TRIAL_CREDIT_DAYS } from "@/src/domain/course/credit";
import { headers } from "next/headers";
import { type ActionDataResult, type ActionResult, run, runData } from "@/components/admin/ui/action";
import { recordTaxDocFolioFromForm } from "@/components/admin/tax-docs/record-folio";
import { type DayConsoleData, loadDayConsole } from "@/components/admin/day-occupancy";
import { resolveCourseRefundAmount } from "@/src/domain/course/cancellation-policy";
import { COURSE_PROGRAM, planProgramSessions } from "@/src/domain/course/program";
import { selfOverlap } from "@/src/domain/course/sessions";
import { rangeFor } from "@/src/domain/scheduling/time";
import {
  adminRepository,
  courseRepository,
  customerDirectory,
  db,
  notificationService,
  paymentService,
  refundService,
} from "@/src/composition";
import { hostFromHeaders } from "@/lib/urls";
import { TERMS_VERSION } from "@/lib/site";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { PRECIOS, SESIONES } from "@/lib/curso-content";
import {
  courseMoveError,
  courseScheduleError,
  parseInstructor,
  parseProgramSchedule,
  parseSessionMove,
  parseSessionNumber,
} from "@/lib/course-admin";

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

/** Ficha + listado + agenda: todo lo que pinta sesiones de un programa. */
function revalidateProgram(enrollmentId?: string) {
  revalidatePath("/admin/curso");
  revalidatePath("/admin/agenda");
  if (enrollmentId) revalidatePath(`/admin/curso/inscripciones/${enrollmentId}`);
}

// ── Avisos de agenda al alumno ─────────────────────────────────────────────
// Best-effort y DESPUÉS del RPC: un correo que falla nunca voltea lo que ya quedó en la sala.

/** Alumnos que reciben los avisos del programa: todos los cupos vivos (pagado o no, dúo = 2). */
async function programStudents(generationId: string) {
  const rows = await courseRepository().listEnrollments(generationId);
  return rows
    .filter((e) => e.status === "reservada" || e.status === "pagada")
    .map((e) => ({ name: e.studentName, email: e.studentEmail }));
}

type SessionRow = Awaited<ReturnType<ReturnType<typeof courseRepository>["listSessions"]>>[number];

const sessionPayload = (s: SessionRow & { startsAt: string }) => ({
  n: s.n,
  title: s.title,
  instructor: s.instructor,
  reservationId: s.reservationId,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
});

async function notifySessions(
  event: "scheduled" | "moved" | "cancelled",
  generationId: string,
  sessions: SessionRow[],
  previous?: { startsAt: string; endsAt: string | null },
): Promise<void> {
  const dated = sessions.filter((s): s is SessionRow & { startsAt: string } => !!s.startsAt);
  if (dated.length === 0) return;
  await notificationService().notifyCourseSessions(event, {
    students: await programStudents(generationId),
    sessions: dated.map(sessionPayload),
    previous,
  });
}

/** Horas de práctica que le quedan a un cupo (las redimidas ya descontadas). */
async function practiceLeft(enrollmentId: string) {
  const e = await courseRepository().enrollmentById(enrollmentId);
  return e ? { student: e, left: Math.max(0, e.practiceHoursTotal - e.practiceHoursRedeemed) } : null;
}

/** Resuelve el programa de una inscripción: la ficha habla de inscripciones, la DB de programas. */
async function programOf(enrollmentId: string): Promise<string> {
  const e = await courseRepository().enrollmentById(enrollmentId);
  if (!e) throw new Error("La inscripción ya no existe.");
  return e.generationId;
}

/**
 * Agenda las 6 sesiones del programa. Todo o nada: si una choca, no queda ninguna
 * (un programa a medio agendar es peor que ninguno).
 */
export async function scheduleProgramAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const enrollmentId = str(fd, "enrollmentId");
    const input = parseProgramSchedule({
      firstDate: str(fd, "firstDate"),
      startMinute: str(fd, "startMinute"),
      everyWeeks: str(fd, "everyWeeks"),
    });
    if (!input.ok) throw new Error(input.error);

    const resource = await adminRepository().defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");

    let generationId = "";
    try {
      const plan = planProgramSessions({
        ...input.value,
        titles: SESIONES.map((s) => s.title),
        tz: resource.timezone,
      });
      // Se valida el auto-solape ANTES de la DB: el EXCLUDE compara filas distintas.
      const overlap = selfOverlap(plan);
      if (overlap) throw new Error(`La sesión ${overlap.n} se pisa con otra del mismo plan.`);
      generationId = await programOf(enrollmentId);
      await courseRepository().scheduleSessions(generationId, plan);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      throw new Error(/se pisa con otra/.test(raw) ? raw : courseScheduleError(raw));
    }
    // Un solo correo con las 6 sesiones (y un .ics por cada una).
    const gen = generationId;
    await courseRepository()
      .listSessions(gen)
      .then((all) => notifySessions("scheduled", gen, all.filter((s) => s.status === "agendada")))
      .catch((e) => console.error("[curso:agenda:email]", e));
    revalidateProgram(enrollmentId);
  });
}

/** Ocupación real de la sala en un día, para los selectores de hora del curso. */
export async function courseDayAction(date: string): Promise<ActionDataResult<DayConsoleData>> {
  return runData(async () => {
    await requirePermission("course.manage");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida.");
    const resource = await adminRepository().defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");
    return loadDayConsole(resource.id, resource.timezone, date);
  });
}

/**
 * Agenda UNA sesión del programa en la fecha que se acordó con el alumno. El
 * título sale del currículo (SESIONES) y la duración del programa: el formulario
 * solo trae el número, el día y la hora.
 */
export async function scheduleSessionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const enrollmentId = str(fd, "enrollmentId");
    const n = parseSessionNumber(str(fd, "n"));
    if (!n.ok) throw new Error(n.error);
    const when = parseSessionMove({ date: str(fd, "date"), startMinute: str(fd, "startMinute") });
    if (!when.ok) throw new Error(when.error);

    const resource = await adminRepository().defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");
    const { startsAt, endsAt } = rangeFor(
      when.value.date,
      when.value.startMinute,
      COURSE_PROGRAM.sessionMinutes / 60,
      resource.timezone,
    );
    const generationId = await programOf(enrollmentId);
    let sessionId: string;
    try {
      sessionId = await courseRepository().scheduleSession(generationId, {
        n: n.value,
        title: SESIONES[n.value - 1]?.title ?? `Sesión ${n.value}`,
        startsAt,
        endsAt,
      });
    } catch (e) {
      throw new Error(courseScheduleError(e instanceof Error ? e.message : ""));
    }
    await courseRepository()
      .listSessions(generationId)
      .then((all) => notifySessions("scheduled", generationId, all.filter((s) => s.id === sessionId)))
      .catch((e) => console.error("[curso:agenda:email]", e));
    revalidateProgram(enrollmentId);
  });
}

/**
 * Mueve una sesión agendada, o re-agenda una cancelada con un bloque nuevo (el RPC
 * distingue). La duración no viaja: siempre es la del programa.
 */
export async function moveSessionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const input = parseSessionMove({ date: str(fd, "date"), startMinute: str(fd, "startMinute") });
    if (!input.ok) throw new Error(input.error);
    const resource = await adminRepository().defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");
    const { startsAt, endsAt } = rangeFor(
      input.value.date,
      input.value.startMinute,
      COURSE_PROGRAM.sessionMinutes / 60,
      resource.timezone,
    );
    const sessionId = str(fd, "sessionId");
    const enrollmentId = str(fd, "enrollmentId");
    // La hora vieja se lee ANTES: el RPC la pisa. Sin la inscripción no hay a quién avisar.
    const generationId = enrollmentId ? await programOf(enrollmentId).catch(() => null) : null;
    const before = generationId
      ? (await courseRepository().listSessions(generationId).catch(() => [])).find((s) => s.id === sessionId)
      : undefined;
    try {
      await courseRepository().moveSession(sessionId, startsAt, endsAt);
    } catch (e) {
      throw new Error(courseMoveError(e instanceof Error ? e.message : ""));
    }
    if (generationId) {
      // Una agendada que se mueve avisa "movimos" (antes → ahora); una cancelada que se
      // re-agenda es una sesión agendada de nuevo.
      const wasScheduled = before?.status === "agendada" && before.startsAt;
      await courseRepository()
        .listSessions(generationId)
        .then((all) => {
          const now = all.filter((s) => s.id === sessionId);
          return wasScheduled
            ? notifySessions("moved", generationId, now, { startsAt: before.startsAt!, endsAt: before.endsAt })
            : notifySessions("scheduled", generationId, now);
        })
        .catch((e) => console.error("[curso:mover:email]", e));
    }
    revalidateProgram(enrollmentId);
  });
}

export async function cancelSessionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const sessionId = str(fd, "sessionId");
    const enrollmentId = str(fd, "enrollmentId");
    const generationId = enrollmentId ? await programOf(enrollmentId).catch(() => null) : null;
    const before = generationId
      ? (await courseRepository().listSessions(generationId).catch(() => [])).find((s) => s.id === sessionId)
      : undefined;
    await courseRepository().cancelSession(sessionId);
    // Solo si estaba agendada: cancelar una "por agendar" no es noticia para el alumno.
    if (generationId && before?.status === "agendada") {
      await notifySessions("cancelled", generationId, [before]).catch((e) => console.error("[curso:cancelar:email]", e));
    }
    revalidateProgram(enrollmentId || undefined);
  });
}

/** Marca una sesión como dictada. El bloque sigue en la sala (la hora ya se usó). */
export async function markSessionDictadaAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    try {
      await courseRepository().markSessionDictada(str(fd, "sessionId"));
    } catch (e) {
      throw new Error(courseMoveError(e instanceof Error ? e.message : ""));
    }
    revalidateProgram(str(fd, "enrollmentId"));
  });
}

/** Instructor del programa; las sesiones ya agendadas conservan el suyo. */
export async function setProgramInstructorAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const instructor = parseInstructor(str(fd, "instructor"));
    if (!instructor.ok) throw new Error(instructor.error);
    const enrollmentId = str(fd, "enrollmentId");
    await courseRepository().setProgramInstructor(await programOf(enrollmentId), instructor.value);
    revalidateProgram(enrollmentId);
  });
}

export async function setSessionInstructorAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const instructor = parseInstructor(str(fd, "instructor"));
    if (!instructor.ok) throw new Error(instructor.error);
    await courseRepository().setSessionInstructor(str(fd, "sessionId"), instructor.value);
    revalidateProgram(str(fd, "enrollmentId"));
  });
}

/**
 * Crea un programa 1:1 (una persona, o un dúo): programa + pedido + cupos en una
 * sola transacción. El PRECIO no viaja en el formulario —sale de PRECIOS— porque
 * el dueño elige a quién inscribir, no cuánto cobrarle.
 */
export async function createProgramAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const plan = str(fd, "plan");
    if (plan !== "duo" && plan !== "individual") throw new Error("Formato inválido.");
    const instructor = parseInstructor(str(fd, "instructor"));
    if (!instructor.ok) throw new Error(instructor.error);

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

    try {
      await courseRepository().createProgram({
        plan,
        students,
        prices: PRECIOS,
        instructor: instructor.value,
        leadId: str(fd, "leadId") || null,
        notes: str(fd, "notes") || null,
        creditId: str(fd, "creditId") || null,
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
  if (/curso_duo_necesita_dos/.test(raw)) return "Un dúo necesita las dos personas.";
  if (/curso_individual_es_uno/.test(raw)) return "El formato individual lleva una sola persona.";
  if (/curso_credito_no_disponible/.test(raw)) return "El crédito de prueba ya no está disponible (vencido o usado).";
  return "No se pudo crear el programa.";
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

    const status = await repo.confirmCoursePayment(inscripcion.orderId, null, method);
    if (status === "already_paid") throw new Error("Esta inscripción ya está pagada.");
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
  const sesiones = await repo.listSessions(inscripciones[0].generationId);
  await notificationService().notifyCoursePaid({
    students: inscripciones.map((i) => ({ name: i.studentName, email: i.studentEmail })),
    generation: inscripciones[0].generationCode,
    totalClp: inscripciones[0].orderAmountClp ?? 0,
    method,
    // ISO: el formato del correo lo pone el servicio, igual que cuando paga por MP.
    sessions: sesiones
      .filter((s) => s.status === "agendada" && s.startsAt)
      .map((s) => ({ startsAt: s.startsAt!, endsAt: s.endsAt })),
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

/**
 * Registra una sesión de prueba ya realizada y emite su crédito.
 *
 * La prueba se vende y agenda por los caminos que ya existen (WhatsApp → reserva
 * manual); acá solo queda el token que la acredita contra el curso. Se separó a
 * propósito de create_checkout: tocar el camino del dinero de la sala para ganar
 * un flag no vale el riesgo.
 */
export async function issueTrialCreditAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.billing");
    const email = str(fd, "email").toLowerCase();
    const date = str(fd, "sessionDate");
    if (!email || !email.includes("@")) throw new Error("Email inválido.");
    if (!DATE_RE.test(date)) throw new Error("Fecha de la sesión inválida.");

    const repo = courseRepository();
    // El monto sale del precio publicado (lib/curso-content), no del formulario: con
    // el curso 1:1 ya no hay una "generación vigente" que lo fije.
    const amount = PRECIOS.prueba;

    const resource = await adminRepository().defaultResource();
    const { startsAt } = rangeFor(date, 12 * 60, 1, resource?.timezone ?? "America/Santiago");

    await repo.issueTrialCredit({
      email,
      amountClp: amount,
      sessionStartsAt: startsAt,
      note: str(fd, "note") || null,
    });
    revalidatePath("/admin/curso");
  });
}

/** "Extender 7 días": el crédito de una prueba (vigente o vencido) vale una semana más. */
export async function extendTrialCreditAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.billing");
    const creditId = str(fd, "creditId");
    if (!/^[0-9a-f-]{36}$/i.test(creditId)) throw new Error("Crédito inválido.");
    try {
      await courseRepository().extendCredit(creditId, TRIAL_CREDIT_DAYS);
    } catch (e) {
      if (e instanceof Error && e.message === "curso_credito_no_extensible") {
        throw new Error("Ese crédito ya se usó o se anuló: no se puede extender.");
      }
      throw e;
    }
    revalidatePath("/admin/curso");
    revalidatePath("/admin/curso/solicitudes");
  });
}

/** Busca el crédito de prueba vigente de un email, para mostrarlo antes de inscribir. */
export async function lookupTrialCreditAction(email: string): Promise<
  ActionDataResult<{
    credit: { id: string; amountClp: number; expiresAt: string } | null;
    /** La ficha que ya tiene este email: la inscripción la usa (no la renombra). */
    customer: { name: string | null; phone: string | null } | null;
  }>
> {
  return runData(async () => {
    await requirePermission("course.manage");
    if (!email || !email.includes("@")) return { credit: null, customer: null };
    const [credit, ficha] = await Promise.all([
      courseRepository().applicableCredit(email),
      customerDirectory().findByEmail(email),
    ]);
    return {
      credit: credit ? { id: credit.id, amountClp: credit.amountClp, expiresAt: credit.expiresAt } : null,
      customer: ficha ? { name: ficha.name, phone: ficha.phone } : null,
    };
  });
}

/**
 * Cancela una inscripción PAGADA, con o sin reembolso.
 *
 * La política de /terminos sugiere el monto (100% si faltan ≥7 días para la
 * sesión 1, nada si falta menos), pero el dueño manda: puede forzar total, nada o
 * un monto a mano. El cupo lo libera `mark_refunded` cuando el reembolso es
 * total — no acá, porque el webhook de MP también tiene que liberarlo cuando el
 * reembolso se inicia desde el panel.
 */
export async function refundEnrollmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.billing");
    const enrollmentId = str(fd, "enrollmentId");
    const mode = str(fd, "mode");
    if (!["policy", "full", "none", "custom"].includes(mode)) throw new Error("Modo inválido.");

    const repo = courseRepository();
    const inscripcion = await repo.enrollmentById(enrollmentId);
    if (!inscripcion?.orderId) throw new Error("Esta inscripción no tiene pedido.");
    if (inscripcion.status !== "pagada") {
      throw new Error("Solo se reembolsa una inscripción pagada. Una impaga se anula.");
    }

    const sesiones = await repo.listSessions(inscripcion.generationId);
    const primera = sesiones
      .filter((s) => s.status === "agendada" && s.startsAt)
      .map((s) => s.startsAt!)
      .sort()[0] ?? null;

    const custom = Number(fd.get("customAmount"));
    const amount = resolveCourseRefundAmount(mode as "policy" | "full" | "none" | "custom", {
      firstSessionStartsAt: primera,
      liveAmountClp: inscripcion.orderAmountClp ?? inscripcion.priceClp,
      customAmount: Number.isFinite(custom) && custom > 0 ? Math.round(custom) : undefined,
    });
    if (mode === "custom" && amount == null) throw new Error("Indica el monto a devolver.");

    const compañeros = await repo.enrollmentsByOrder(inscripcion.orderId);

    if (amount == null) {
      // Sin dinero de por medio: se anula el cupo directo. Los términos ofrecen
      // traslado o reemplazante como alternativa, pero eso es otra acción.
      await repo.cancelPaidEnrollment(inscripcion.orderId);
    } else {
      const res = await refundService().refundCourseOrder(inscripcion.orderId, { refundAmount: amount });
      if (res.alreadyProcessed) throw new Error("Ese reembolso ya estaba registrado.");
    }

    // Plantilla de la PAGADA: dice cuánto se devolvió (o nada de dinero si no se
    // devuelve). La de la impaga ("no se hizo ningún cobro") acá sería falsa.
    await notificationService()
      .notifyCourseRefunded({
        students: compañeros.map((i) => ({ name: i.studentName, email: i.studentEmail })),
        generation: compañeros[0]?.generationCode ?? "",
        refundedClp: amount,
      })
      .catch((e) => console.error("[curso:reembolso:email]", e));

    revalidatePath("/admin/curso");
    revalidatePath(`/admin/curso/inscripciones/${enrollmentId}`);
  });
}

/** Designa un reemplazante: cambia quién asiste, no quién pagó. */
export async function substituteStudentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const enrollmentId = str(fd, "enrollmentId");
    const name = required(fd, "name", "el nombre del reemplazante");
    const email = required(fd, "email", "el email del reemplazante");
    if (!email.includes("@")) throw new Error("Email inválido.");

    try {
      await courseRepository().substituteStudent(enrollmentId, {
        name,
        email,
        phone: str(fd, "phone") || null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      throw new Error(
        /not_active/.test(msg) ? "Esta inscripción ya no está activa." : "No se pudo designar el reemplazante.",
      );
    }
    revalidatePath("/admin/curso");
    revalidatePath(`/admin/curso/inscripciones/${enrollmentId}`);
  });
}

/**
 * Agenda una hora de práctica libre contra el saldo del alumno. La reserva y el
 * descuento del saldo ocurren en la MISMA transacción: en dos pasos, un fallo
 * entre medio deja una hora reservada sin descontar (regalada) o un saldo
 * descontado sin reserva (robada).
 */
export async function redeemPracticeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const enrollmentId = str(fd, "enrollmentId");
    const date = str(fd, "date");
    const startMinute = num(fd, "startMinute");
    const hours = num(fd, "hours");

    if (!DATE_RE.test(date)) throw new Error("Fecha inválida.");
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) throw new Error("Hora inválida.");
    if (!Number.isInteger(hours) || hours < 1 || hours > COURSE_PROGRAM.practiceHours) {
      throw new Error(`Horas: entre 1 y ${COURSE_PROGRAM.practiceHours}.`);
    }

    const resource = await adminRepository().defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");
    const { startsAt, endsAt } = rangeFor(date, startMinute, hours, resource.timezone);

    let reservationId: string;
    try {
      reservationId = await courseRepository().redeemPracticeHours(enrollmentId, { startsAt, endsAt, hours });
    } catch (e) {
      throw new Error(practiceErrorMessage(e instanceof Error ? e.message : ""));
    }
    await practiceLeft(enrollmentId)
      .then((p) =>
        p
          ? notificationService().notifyPractice("booked", {
              name: p.student.studentName,
              email: p.student.studentEmail,
              reservationId,
              startsAt,
              endsAt,
              hoursLeft: p.left,
            })
          : false,
      )
      .catch((e) => console.error("[curso:practica:email]", e));
    revalidatePath(`/admin/curso/inscripciones/${enrollmentId}`);
    revalidatePath("/admin/agenda");
  });
}

function practiceErrorMessage(raw: string): string {
  if (/exclusion|23P01|overlap/i.test(raw)) return "Ese horario ya está tomado.";
  if (/deadlock|40P01/i.test(raw)) return "Ese horario ya está tomado."; // segundo 40P01 seguido
  if (/practica_sin_saldo/.test(raw)) return "No le quedan horas de práctica suficientes.";
  if (/practica_no_elegible/.test(raw)) return "Solo una inscripción pagada tiene horas de práctica.";
  if (/practica_vencida/.test(raw)) return "Ese día queda fuera del plazo de las horas de práctica.";
  return "No se pudo agendar la práctica.";
}

/** Cancela una práctica agendada y devuelve la hora al saldo. */
export async function releasePracticeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("course.manage");
    const enrollmentId = str(fd, "enrollmentId");
    const reservationId = str(fd, "reservationId");
    // La hora se lee ANTES de soltarla (después ya no está activa).
    const hour = (await courseRepository().practiceRedemptions(enrollmentId).catch(() => [])).find(
      (r) => r.reservationId === reservationId && !r.releasedAt,
    );
    await courseRepository().releasePracticeHours(reservationId);
    if (hour?.startsAt && hour.endsAt) {
      const { startsAt, endsAt } = hour;
      await practiceLeft(enrollmentId)
        .then((p) =>
          p
            ? notificationService().notifyPractice("released", {
                name: p.student.studentName,
                email: p.student.studentEmail,
                reservationId,
                startsAt,
                endsAt,
                hoursLeft: p.left,
              })
            : false,
        )
        .catch((e) => console.error("[curso:practica:email]", e));
    }
    revalidatePath(`/admin/curso/inscripciones/${enrollmentId}`);
    revalidatePath("/admin/agenda");
  });
}

/** Registrar folio SII de un documento del curso — cuerpo compartido en components/admin/tax-docs/record-folio.ts. */
export async function recordTaxDocFolioAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(() => recordTaxDocFolioFromForm(fd));
}
