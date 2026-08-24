"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { GENERATION_STATUSES, type GenerationStatus } from "@/src/domain/course/course";
import { planSessions, selfOverlap } from "@/src/domain/course/sessions";
import { courseRepository, adminRepository } from "@/src/composition";
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
