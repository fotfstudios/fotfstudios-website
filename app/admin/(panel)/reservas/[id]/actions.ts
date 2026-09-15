"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { type ActionDataResult, type ActionResult, run, runData } from "@/components/admin/ui/action";
import { adminRepository, db, notificationService, paymentService, refundService, rescheduleService } from "@/src/composition";
import { resolveRefundAmount, type RefundMode } from "@/src/domain/scheduling/cancellation-policy";
import type { RescheduleOutcome } from "@/src/application/admin/reschedule-service";
import { currentClaims, requirePermission } from "@/src/infrastructure/auth/require-admin";
import { customerDbErrorMessage } from "@/src/domain/customers/customer-input";
import { formatCLP } from "@/src/domain/money/money";
import { hostFromHeaders } from "@/lib/urls";
import { getRescheduleDay } from "./reschedule-data";
import type { DayConsoleData } from "../nueva/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

const REFUND_MODES: readonly RefundMode[] = ["policy", "full", "none", "custom"];

// Campos de texto libre que escribe el admin (folio SII, código de acceso): tope de largo y
// sin caracteres de control. Defensa en profundidad — el admin es de confianza y React escapa
// al render, pero acota lo que entra a la DB.
const MAX_FIELD = 64;
const badField = (s: string) => s.length > MAX_FIELD || [...s].some((c) => { const n = c.charCodeAt(0); return n < 32 || n === 127; });

export async function cancelBookingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.cancel");
    const id = str(fd, "reservationId");
    const mode = str(fd, "mode") as RefundMode;
    if (!REFUND_MODES.includes(mode)) throw new Error("Modo de cancelación inválido.");

    // El monto se resuelve SIEMPRE del lado del servidor: `policy`/`full` se
    // recalculan al confirmar (starts_at + boleta viva actuales); solo `custom`
    // trae un número del cliente, validado en el dominio y re-capado en el RPC.
    // Orden 100% puntos (efectivo $0): la base reembolsable son los puntos
    // canjeados — misma política 100/50/0, repuesta como puntos.
    const target = await adminRepository().orderForReservation(id);
    const isPointsOrder = !!target && target.amountClp === 0 && target.pointsRedeemedClp > 0;
    let refundAmount: number | null = null;
    if (mode !== "none") {
      if (!target) throw new Error("Esta reserva no tiene un pago asociado. Cancela sin reembolso.");
      refundAmount = resolveRefundAmount(mode, {
        startsAt: target.startsAt,
        liveBoleta: isPointsOrder ? target.pointsRedeemedClp : target.amountClp - target.refundedAmountClp,
        customAmount: mode === "custom" ? num(fd, "customAmount") : undefined,
      });
    }

    // Cortesía (sin pedido): se lee ANTES de cancelar para saber que estaba vigente y
    // tener el email/horario en mano. Antes, cancelar una cortesía no mandaba nada.
    const courtesy = !target ? await adminRepository().getBooking(id).catch(() => null) : null;

    const { alreadyProcessed } = await refundService().cancelBooking(id, { refundAmount });

    if (courtesy && courtesy.kind === "booking" && courtesy.status === "confirmed") {
      await notificationService()
        .notifyCourtesyCancelled({
          email: courtesy.customerEmail,
          name: courtesy.customerName,
          startsAt: courtesy.startsAt,
          endsAt: courtesy.endsAt,
        })
        .catch((e) => console.error("[cancel:courtesy-email]", e));
    }

    // Aviso al cliente (best-effort): solo si había un pedido PAGADO antes de
    // cancelar. Si el loopback del webhook ya lo asentó, ese camino ya avisó.
    // Orden 100% puntos: el "monto" son puntos repuestos, no plata → el email lo dice así.
    if (target?.status === "paid" && !alreadyProcessed) {
      await notificationService()
        .notifyCancellation(
          target.orderId,
          isPointsOrder ? { refundAmount: null, restoredPoints: refundAmount } : { refundAmount },
        )
        .catch((e) => console.error("[cancel:email]", e));
    }

    revalidatePath(`/admin/reservas/${id}`);
    revalidatePath("/admin/reservas");
  });
}

export async function recordBoletaAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.boleta");
    const docId = str(fd, "docId");
    const folio = str(fd, "folio");
    const reservationId = str(fd, "reservationId");
    if (badField(folio)) throw new Error("Folio inválido.");
    if (folio) await adminRepository().recordBoleta(docId, folio, null);
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

/**
 * Código tipeado a mano (override del generado). YA NO manda el email: eso lo
 * hace el barrido del cron 10 minutos antes de la sesión, y solo después de que
 * el dueño marque que el PIN está cargado en la cerradura. Mandarlo acá, al
 * guardar, le daba al cliente un código que todavía no abría.
 */
export async function markAccessAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.access");
    const reservationId = str(fd, "reservationId");
    const code = str(fd, "code");
    if (!/^\d{4,10}$/.test(code)) throw new Error("El PIN son entre 4 y 10 dígitos.");
    await adminRepository().markAccess(reservationId, code);
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

/** PIN nuevo generado por la app. Reinicia el ciclo: hay que volver a cargarlo en la Yale. */
export async function regenerateAccessCodeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.access");
    const reservationId = str(fd, "reservationId");
    await adminRepository().regenerateAccessCode(reservationId);
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

// "Cargado" y "quitado" viven en app/admin/(panel)/cerradura/actions.ts: la página de
// la cerradura es su dueña y la ficha las importa de ahí.

/** Disponibilidad + ocupación del día para el picker de reagendamiento (excluye la propia reserva). */
export async function getRescheduleDayAction(reservationId: string, date: string): Promise<ActionDataResult<DayConsoleData>> {
  return runData(async () => {
    await requirePermission("reservations.reschedule");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida.");
    const resource = await adminRepository().defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");
    return getRescheduleDay(resource.id, resource.timezone, date, reservationId);
  });
}

/**
 * Anula un cobro de reagendamiento pendiente (H3): cierra la orden delta y libera
 * la reserva para reagendarla de nuevo. `false` es una carrera benigna — alguien
 * ya lo pagó o ya lo anuló entre el render y el clic — así que el mensaje manda a
 * recargar en vez de sonar a error de servidor.
 */
export async function cancelRescheduleChargeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.reschedule");
    const reservationId = str(fd, "reservationId");
    const rescheduleId = str(fd, "rescheduleId");
    const actor = (await currentClaims())?.sub ?? null;
    const ok = await rescheduleService().cancelPendingCharge(rescheduleId, actor);
    if (!ok) throw new Error("El cobro ya no estaba pendiente. Recarga la página.");
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

/**
 * Reintenta el reembolso de una fila `pending_refund` (H1): MP falló o lo dejó en
 * contingencia la primera vez y quedó por reintentar desde la ficha. `noop` es una
 * carrera benigna (el cron o otro reintento ya la resolvió) — se traduce vía
 * `rescheduleErrorMessage`. Si MP vuelve a fallar, la fila sigue pendiente y se avisa
 * con el motivo (mp_error/in_process) en vez de un error genérico. Los desenlaces que NO
 * son "reembolso hecho" (reserva cancelada entre medio, reembolso sin fila) se lanzan
 * como error para que el admin los vea persistentes, no como un toast verde.
 */
export async function retryRescheduleRefundAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.reschedule");
    const reservationId = str(fd, "reservationId");
    const res = await rescheduleService().retryRefund(str(fd, "rescheduleId"));
    if (!res.ok) throw new Error(rescheduleErrorMessage(res.error));
    // Se revalida ANTES de lanzar: la fila cambió de estado en varios de estos desenlaces
    // (cancelada, asentada por el loopback) y la ficha tiene que reflejarlo con el error.
    revalidatePath(`/admin/reservas/${reservationId}`);
    if (res.value.kind === "refund_pending") {
      throw new Error(
        res.value.reason === "in_process"
          ? "Mercado Pago todavía tiene el reembolso en proceso. Vuelve a intentar más tarde."
          : "Mercado Pago no respondió. Vuelve a intentar en unos minutos.",
      );
    }
    if (res.value.kind === "refund_looped_back") {
      throw new Error("La reserva quedó cancelada por un reembolso completo desde Mercado Pago; no hay nada que reintentar.");
    }
    if (res.value.kind === "refund_unaccounted") throw new Error(refundUnaccountedMessage(res.value));
  });
}

/** MP devolvió plata nuestra que no calza con ninguna fila pendiente: nunca se cancela nada; el dueño revisa MP. */
function refundUnaccountedMessage(v: { refundId: string; amount: number }): string {
  return `Mercado Pago aprobó un reembolso de ${formatCLP(v.amount)} (id ${v.refundId}) que no calza con ningún reagendamiento pendiente. Revísalo en el panel de MP antes de seguir.`;
}

/** Códigos del servicio de reagendamiento → mensaje es-CL para el admin. */
function rescheduleErrorMessage(code: string): string {
  switch (code) {
    case "not_found":
    case "no_order":
    case "not_active":
      return "Esta reserva no se puede reagendar.";
    case "not_paid":
      return "La reserva no está pagada.";
    case "points_order":
      return "Esta reserva usó Puntos FOTF; para cambiarla, cancélala y vuelve a crearla.";
    case "too_late":
      return "Ya no se puede reagendar (menos de 12 h para la sesión).";
    case "target_past":
      return "Ese horario ya pasó. Elige otro.";
    case "charge_unsupported":
      return "El nuevo horario cuesta más y el cobro del extra aún no está disponible.";
    case "reschedule_pending":
      return "Hay un reagendamiento pendiente en esta reserva. Anúlalo o espera a que se pague antes de mover la sesión.";
    case "noop":
      return "Este reembolso ya no está pendiente.";
    default:
      return code; // errores de la RPC (p. ej. "Ese horario ya está tomado.") ya vienen en es-CL
  }
}

export async function rescheduleAction(input: {
  reservationId: string;
  date: string;
  startMinute: number;
  durationHours: number;
}): Promise<ActionDataResult<RescheduleOutcome>> {
  return runData(async () => {
    await requirePermission("reservations.reschedule");
    const { reservationId, date, startMinute, durationHours } = input;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida.");
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1440) throw new Error("Hora inválida.");
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 16) throw new Error("Duración inválida.");

    const createdBy = (await currentClaims())?.sub ?? null;
    const res = await rescheduleService().reschedule({ reservationId, date, startMinute, durationHours, createdBy });
    if (!res.ok) throw new Error(rescheduleErrorMessage(res.error));
    // La reserva se movió y MP devolvió plata que no calza con la fila: error persistente
    // para el admin, sin email (no hay un "monto devuelto" del que avisar con certeza).
    if (res.value.kind === "refund_unaccounted") {
      revalidatePath(`/admin/reservas/${reservationId}`);
      revalidatePath("/admin/reservas");
      throw new Error(refundUnaccountedMessage(res.value));
    }

    // Aviso al cliente del cambio de horario (best-effort). El loopback raro
    // (refund_looped_back) canceló la reserva vía webhook: ahí no avisamos "reagendada".
    // Con el reembolso pendiente la reserva SÍ se movió: se avisa igual, con el monto
    // que se le va a devolver (el reintento no vuelve a mandar correo).
    if (res.value.kind !== "refund_looped_back") {
      const target = await adminRepository().orderForReservation(reservationId).catch(() => null);
      if (target) {
        await notificationService()
          .notifyReschedule(target.orderId, {
            refundAmount: res.value.kind === "refunded" || res.value.kind === "refund_pending" ? res.value.amount : 0,
          })
          .catch((e) => console.error("[reschedule:email]", e));
      }
    }

    revalidatePath(`/admin/reservas/${reservationId}`);
    revalidatePath("/admin/reservas");
    return res.value;
  });
}

/**
 * Cambia el cliente de una reserva vigente. Bajo `reservations.create` por
 * decisión del dueño: quien puede crear una reserva a nombre de alguien puede
 * corregir a nombre de quién quedó. Todo el trabajo —snapshot, pedidos delta,
 * puntos, evento— lo hace la RPC en una transacción; acá solo se pasa el actor
 * y se traduce el error.
 *
 * Estrena `booking_events.created_by`: hasta acá nada en el sistema lo llenaba.
 */
export async function assignCustomerAction(input: {
  reservationId: string;
  customerId: string;
}): Promise<ActionDataResult<{ ok: true }>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    const actor = (await currentClaims())?.sub ?? null;
    try {
      await adminRepository().assignCustomer(input.reservationId, input.customerId, actor);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      throw new Error(customerDbErrorMessage(null, null, code) ?? code);
    }
    revalidatePath(`/admin/reservas/${input.reservationId}`);
    revalidatePath("/admin/reservas");
    revalidatePath(`/admin/clientes/${input.customerId}`);
    return { ok: true as const };
  });
}

/** Liquida una reserva pendiente pagándola offline (efectivo/transferencia) — vía confirm_payment. */
export async function markPaidOfflineAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.create");
    const reservationId = str(fd, "reservationId");
    const method = str(fd, "method");
    if (method !== "efectivo" && method !== "transferencia") throw new Error("Método inválido.");
    const order = await adminRepository().orderForReservation(reservationId);
    if (!order || order.status !== "pending_payment") throw new Error("La reserva no está pendiente de pago.");
    const status = await adminRepository().confirmOffline(order.orderId, method);
    if (status === "paid_no_hold") {
      // Carrera rara: el cupo expiró entre el render de la página (que ya filtra la
      // card por `held`) y el clic. confirm_payment YA dejó la orden en 'paid' — no
      // hay boleta ni reserva confirmada que mostrar, así que se avisa al dueño para
      // revisión manual, igual que hace el webhook de MP ante el mismo desenlace.
      await notificationService()
        .notifyPaymentNeedsReview(order.orderId, `offline:${method}`)
        .catch((e) => console.error("[markPaidOffline:review]", e));
      revalidatePath(`/admin/reservas/${reservationId}`);
      throw new Error("El cupo ya no estaba reservado (expiró). El pago quedó registrado y se avisó para revisión.");
    }
    if (status !== "confirmed") throw new Error("No se pudo registrar el pago (el cupo pudo expirar).");
    // La confirmación sale AHORA, no con el cron de la noche. Sin esto, una
    // reserva que el dueño marca pagada acá dejaba al cliente hasta ~24 h sin
    // email por algo que ya pagó (el barrido corre una vez al día). Es el mismo
    // disparo inmediato que ya hacen efectivo y transferencia al crearse, y
    // `notifyOrder` es idempotente por `notified_at`, así que el cron no duplica.
    // Best-effort: el pago ya quedó registrado y un fallo de correo no lo revierte.
    await notificationService()
      .notifyOrder(order.orderId)
      .catch((e) => console.error("[markPaidOffline:email]", e));
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

/**
 * Genera un link de pago MP (72 h) para una reserva pendiente; el webhook confirma al pagarse.
 * Un hold de cliente (10 min) pasa a firme ANTES de emitir el link: si no, el link sobrevivía
 * ~72 h al cupo y un pago tardío caía en paid_no_hold (auditoría 2026-09-13, H5). Un hold
 * ya vencido no tiene cupo que cobrar → error; el dueño crea una reserva manual nueva.
 */
export async function sharePaymentLinkAction(
  reservationId: string,
): Promise<ActionDataResult<{ initPoint: string; amount: number; firmed: boolean }>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    const order = await adminRepository().orderForReservation(reservationId);
    if (!order || order.status !== "pending_payment") throw new Error("La reserva no está pendiente de pago.");
    const firm = await adminRepository().firmUpHold(reservationId);
    // Copy según lo que realmente pasó: entre la lectura de arriba y este update el cliente
    // pudo pagar (confirmed) o el hold pudo vencer (expired); decirle al dueño "crea una
    // reserva nueva" sobre una que acaba de pagarse lo empujaría a duplicarla.
    if (firm === "expired") throw new Error("El horario ya se liberó (el hold venció). Crea una reserva nueva.");
    if (firm === "confirmed") throw new Error("La reserva ya está confirmada (pagada). Recarga la página.");
    if (firm === "cancelled") throw new Error("La reserva está cancelada.");
    if (firm === "held") throw new Error("La reserva cambió de estado. Recarga la página.");
    const host = hostFromHeaders(await headers());
    const pref = await paymentService(db(), host).createPreferenceForOrder(order.orderId, { expiresInMinutes: 72 * 60 });
    if (!pref.ok) throw new Error(pref.error);
    // El link también por email, además del WhatsApp que arma la UI: hasta acá
    // una reserva "pendiente de pago" no generaba NINGÚN correo en toda su vida
    // hasta que se pagaba, así que el cliente no tenía nada por escrito. Mismo
    // patrón que el curso (notifyCoursePaymentLink). Best-effort: el link ya
    // existe y el dueño lo va a compartir igual, así que un fallo de correo no
    // puede voltear la acción ni esconder el link.
    await notificationService()
      .notifyBookingPaymentLink(order.orderId, { initPoint: pref.value.initPoint, expiresInHours: 72 })
      .catch((e) => console.error("[sharePaymentLink:email]", e));
    revalidatePath(`/admin/reservas/${reservationId}`);
    return { initPoint: pref.value.initPoint, amount: order.amountClp, firmed: firm === "firmed" };
  });
}
