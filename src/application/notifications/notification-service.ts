import { DateTime } from "luxon";
import { formatSessionWhen } from "./format-when";
import { manualHoldDeadline } from "@/src/domain/scheduling/manual-hold-deadline";
import { buildIcs, googleCalendarUrl } from "@/src/domain/calendar/ics";
import type { Mailer } from "@/src/application/ports/mailer";
import type { WhatsAppOutbox } from "@/src/application/ports/whatsapp";
import { waTemplate, type WaEvent, type WaParams } from "@/src/application/whatsapp/templates";
import { waRecipient } from "@/src/domain/contact/whatsapp-recipient";
import { randomUUID } from "node:crypto";
import type { NotificationRepository } from "@/src/application/ports/notifications";
import { formatCLP } from "@/src/domain/money/money";
import { paymentMethodLabel } from "@/src/domain/money/payment-method";
import { TRIAL_CREDIT_DAYS } from "@/src/domain/course/credit";
import { formatPoints } from "@/src/domain/points/points";
import type { ApplicationInput } from "@/src/domain/applications/application";
import type { CourseLeadInput } from "@/src/domain/course/lead";
import {
  applicantConfirmation,
  customerAccessCode,
  customerCancellation,
  customerConfirmation,
  customerCourtesyConfirmation,
  customerCourtesyRescheduled,
  customerReschedule,
  customerReschedulePaymentLink,
  customerRescheduleFailed,
  customerReminder,
  courseSessionReminder,
  customerCourtesyCancelled,
  customerHoldExpired,
  customerPaymentNoSlot,
  customerPointsBalance,
  beatcoinsExpiring,
  beatcoinsExpired,
  ownerNeedsReview,
  ownerDuplicatePayment,
  trialConfirmation,
  courseSessionsScheduled,
  courseSessionMoved,
  courseSessionCancelled,
  practiceBooked,
  practiceReleased,
  practiceMoved,
  ownerPracticeMoved,
  GUIADA,
  trialReminder,
  trialFollowUp,
  trialCreditExpiring,
  trialRescheduled,
  ownerTrialRescheduled,
  ownerNewApplication,
  ownerNotification,
  courseLeadConfirmation,
  guideDelivery,
  newsletterWelcome,
  ownerNewCourseLead,
  courseEnrollmentCancelled,
  courseEnrollmentRefunded,
  courseEnrollmentPaid,
  courseReviewRequest,
  ownerCoursePaid,
  bookingHeldPending,
  bookingPaymentPending,
  bookingPaymentReminder,
  courseEnrollmentPending,
} from "./templates";
import type { GuideDeliveryCopy, TransferDetails } from "./templates";

/** Reloj de 72 h de una reserva manual pendiente (creación o último link). `now` solo para tests. */
export interface PendingPaymentClock {
  clockStart: string;
  now?: Date;
}

export interface NotificationConfig {
  ownerEmail: string;
  /** Origen público del sitio (https://www.fotfstudios.cl): links a la reserva y a la cuenta. */
  siteUrl: string;
  tz: string;
  address: string;
  /** Link a Maps de la dirección (la dirección va como link propio, no auto-enlazada). */
  mapsUrl: string;
  whatsappUrl: string;
  termsUrl: string;
  privacyUrl: string;
  /** Formulario de reseña del perfil de Google. Sin él, notifyReviewRequest no envía. */
  reviewUrl?: string;
  /** Datos de transferencia (lib/site.ts TRANSFER) de los correos de reserva pendiente. */
  transfer: TransferDetails;
  /** Celular del dueño (`OWNER_WHATSAPP`, dígitos) para las alertas por WhatsApp. Sin él, no hay alertas. */
  ownerWhatsapp?: string | null;
}

/** Opciones de un aviso por WhatsApp encolado desde un `notify*`. */
interface WaEnqueue {
  /** Idempotencia: el mismo aviso para la misma entidad entra una sola vez a la cola. */
  dedupeKey: string;
  /** Nunca se manda después de esto (inicio de la sesión, plazo de pago…). */
  expiresAt: Date | string;
  buttonSuffix?: string;
  entity?: { kind: "order" | "reservation"; id: string };
}

/** Las alertas al dueño viven 24 h en la cola: más tarde ya no sirven de alerta. */
const OWNER_ALERT_TTL_MS = 24 * 3600_000;
/** El PIN sigue sirviendo un rato después de la hora de inicio (el cliente llega tarde). */
const ACCESS_PIN_GRACE_MS = 30 * 60_000;

/** Envía emails de confirmación (cliente + dueño) al pagarse una reserva. */
export class NotificationService {
  constructor(
    private readonly mailer: Mailer,
    private readonly repo: NotificationRepository,
    private readonly config: NotificationConfig,
    /**
     * Cola de WhatsApp. null = canal apagado (sin credenciales de Kapso): los `notify*` mandan
     * solo el correo y no se encola nada que después salga todo junto al configurar.
     */
    private readonly outbox: WhatsAppOutbox | null = null,
  ) {}

  async notifyOrder(orderId: string): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o || o.notifiedAt) return false;

    // Ramificar por `kind` ANTES de cualquier otra cosa. Solo 'booking'/'trial' son
    // dueños de una reserva; un pedido de curso o de delta de reagendamiento no
    // tiene `startsAt` y la plantilla de reserva saldría con la fecha en "—".
    // Como notifyPending() barre TODA orden pagada sin notificar, el cron
    // nocturno le mandaría una "Reserva confirmada · —". El curso avisa por su
    // propio camino (notifyCoursePaid); el delta avisa vía notifyReschedule.
    //
    // Se marca como notificado igual: si solo devolviéramos false, la orden
    // quedaría con notified_at en null y el barrido la volvería a levantar en
    // cada corrida, para siempre.
    if (o.kind !== "booking" && o.kind !== "trial") {
      await this.repo.markNotified(orderId);
      return false;
    }

    // Sesión ya terminada: no hay confirmación que valga. Sin esto, el barrido de
    // respaldo mandaba confirmaciones tardías de sesiones pasadas tras una caída
    // del proveedor (2026-07-10). Se marca para que converja.
    if (o.endsAt && DateTime.fromISO(o.endsAt) < DateTime.now()) {
      await this.repo.markNotified(orderId);
      return false;
    }

    // RECLAMAR antes de mandar (como AccessCodeService): dos corridas — cron,
    // webhook, sondeo de estado — no pueden mandar la misma confirmación. Antes
    // se marcaba al final: si el envío al dueño o el update fallaban, notified_at
    // quedaba en null y el cron diario re-mandaba la confirmación al cliente cada
    // día. Solo se suelta el reclamo si falla el envío al CLIENTE (el cron
    // reintenta hasta que la sesión termine); el del dueño es best-effort.
    if (!(await this.repo.markNotified(orderId))) return false;

    const when = this.when(o.startsAt, o.endsAt);
    const view = {
      name: o.name,
      when,
      total: formatCLP(o.amount),
      lines: o.lines.map((l) => ({ description: l.description, amount: formatCLP(l.subtotal) })),
    };

    if (o.email) {
      // La reserva al bolsillo: recibo público (sin login), Google Calendar y el .ics
      // adjunto (Apple Mail / Gmail lo ofrecen como evento), más la cuenta. Una prueba del
      // curso es guiada: su evento no promete código de acceso.
      const ev =
        o.startsAt && o.endsAt
          ? o.kind === "trial"
            ? this.trialCalendarEvent(orderId, o.startsAt, o.endsAt)
            : this.calendarEvent(orderId, o.startsAt, o.endsAt)
          : null;
      const links = {
        statusUrl: `${this.config.siteUrl}/reserva/estado?b=${orderId}`,
        calendarUrl: ev ? googleCalendarUrl(ev) : this.config.siteUrl,
        accountUrl: `${this.config.siteUrl}/cuenta`,
      };
      const attachments = ev ? [{ filename: "reserva-fotf.ics", content: buildIcs(ev) }] : undefined;
      const ctx = { address: this.config.address, mapsUrl: this.config.mapsUrl, whatsappUrl: this.config.whatsappUrl, links };
      try {
        await this.mailer.send({
          to: o.email,
          // Prueba del curso: guiada (sin PIN) y con el aviso del crédito para inscribirse.
          ...(o.kind === "trial"
            ? trialConfirmation({ ...view, creditDays: TRIAL_CREDIT_DAYS }, ctx)
            : customerConfirmation(view, ctx)),
          ...(attachments ? { attachments } : {}),
        });
      } catch (e) {
        await this.repo.releaseNotified(orderId).catch((e2) => console.error("[notify:release]", orderId, e2));
        throw e;
      }
    }
    if (this.config.ownerEmail) {
      await this.mailer
        .send({ to: this.config.ownerEmail, ...ownerNotification({ ...view, email: o.email, method: paymentMethodLabel(o.paymentMethod), trial: o.kind === "trial" }) })
        .catch((e) => console.error("[notify:owner]", orderId, e));
    }
    // WhatsApp (después del correo y bajo el MISMO reclamo de notified_at): cliente si aceptó,
    // dueño siempre. Vencen al inicio de la sesión: una confirmación tardía no sirve.
    if (o.startsAt) {
      // La plantilla fotf_reserva_confirmada promete el código de acceso: una prueba del curso
      // es guiada (sin PIN), así que al alumno le basta el correo. El dueño sí recibe su alerta.
      if (o.kind !== "trial") {
        await this.waCustomer(o, "booking_confirmed", { nombre: o.name ?? "", fecha: when, total: view.total }, {
          dedupeKey: `booking_confirmed:${orderId}`,
          expiresAt: o.startsAt,
          buttonSuffix: orderId,
          entity: { kind: "order", id: orderId },
        });
      }
      if (o.reservationId) {
        await this.waOwner("owner_new_booking", { cliente: o.name ?? o.email ?? "", fecha: when, total: view.total }, {
          dedupeKey: `owner_new_booking:${orderId}`,
          expiresAt: o.startsAt,
          buttonSuffix: o.reservationId,
          entity: { kind: "order", id: orderId },
        });
      }
    }
    return true;
  }

  /**
   * Confirmación al CLIENTE de una sesión de cortesía. Sin orden no hay pipeline de
   * pagos (ni `notified_at` ni barrido del cron): un solo disparo best-effort desde la
   * acción del admin, misma filosofía que notifyCancellation. Datos en mano porque la
   * reserva no guarda add-ons estructurados (van fundidos en notes).
   */
  async notifyCourtesy(input: {
    email: string | null;
    name: string | null;
    /** Sin orden, el evento del calendario se identifica por la RESERVA. */
    reservationId: string;
    startsAt: string;
    endsAt?: string | null;
    addonNames: string[];
  }): Promise<boolean> {
    if (!input.email) return false;
    const when = this.when(input.startsAt, input.endsAt ?? null);
    const ev = input.endsAt ? this.calendarEvent(`r-${input.reservationId}`, input.startsAt, input.endsAt, null) : null;
    await this.mailer.send({
      to: input.email,
      ...customerCourtesyConfirmation(
        { name: input.name, when, addonNames: input.addonNames },
        {
          address: this.config.address,
          mapsUrl: this.config.mapsUrl,
          whatsappUrl: this.config.whatsappUrl,
          termsUrl: this.config.termsUrl,
          privacyUrl: this.config.privacyUrl,
          links: { calendarUrl: ev ? googleCalendarUrl(ev) : this.config.siteUrl, accountUrl: `${this.config.siteUrl}/cuenta` },
        },
      ),
      ...(ev ? { attachments: [{ filename: "reserva-fotf.ics", content: buildIcs(ev) }] } : {}),
    });
    return true;
  }

  /**
   * Código/instrucciones de acceso al CLIENTE. Se dispara cada vez que el staff
   * guarda el acceso en la ficha (un código corregido también debe viajar).
   * Best-effort y datos en mano: la ficha ya tiene todo, sin ida extra a la DB.
   */
  async notifyAccessCode(input: {
    email: string | null;
    name: string | null;
    startsAt: string;
    endsAt?: string | null;
    code: string;
    /** Para el WhatsApp: sin la reserva no hay clave de idempotencia y no se encola. */
    reservationId?: string;
    phone?: string | null;
    whatsappOptIn?: boolean | null;
  }): Promise<boolean> {
    if (!input.email) return false;
    const when = this.when(input.startsAt, input.endsAt ?? null);
    await this.mailer.send({
      to: input.email,
      ...customerAccessCode(
        { name: input.name, when, code: input.code },
        { address: this.config.address, mapsUrl: this.config.mapsUrl, whatsappUrl: this.config.whatsappUrl },
      ),
    });
    if (input.reservationId) {
      // La clave lleva el código: un PIN corregido viaja de nuevo; el mismo PIN, una vez.
      await this.waCustomer(
        input,
        "access_pin",
        { nombre: input.name ?? "", hora: DateTime.fromISO(input.startsAt).setZone(this.config.tz).toFormat("HH:mm"), pin: input.code },
        {
          dedupeKey: `access_pin:${input.reservationId}:${input.code}`,
          expiresAt: new Date(new Date(input.startsAt).getTime() + ACCESS_PIN_GRACE_MS),
          entity: { kind: "reservation", id: input.reservationId },
        },
      );
    }
    return true;
  }

  /**
   * Recordatorio de sesión al CLIENTE (lo dispara ReminderService desde el cron).
   * Datos en mano; sin orden (cortesía) el link va a la cuenta en vez del recibo.
   */
  async notifyReminder(input: {
    email: string | null;
    name: string | null;
    orderId: string | null;
    startsAt: string;
    endsAt: string | null;
    /** Para el WhatsApp: sin la reserva no hay clave de idempotencia y no se encola. */
    reservationId?: string;
    phone?: string | null;
    whatsappOptIn?: boolean | null;
  }): Promise<boolean> {
    if (!input.email) return false;
    const statusUrl = input.orderId
      ? `${this.config.siteUrl}/reserva/estado?b=${input.orderId}`
      : `${this.config.siteUrl}/cuenta`;
    const when = this.when(input.startsAt, input.endsAt);
    await this.mailer.send({
      to: input.email,
      ...customerReminder(
        { name: input.name, when },
        { address: this.config.address, mapsUrl: this.config.mapsUrl, whatsappUrl: this.config.whatsappUrl, statusUrl },
      ),
    });
    if (input.reservationId) {
      await this.waCustomer(input, "session_reminder", { nombre: input.name ?? "", fecha: when, direccion: this.config.address }, {
        dedupeKey: `session_reminder:${input.reservationId}`,
        expiresAt: input.startsAt,
        entity: { kind: "reservation", id: input.reservationId },
      });
    }
    return true;
  }

  /** Recordatorio de una sesión guiada del curso: nombra la sesión y a quien la dicta. */
  async notifyCourseSessionReminder(input: {
    email: string | null;
    name: string | null;
    startsAt: string;
    endsAt: string | null;
    n: number;
    title: string;
    instructor: string | null;
  }): Promise<boolean> {
    if (!input.email) return false;
    await this.mailer.send({
      to: input.email,
      ...courseSessionReminder(
        { name: input.name, when: this.when(input.startsAt, input.endsAt), n: input.n, title: input.title, instructor: input.instructor },
        {
          address: this.config.address,
          mapsUrl: this.config.mapsUrl,
          whatsappUrl: this.config.whatsappUrl,
          courseUrl: `${this.config.siteUrl}/cuenta/curso`,
        },
      ),
    });
    return true;
  }

  /** Recordatorio ~24 h antes de una prueba del curso (guiada: sin PIN). */
  async notifyTrialReminder(input: { email: string | null; name: string | null; startsAt: string; endsAt: string | null }): Promise<boolean> {
    if (!input.email) return false;
    await this.mailer.send({
      to: input.email,
      ...trialReminder(
        { name: input.name, when: this.when(input.startsAt, input.endsAt) },
        { address: this.config.address, mapsUrl: this.config.mapsUrl, whatsappUrl: this.config.whatsappUrl },
      ),
    });
    return true;
  }

  /**
   * Seguimiento del crédito de una prueba: `followup` el día después de la sesión,
   * `expiring` dos días antes de que venza. Lanza si el envío falla (el barrido suelta
   * el reclamo y reintenta).
   */
  async notifyTrialCredit(
    kind: "followup" | "expiring",
    input: { email: string; name: string | null; amount: number; expiresAt: string },
  ): Promise<void> {
    const v = {
      name: input.name,
      amount: formatCLP(input.amount),
      expiresOn: DateTime.fromISO(input.expiresAt).setZone(this.config.tz).setLocale("es").toFormat("cccc d 'de' LLLL"),
    };
    const ctx = { courseUrl: `${this.config.siteUrl}/curso-dj`, whatsappUrl: this.config.whatsappUrl };
    await this.mailer.send({ to: input.email, ...(kind === "followup" ? trialFollowUp(v, ctx) : trialCreditExpiring(v, ctx)) });
  }

  /**
   * Aviso al CLIENTE de que su reserva fue cancelada (con o sin reembolso).
   * Best-effort y sin guard de `notified_at` (esa columna es de la confirmación):
   * se dispara solo en los dos momentos únicos — la acción del admin o un
   * reembolso externo FRESCO vía webhook (el loopback admin dedupea por inbox).
   */
  async notifyCancellation(
    orderId: string,
    /**
     * `restoredPoints`: orden 100% puntos — se repusieron puntos, no hubo plata.
     * `notifyOwner`: alerta por WhatsApp al dueño. Solo el reembolso hecho FUERA del panel (webhook
     * de MP): una cancelación desde el admin la hizo el propio dueño.
     */
    opts: { refundAmount: number | null; restoredPoints?: number | null; notifyOwner?: boolean },
  ): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (opts.notifyOwner && o?.reservationId) {
      await this.waOwner(
        "owner_cancellation",
        {
          cliente: o.name ?? o.email ?? "",
          fecha: this.when(o.startsAt, o.endsAt),
          reembolso: opts.refundAmount != null && opts.refundAmount > 0 ? formatCLP(opts.refundAmount) : "sin monto",
        },
        {
          dedupeKey: `owner_cancellation:${orderId}`,
          expiresAt: new Date(Date.now() + OWNER_ALERT_TTL_MS),
          buttonSuffix: o.reservationId,
          entity: { kind: "order", id: orderId },
        },
      );
    }
    if (!o?.email) return false;
    const when = this.when(o.startsAt, o.endsAt);
    await this.mailer.send({
      to: o.email,
      ...customerCancellation(
        {
          name: o.name,
          when,
          refunded: opts.refundAmount != null && opts.refundAmount > 0 ? formatCLP(opts.refundAmount) : null,
          restoredPoints: opts.restoredPoints ?? null,
        },
        { whatsappUrl: this.config.whatsappUrl },
      ),
    });
    return true;
  }

  /**
   * Aviso al CLIENTE de que su reserva cambió de horario (best-effort). `startsAt`
   * ya refleja el NUEVO horario (la reserva se movió). Con reembolso del delta si el
   * nuevo horario era más barato.
   */
  async notifyReschedule(orderId: string, opts: { refundAmount: number; offline?: boolean }): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o?.email) return false;
    const when = this.when(o.startsAt, o.endsAt);
    // Mismo uid que la confirmación: el calendario ACTUALIZA el evento en vez de duplicarlo.
    const ev = o.startsAt && o.endsAt ? this.calendarEvent(orderId, o.startsAt, o.endsAt) : null;
    await this.mailer.send({
      to: o.email,
      ...customerReschedule(
        {
          name: o.name,
          when,
          refunded: opts.refundAmount > 0 ? formatCLP(opts.refundAmount) : null,
          refundedOffline: opts.offline ?? false,
        },
        {
          whatsappUrl: this.config.whatsappUrl,
          address: this.config.address,
          mapsUrl: this.config.mapsUrl,
          calendarUrl: ev ? googleCalendarUrl(ev) : this.config.siteUrl,
        },
      ),
      ...(ev ? { attachments: [{ filename: "reserva-fotf.ics", content: buildIcs(ev) }] } : {}),
    });
    return true;
  }

  /**
   * Aviso al CLIENTE de que el cobro de un reagendamiento se devolvió sin aplicarse.
   * `kept`: la reserva original SIGUE viva (el caso típico — el slot ya estaba tomado
   * cuando se procesó el pago) vs. ya estaba cancelada cuando llegó el pago del cambio
   * de horario (`reservation_gone`/`charge_void` tras una cancelación, o un reembolso
   * manual del panel de MP sobre un cobro que ya no aplica) — la plantilla cambia de
   * copy para no decir "mantuvimos tu reserva" de una reserva que ya no existe (FR2,
   * auditoría 2026-09-14). Best-effort.
   */
  async notifyRescheduleFailed(orderId: string, opts: { refundAmount: number; kept: boolean }): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o?.email) return false;
    const when = this.when(o.startsAt, o.endsAt);
    await this.mailer.send({
      to: o.email,
      ...customerRescheduleFailed(
        { name: o.name, when, refunded: formatCLP(opts.refundAmount), kept: opts.kept },
        { whatsappUrl: this.config.whatsappUrl },
      ),
    });
    return true;
  }

  /**
   * Pago aprobado sin reserva válida (`paid_no_hold`): alerta al dueño PRIMERO (es
   * quien decide devolver o reasignar) y al cliente le reconoce el pago —antes no
   * recibía nada: plata fuera, cero correo—. `confirm_payment` ya marcó `notified_at`
   * para suprimir la confirmación normal. Cada envío es independiente y best-effort.
   */
  async notifyPaymentNeedsReview(orderId: string, paymentId: string): Promise<void> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o) return;
    const when = this.when(o.startsAt, o.endsAt);
    const total = formatCLP(o.amount);
    if (this.config.ownerEmail) {
      await this.mailer
        .send({ to: this.config.ownerEmail, ...ownerNeedsReview({ when, total, email: o.email, paymentId }) })
        .catch((e) => console.error("[notify:review:owner]", orderId, e));
    }
    if (o.email) {
      await this.mailer
        .send({ to: o.email, ...customerPaymentNoSlot({ name: o.name, when, total }, { whatsappUrl: this.config.whatsappUrl }) })
        .catch((e) => console.error("[notify:review:customer]", orderId, e));
    }
  }

  /**
   * Pago duplicado (la guardia de confirm_payment lo rechazó): solo al dueño, que es
   * quien devuelve el pago desde MP. Al cliente no se le escribe: su reserva sigue
   * pagada y confirmada; el dueño decide cómo contarle.
   */
  async notifyDuplicatePayment(orderId: string, paymentId: string, amount: number): Promise<void> {
    if (!this.config.ownerEmail) return;
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o) return;
    await this.mailer.send({
      to: this.config.ownerEmail,
      ...ownerDuplicatePayment({
        when: o.startsAt ? this.when(o.startsAt, o.endsAt) : "Curso de DJ",
        email: o.email,
        paymentId,
        amount: formatCLP(amount),
        storedMethod: paymentMethodLabel(o.paymentMethod),
      }),
    });
  }

  /** Reserva pendiente vencida (link de 72 h sin pagar): el horario se liberó. Best-effort. */
  async notifyHoldExpired(orderId: string): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o?.email) return false;
    await this.mailer.send({
      to: o.email,
      ...customerHoldExpired(
        { name: o.name, when: this.when(o.startsAt, o.endsAt) },
        { whatsappUrl: this.config.whatsappUrl, bookUrl: `${this.config.siteUrl}/reservar` },
      ),
    });
    return true;
  }

  /** Cortesía cancelada: datos en mano (no hay orden), mismo patrón que notifyCourtesy. */
  async notifyCourtesyCancelled(input: {
    email: string | null;
    name: string | null;
    startsAt: string;
    endsAt: string | null;
  }): Promise<boolean> {
    if (!input.email) return false;
    await this.mailer.send({
      to: input.email,
      ...customerCourtesyCancelled(
        { name: input.name, when: this.when(input.startsAt, input.endsAt) },
        { whatsappUrl: this.config.whatsappUrl },
      ),
    });
    return true;
  }

  /**
   * Nueva postulación de DJ (/unete): aviso al dueño + confirmación al postulante.
   * Dueño PRIMERO: su email es el que importa para el triage; el del postulante es
   * input no verificado y puede rebotar (no debe suprimir el aviso al dueño). Sin repo
   * ni `notified_at` — un solo disparo best-effort (el .catch vive en el route handler).
   */
  async notifyApplication(app: ApplicationInput): Promise<void> {
    if (this.config.ownerEmail) {
      await this.mailer.send({ to: this.config.ownerEmail, ...ownerNewApplication(app) });
    }
    await this.mailer.send({
      to: app.email,
      ...applicantConfirmation({ name: app.name }, { whatsappUrl: this.config.whatsappUrl }),
    });
  }

  /**
   * Solicitud del curso: aviso al dueño + acuse al alumno. Mismo orden y mismas
   * razones que notifyApplication — el email del alumno es input no verificado y no
   * debe suprimir el aviso que dispara el triage. Un solo disparo best-effort.
   */
  async notifyCourseLead(lead: CourseLeadInput): Promise<void> {
    if (this.config.ownerEmail) {
      await this.mailer.send({ to: this.config.ownerEmail, ...ownerNewCourseLead(lead) });
    }
    await this.waOwner(
      "owner_new_lead",
      { origen: "el Curso DJ", nombre: lead.name, contacto: [lead.email, lead.phone].filter(Boolean).join(" · ") },
      { dedupeKey: `owner_new_lead:curso:${randomUUID()}`, expiresAt: new Date(Date.now() + OWNER_ALERT_TTL_MS) },
    );
    await this.mailer.send({
      to: lead.email,
      ...courseLeadConfirmation({ name: lead.name }, { whatsappUrl: this.config.whatsappUrl }),
    });
  }

  /**
   * Pedido de reseña en Google a quien ya vino a la sala (prueba o curso). Disparo
   * manual del dueño desde el admin; el error del mailer se propaga para que el admin
   * vea si no salió.
   */
  async notifyReviewRequest(v: { email: string; name: string }): Promise<void> {
    if (!this.config.reviewUrl) throw new Error("Falta el link de reseñas de Google (reviewUrl).");
    await this.mailer.send({
      to: v.email,
      ...courseReviewRequest({ name: v.name }, { reviewUrl: this.config.reviewUrl, whatsappUrl: this.config.whatsappUrl }),
    });
  }

  /**
   * Guía de /guia-dj: UN correo al lead con el link durable de descarga. Sin aviso al
   * dueño: los leads se miran en el admin, no en la bandeja. El error del mailer se
   * propaga (acá el correo es el producto; GuideService decide).
   */
  async notifyGuideLead(v: {
    email: string;
    token: string;
    copy: GuideDeliveryCopy;
    landingPath: string;
  }): Promise<void> {
    // El link cuelga de la landing de SU guía. Los correos ya enviados apuntan a
    // /guia-dj/descarga/<token>, que es exactamente lo que esto sigue produciendo.
    const downloadUrl = `${this.config.siteUrl}${v.landingPath}/descarga/${v.token}`;
    await this.mailer.send({
      to: v.email,
      ...guideDelivery({ downloadUrl, copy: v.copy }, { whatsappUrl: this.config.whatsappUrl }),
    });
    // Después del correo: si el correo (el producto) falla, no hay lead que avisar. La clave es
    // el token del lead: un reintento del mismo pedido no duplica la alerta.
    await this.waOwner(
      "owner_new_lead",
      { origen: `la guía ${v.copy.name}`, nombre: "un lead sin nombre", contacto: v.email },
      { dedupeKey: `owner_new_lead:guia:${v.token}`, expiresAt: new Date(Date.now() + OWNER_ALERT_TTL_MS) },
    );
  }

  /**
   * Bienvenida al newsletter con su link de baja. El error del mailer se propaga:
   * NewsletterService decide que es best-effort (la suscripción ya quedó guardada).
   */
  async notifyNewsletterWelcome(v: { email: string; unsubscribeToken: string }): Promise<void> {
    await this.mailer.send({
      to: v.email,
      ...newsletterWelcome({
        unsubscribeUrl: `${this.config.siteUrl}/baja/${v.unsubscribeToken}`,
        blogUrl: `${this.config.siteUrl}/blog`,
      }),
    });
  }

  /**
   * Saldo de Puntos FOTF, a pedido del dueño desde la ficha del cliente. Acá el
   * correo ES el producto (como la guía): un fallo del proveedor se PROPAGA y la
   * acción del admin lo muestra, a diferencia de los avisos best-effort que
   * cuelgan de una reserva y no deben tumbar la operación que los disparó.
   *
   * Sin claim de idempotencia: lo dispara una persona cuando quiere, no un
   * barrido. La constancia de cada intento la deja LoggedMailer en la bitácora.
   */
  async notifyPointsBalance(v: { name: string | null; email: string; points: number }): Promise<void> {
    await this.mailer.send({
      to: v.email,
      ...customerPointsBalance(
        // 1 punto = $1 CLP: la equivalencia es el mismo número, con formato de plata.
        { name: v.name, points: formatPoints(v.points), value: formatCLP(v.points) },
        {
          whatsappUrl: this.config.whatsappUrl,
          bookUrl: `${this.config.siteUrl}/reservar`,
          accountUrl: `${this.config.siteUrl}/cuenta`,
        },
      ),
    });
  }

  /**
   * Aviso de vencimiento de Beatcoins (30 o 7 días antes). Lo manda el barrido diario:
   * un fallo se PROPAGA para que el barrido suelte el reclamo y reintente mañana.
   */
  async notifyBeatcoinsExpiring(v: {
    email: string;
    name: string | null;
    expiring: number;
    permanent: number;
    expiresAt: string;
  }): Promise<void> {
    await this.mailer.send({
      to: v.email,
      ...beatcoinsExpiring(
        {
          name: v.name,
          expiring: formatPoints(v.expiring),
          value: formatCLP(v.expiring),
          expiresOn: this.longDate(v.expiresAt),
          permanent: v.permanent > 0 ? formatPoints(v.permanent) : null,
        },
        this.beatcoinsLinks(),
      ),
    });
  }

  /** Aviso de cuenta: vencieron Beatcoins. Mismo contrato que el anterior (propaga). */
  async notifyBeatcoinsExpired(v: { email: string; name: string | null; expired: number; remaining: number }): Promise<void> {
    await this.mailer.send({
      to: v.email,
      ...beatcoinsExpired(
        { name: v.name, expired: formatPoints(v.expired), remaining: v.remaining > 0 ? formatPoints(v.remaining) : null },
        this.beatcoinsLinks(),
      ),
    });
  }

  private beatcoinsLinks() {
    return {
      whatsappUrl: this.config.whatsappUrl,
      bookUrl: `${this.config.siteUrl}/reservar`,
      accountUrl: `${this.config.siteUrl}/cuenta`,
    };
  }

  /** "martes 10 de noviembre" (+ " de 2027" si no es este año). */
  private longDate(iso: string): string {
    const d = DateTime.fromISO(iso).setZone(this.config.tz).setLocale("es");
    return d.toFormat(d.year === DateTime.now().setZone(this.config.tz).year ? "cccc d 'de' LLLL" : "cccc d 'de' LLLL 'de' yyyy");
  }

  /**
   * Inscripción pagada: confirmación al alumno + aviso al dueño. Recién acá viaja
   * la dirección de la sala (la FAQ promete compartirla al confirmar la
   * inscripción). Un solo disparo best-effort desde la acción del admin; el
   * barrido nocturno no toca pedidos de curso (ver la rama de `kind` arriba).
   */
  async notifyCoursePaid(v: {
    students: { name: string; email: string }[];
    generation: string;
    totalClp: number;
    method: string;
    /** Sesiones agendadas en ISO; el formato lo pone el servicio (uno solo, venga de donde venga). */
    sessions: { startsAt: string; endsAt?: string | null }[];
  }): Promise<void> {
    const total = formatCLP(v.totalClp);
    const sessions = v.sessions.map((s) => this.when(s.startsAt, s.endsAt ?? null));
    // Un dúo son dos alumnos: cada uno recibe su confirmación, aunque el pedido
    // sea uno solo.
    for (const student of v.students) {
      await this.mailer.send({
        to: student.email,
        ...courseEnrollmentPaid(
          { name: student.name, generation: v.generation, total, sessions },
          { address: this.config.address, mapsUrl: this.config.mapsUrl, whatsappUrl: this.config.whatsappUrl },
        ),
      });
    }
    if (this.config.ownerEmail) {
      await this.mailer.send({
        to: this.config.ownerEmail,
        ...ownerCoursePaid({
          name: v.students.map((s) => s.name).join(" y "),
          generation: v.generation,
          total,
          method: v.method,
        }),
      });
    }
  }

  /** Link de pago al alumno. Solo al primero: el dúo lo paga quien inscribe. */
  async notifyCoursePaymentLink(v: {
    name: string;
    email: string;
    generation: string;
    totalClp: number;
    initPoint: string;
    expiresInHours: number;
  }): Promise<void> {
    await this.mailer.send({
      to: v.email,
      ...courseEnrollmentPending(
        {
          name: v.name,
          generation: v.generation,
          total: formatCLP(v.totalClp),
          initPoint: v.initPoint,
          expiresInHours: v.expiresInHours,
        },
        { termsUrl: this.config.termsUrl, whatsappUrl: this.config.whatsappUrl },
      ),
    });
  }

  /**
   * Manda al cliente el link de pago de una reserva pendiente.
   *
   * Best-effort, como el resto de los avisos: el link ya existe y el dueño lo va
   * a compartir igual por WhatsApp, así que un fallo de correo no puede voltear
   * la acción. Sin email en la reserva no hay nada que mandar y devuelve false.
   */
  async notifyBookingPaymentLink(orderId: string, v: { initPoint: string; expiresInHours: number }): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o?.email) return false;
    // NO se marca notified_at: eso pertenece al email de CONFIRMACIÓN, que sale
    // cuando la reserva se paga. Marcarlo acá dejaría al cliente sin su
    // confirmación y al dueño sin su aviso de reserva pagada.
    const when = this.when(o.startsAt, o.endsAt);
    await this.mailer.send({
      to: o.email,
      ...bookingPaymentPending(
        { name: o.name, when, total: formatCLP(o.amount), initPoint: v.initPoint, expiresInHours: v.expiresInHours },
        { termsUrl: this.config.termsUrl, whatsappUrl: this.config.whatsappUrl },
      ),
    });
    return true;
  }

  /**
   * Aviso al cliente al CREAR una reserva manual pendiente de pago (aún sin link).
   * Sin esto el cliente no recibía nada hasta pagar — o hasta que el hold vencía.
   * Mismas reglas que notifyBookingPaymentLink: best-effort, sin email no manda, y
   * NO toca notified_at (eso es de la confirmación al pagar). `clockStart` es el inicio
   * del reloj de 72 h (ahora, al crearla); el plazo que dice el correo es
   * manualHoldDeadline: lo primero entre el barrido y el inicio de la sesión.
   */
  async notifyBookingHeld(orderId: string, v: PendingPaymentClock): Promise<boolean> {
    return this.sendPendingPayment(orderId, v, bookingHeldPending, "payment_pending");
  }

  /**
   * Recordatorio de pago de una reserva manual pendiente (PaymentReminderService, con
   * ≤ 24 h para el plazo). Mismas reglas que notifyBookingHeld; el reclamo
   * (payment_reminder_sent_at) lo lleva el barrido, no este método.
   */
  async notifyPaymentReminder(orderId: string, v: PendingPaymentClock): Promise<boolean> {
    return this.sendPendingPayment(orderId, v, bookingPaymentReminder, "payment_reminder");
  }

  private async sendPendingPayment(
    orderId: string,
    v: PendingPaymentClock,
    template: typeof bookingHeldPending | typeof bookingPaymentReminder,
    event: "payment_pending" | "payment_reminder",
  ): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o?.email) return false;
    const payBy = manualHoldDeadline(v.clockStart, o.startsAt, v.now);
    const view = {
      name: o.name,
      when: this.when(o.startsAt, o.endsAt),
      total: formatCLP(o.amount),
      payBy: formatSessionWhen(payBy.toISOString(), this.config.tz),
    };
    await this.mailer.send({
      to: o.email,
      ...template(view, { termsUrl: this.config.termsUrl, whatsappUrl: this.config.whatsappUrl, transfer: this.config.transfer }),
    });
    // WhatsApp vence con el plazo de pago: pasado el plazo el horario ya se liberó.
    const wa = { nombre: o.name ?? "", fecha: view.when, total: view.total, plazo: view.payBy };
    const entity = { kind: "order" as const, id: orderId };
    await this.waCustomer(o, event, wa, { dedupeKey: `${event}:${orderId}`, expiresAt: payBy, buttonSuffix: orderId, entity });
    if (event === "payment_pending" && o.reservationId) {
      await this.waOwner(
        "owner_payment_pending",
        { cliente: o.name ?? o.email, fecha: view.when, total: view.total, plazo: view.payBy },
        { dedupeKey: `owner_payment_pending:${orderId}`, expiresAt: payBy, buttonSuffix: o.reservationId, entity },
      );
    }
    return true;
  }

  /**
   * Cortesía reagendada: datos en mano (no hay orden), mismo patrón que
   * notifyCourtesyCancelled + el bloque de calendario de notifyReschedule. Mismo uid
   * que notifyCourtesy (`r-${reservationId}`, sin orderId): el calendario ACTUALIZA
   * el evento en vez de duplicarlo.
   */
  async notifyCourtesyRescheduled(input: {
    email: string | null;
    name: string | null;
    reservationId: string;
    oldStartsAt: string;
    startsAt: string;
    endsAt: string;
  }): Promise<boolean> {
    if (!input.email) return false;
    const ev = this.calendarEvent(`r-${input.reservationId}`, input.startsAt, input.endsAt, null);
    await this.mailer.send({
      to: input.email,
      ...customerCourtesyRescheduled(
        { name: input.name, oldWhen: this.when(input.oldStartsAt, null), when: this.when(input.startsAt, input.endsAt) },
        {
          whatsappUrl: this.config.whatsappUrl,
          address: this.config.address,
          mapsUrl: this.config.mapsUrl,
          calendarUrl: googleCalendarUrl(ev),
        },
      ),
      attachments: [{ filename: "reserva-fotf.ics", content: buildIcs(ev) }],
    });
    return true;
  }

  /**
   * Prueba del curso movida desde el admin (move_trial_reservation): al DUEÑO y al CLIENTE,
   * por correo y por WhatsApp. Best-effort y después del RPC: la reserva ya cambió de hora y
   * los datos actuales (nombre, contacto, horario NUEVO) salen del pedido. Primero el dueño y
   * cada envío por separado: un correo que falla no se lleva al otro.
   */
  async notifyTrialRescheduled(input: {
    orderId: string;
    reservationId: string;
    oldStartsAt: string;
    oldEndsAt: string | null;
  }): Promise<{ owner: boolean; customer: boolean }> {
    const sent = { owner: false, customer: false };
    const o = await this.repo.getOrderForEmail(input.orderId);
    if (!o?.startsAt || !o.endsAt) return sent;
    const before = this.when(input.oldStartsAt, input.oldEndsAt);
    const after = this.when(o.startsAt, o.endsAt);

    if (this.config.ownerEmail) {
      try {
        await this.mailer.send({
          to: this.config.ownerEmail,
          ...ownerTrialRescheduled({
            name: o.name,
            email: o.email,
            phone: o.phone ?? null,
            before,
            after,
            adminUrl: `${this.config.siteUrl}/admin/reservas/${input.reservationId}`,
          }),
        });
        sent.owner = true;
      } catch (e) {
        console.error("[notify:trial-moved:owner]", input.orderId, e);
      }
    }
    if (o.email) {
      // Mismo evento (y uid) que la confirmación: el calendario lo ACTUALIZA.
      const ev = this.trialCalendarEvent(input.orderId, o.startsAt, o.endsAt);
      try {
        await this.mailer.send({
          to: o.email,
          ...trialRescheduled(
            { name: o.name, before, after },
            {
              address: this.config.address,
              mapsUrl: this.config.mapsUrl,
              whatsappUrl: this.config.whatsappUrl,
              calendarUrl: googleCalendarUrl(ev),
            },
          ),
          attachments: [{ filename: "reserva-fotf.ics", content: buildIcs(ev) }],
        });
        sent.customer = true;
      } catch (e) {
        console.error("[notify:trial-moved:customer]", input.orderId, e);
      }
    }
    // Una prueba puede moverse varias veces: la clave lleva el horario nuevo.
    await this.waOwner("owner_trial_rescheduled", { cliente: o.name ?? o.email ?? "", antes: before, ahora: after }, {
      dedupeKey: `owner_trial_rescheduled:${input.reservationId}:${o.startsAt}`,
      expiresAt: new Date(Date.now() + OWNER_ALERT_TTL_MS),
      buttonSuffix: input.reservationId,
      entity: { kind: "reservation", id: input.reservationId },
    });
    await this.waCustomer(o, "trial_rescheduled", { nombre: o.name ?? "", antes: before, ahora: after }, {
      dedupeKey: `trial_rescheduled:${input.reservationId}:${o.startsAt}`,
      expiresAt: o.startsAt,
      buttonSuffix: input.orderId,
      entity: { kind: "order", id: input.orderId },
    });
    return sent;
  }

  /**
   * Manda al cliente el link de pago del EXCEDENTE de un reagendamiento (H4): el
   * nuevo horario cuesta más y la reserva sigue en su horario ORIGINAL hasta que
   * pague. Best-effort, como el resto de los avisos.
   */
  async notifyReschedulePaymentLink(
    orderId: string,
    v: { newStartsAt: string; newEndsAt: string; amount: number; initPoint: string; expiresInHours: number },
  ): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o?.email) return false;
    await this.mailer.send({
      to: o.email,
      ...customerReschedulePaymentLink(
        {
          name: o.name,
          oldWhen: this.when(o.startsAt, o.endsAt),
          newWhen: this.when(v.newStartsAt, v.newEndsAt),
          amount: formatCLP(v.amount),
          initPoint: v.initPoint,
          expiresInHours: v.expiresInHours,
        },
        { whatsappUrl: this.config.whatsappUrl, termsUrl: this.config.termsUrl },
      ),
    });
    return true;
  }

  /** Inscripción impaga anulada: aviso al alumno. Sin dinero de por medio. */
  async notifyCourseCancelled(v: {
    students: { name: string; email: string }[];
    generation: string;
  }): Promise<void> {
    for (const student of v.students) {
      await this.mailer.send({
        to: student.email,
        ...courseEnrollmentCancelled(
          { name: student.name, generation: v.generation },
          { whatsappUrl: this.config.whatsappUrl },
        ),
      });
    }
  }

  /**
   * Inscripción PAGADA cancelada, con o sin reembolso. `refundedClp` null = el dueño
   * decidió no devolver (política de /terminos): el correo no habla de dinero. Nunca
   * usa la plantilla de la impaga ("no se hizo ningún cobro"): acá sí hubo cobro.
   */
  async notifyCourseRefunded(v: {
    students: { name: string; email: string }[];
    generation: string;
    refundedClp: number | null;
  }): Promise<void> {
    const refunded = v.refundedClp != null && v.refundedClp > 0 ? formatCLP(v.refundedClp) : null;
    for (const student of v.students) {
      await this.mailer.send({
        to: student.email,
        ...courseEnrollmentRefunded(
          { name: student.name, generation: v.generation, refunded },
          { whatsappUrl: this.config.whatsappUrl },
        ),
      });
    }
  }

  /**
   * Barrido de respaldo: confirma lo pagado que sigue sin `notified_at`. Un fallo en
   * una orden no frena a las demás y se CUENTA: el cron devuelve `failed` para que
   * un proveedor caído no pase por "0 notificadas, todo bien" (incidente 2026-07-10).
   */
  async notifyPending(): Promise<{ notified: number; failed: number }> {
    const ids = await this.repo.pendingPaidOrderIds();
    let notified = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        if (await this.notifyOrder(id)) notified++;
      } catch (e) {
        failed++;
        console.error("[notify:pending]", id, e);
      }
    }
    return { notified, failed };
  }

  /** El evento de calendario de una sesión (mismo uid/summary que los botones de /reserva/estado). */
  /**
   * Evento de calendario de una sesión GUIADA del curso: sin la promesa del PIN (la del de
   * sala) y con el uid de la RESERVA, así mover la sesión actualiza el mismo evento.
   */
  private courseCalendarEvent(reservationId: string, startsAt: string, endsAt: string, n: number, title: string) {
    return {
      start: startsAt,
      end: endsAt,
      summary: `FOTF Studios — Curso DJ · Sesión ${n}`,
      description: `${title}. ${GUIADA}`,
      location: this.config.address,
      uid: `fotf-r-${reservationId}@fotfstudios.cl`,
      url: `${this.config.siteUrl}/cuenta/curso`,
    };
  }

  private courseCtx() {
    return {
      address: this.config.address,
      mapsUrl: this.config.mapsUrl,
      whatsappUrl: this.config.whatsappUrl,
      courseUrl: `${this.config.siteUrl}/cuenta/curso`,
    };
  }

  /**
   * Agenda del curso → a TODOS los alumnos del programa (un dúo son dos), pagado o no
   * (decisión del dueño). `scheduled` va en UN correo con un .ics por sesión; `moved` y
   * `cancelled` son por sesión. Solo correo: no hay plantilla de WhatsApp para el curso.
   */
  async notifyCourseSessions(
    event: "scheduled" | "moved" | "cancelled",
    input: {
      students: { name: string | null; email: string | null }[];
      sessions: { n: number; title: string; instructor: string | null; reservationId: string | null; startsAt: string; endsAt: string | null }[];
      /** Solo `moved`: la hora anterior de la (única) sesión. */
      previous?: { startsAt: string; endsAt: string | null };
    },
  ): Promise<number> {
    if (input.sessions.length === 0) return 0;
    const ctx = this.courseCtx();
    const s0 = input.sessions[0];
    const attachments =
      event === "cancelled"
        ? undefined
        : input.sessions
            .filter((s) => s.reservationId && s.endsAt)
            .map((s) => ({
              filename: `curso-sesion-${s.n}.ics`,
              content: buildIcs(this.courseCalendarEvent(s.reservationId!, s.startsAt, s.endsAt!, s.n, s.title)),
            }));
    let sent = 0;
    for (const st of input.students) {
      if (!st.email) continue;
      const content =
        event === "scheduled"
          ? courseSessionsScheduled(
              {
                name: st.name,
                sessions: input.sessions.map((s) => ({ n: s.n, title: s.title, instructor: s.instructor, when: this.when(s.startsAt, s.endsAt) })),
              },
              ctx,
            )
          : event === "moved"
            ? courseSessionMoved(
                {
                  name: st.name,
                  n: s0.n,
                  title: s0.title,
                  before: input.previous ? this.when(input.previous.startsAt, input.previous.endsAt) : "—",
                  after: this.when(s0.startsAt, s0.endsAt),
                },
                ctx,
              )
            : courseSessionCancelled({ name: st.name, n: s0.n, title: s0.title, when: this.when(s0.startsAt, s0.endsAt) }, ctx);
      await this.mailer.send({ to: st.email, ...content, ...(attachments?.length ? { attachments } : {}) });
      sent++;
    }
    return sent;
  }

  /** Práctica libre agendada o cancelada → al alumno de ese cupo. Solo correo. */
  async notifyPractice(
    event: "booked" | "released",
    input: { name: string | null; email: string | null; reservationId: string; startsAt: string; endsAt: string; hoursLeft: number },
  ): Promise<boolean> {
    if (!input.email) return false;
    const ctx = this.courseCtx();
    const when = this.when(input.startsAt, input.endsAt);
    if (event === "booked") {
      // El evento de sala (con la promesa del PIN) es el correcto: en la práctica entra solo.
      const ev = this.calendarEvent(`r-${input.reservationId}`, input.startsAt, input.endsAt, null);
      await this.mailer.send({
        to: input.email,
        ...practiceBooked({ name: input.name, when, hoursLeft: input.hoursLeft }, ctx),
        attachments: [{ filename: "practica-fotf.ics", content: buildIcs(ev) }],
      });
    } else {
      await this.mailer.send({ to: input.email, ...practiceReleased({ name: input.name, when, hoursLeft: input.hoursLeft }, ctx) });
    }
    return true;
  }

  /**
   * Hora de práctica movida desde el admin (move_practice_reservation): al DUEÑO y al ALUMNO,
   * por correo y por WhatsApp. Best-effort y después del RPC: el contacto y el horario NUEVO
   * salen de la reserva. Primero el dueño y cada envío por separado. `accessLoaded` le dice al
   * dueño si la cerradura se toca (la Yale no tiene ventana horaria: un PIN cargado sigue abriendo).
   */
  async notifyPracticeMoved(input: {
    reservationId: string;
    oldStartsAt: string;
    oldEndsAt: string | null;
    accessLoaded: boolean;
  }): Promise<{ owner: boolean; customer: boolean }> {
    const sent = { owner: false, customer: false };
    const c = await this.repo.getReservationContact(input.reservationId);
    if (!c) return sent;
    const before = this.when(input.oldStartsAt, input.oldEndsAt);
    const after = this.when(c.startsAt, c.endsAt);

    if (this.config.ownerEmail) {
      try {
        await this.mailer.send({
          to: this.config.ownerEmail,
          ...ownerPracticeMoved({
            name: c.name,
            email: c.email,
            phone: c.phone,
            before,
            after,
            accessLoaded: input.accessLoaded,
            adminUrl: `${this.config.siteUrl}/admin/reservas/${input.reservationId}`,
          }),
        });
        sent.owner = true;
      } catch (e) {
        console.error("[notify:practice-moved:owner]", input.reservationId, e);
      }
    }
    if (c.email) {
      // Mismo evento (y uid) que practiceBooked: el calendario lo ACTUALIZA.
      const ev = this.calendarEvent(`r-${input.reservationId}`, c.startsAt, c.endsAt, null);
      try {
        await this.mailer.send({
          to: c.email,
          ...practiceMoved({ name: c.name, before, after }, this.courseCtx()),
          attachments: [{ filename: "practica-fotf.ics", content: buildIcs(ev) }],
        });
        sent.customer = true;
      } catch (e) {
        console.error("[notify:practice-moved:customer]", input.reservationId, e);
      }
    }
    // Una práctica puede moverse varias veces: la clave lleva el horario nuevo.
    await this.waOwner(
      "owner_practice_moved",
      {
        cliente: c.name ?? c.email ?? "",
        antes: before,
        ahora: after,
        pin: input.accessLoaded ? "sigue cargado, no hay que tocar la cerradura" : "falta cargarlo en la cerradura",
      },
      {
        dedupeKey: `owner_practice_moved:${input.reservationId}:${c.startsAt}`,
        expiresAt: new Date(Date.now() + OWNER_ALERT_TTL_MS),
        buttonSuffix: input.reservationId,
        entity: { kind: "reservation", id: input.reservationId },
      },
    );
    await this.waCustomer(c, "practice_moved", { nombre: c.name ?? "", antes: before, ahora: after }, {
      dedupeKey: `practice_moved:${input.reservationId}:${c.startsAt}`,
      expiresAt: c.startsAt,
      entity: { kind: "reservation", id: input.reservationId },
    });
    return sent;
  }

  /**
   * Evento de la prueba del curso: mismo uid que el de la sala (`fotf-${orderId}`), pero con
   * su título y guiada — sin la promesa del código de acceso. Lo usan la confirmación y el
   * aviso de prueba movida, así el calendario actualiza siempre el mismo evento.
   */
  private trialCalendarEvent(orderId: string, startsAt: string, endsAt: string) {
    return { ...this.calendarEvent(orderId, startsAt, endsAt), summary: "FOTF Studios — Prueba del Curso de DJ", description: GUIADA };
  }

  private calendarEvent(key: string, startsAt: string, endsAt: string, orderId: string | null = key) {
    return {
      start: startsAt,
      end: endsAt,
      summary: "FOTF Studios — Sala",
      description: "Tu código de acceso te llega por email 10 minutos antes de tu sesión.",
      location: this.config.address,
      uid: `fotf-${key}@fotfstudios.cl`,
      ...(orderId ? { url: `${this.config.siteUrl}/reserva/estado?b=${orderId}` } : {}),
    };
  }

  /**
   * Encola un aviso por WhatsApp al CLIENTE si aceptó y tiene celular chileno (waRecipient es la
   * única puerta). Nunca lanza: el WhatsApp es un canal adicional y no puede voltear el correo ni
   * el reclamo que ya se hizo.
   */
  private async waCustomer<E extends WaEvent>(
    c: { phone?: string | null; whatsappOptIn?: boolean | null },
    event: E,
    params: WaParams<E>,
    opts: WaEnqueue,
  ): Promise<void> {
    const to = waRecipient({ phone: c.phone, whatsappOptIn: c.whatsappOptIn });
    if (to) await this.enqueueWa(to, event, params, opts);
  }

  /** Alerta por WhatsApp al dueño (`OWNER_WHATSAPP`), sin consentimiento de por medio. Nunca lanza. */
  private async waOwner<E extends WaEvent>(event: E, params: WaParams<E>, opts: WaEnqueue): Promise<void> {
    if (this.config.ownerWhatsapp) await this.enqueueWa(this.config.ownerWhatsapp, event, params, opts);
  }

  private async enqueueWa<E extends WaEvent>(to: string, event: E, params: WaParams<E>, opts: WaEnqueue): Promise<void> {
    if (!this.outbox) return;
    const expiresAt = new Date(opts.expiresAt);
    if (!(expiresAt.getTime() > Date.now())) return;
    try {
      await this.outbox.enqueue({
        event,
        to,
        template: waTemplate(event, params, opts.buttonSuffix),
        dedupeKey: opts.dedupeKey,
        expiresAt: expiresAt.toISOString(),
        ...(opts.entity ? { entity: opts.entity } : {}),
      });
    } catch (e) {
      console.error("[whatsapp:enqueue]", event, opts.dedupeKey, e);
    }
  }

  /** Horario en el formato único de los correos; "—" si la orden no tiene reserva. */
  private when(startsAt: string | null, endsAt: string | null): string {
    return startsAt ? formatSessionWhen(startsAt, this.config.tz, { endsAt }) : "—";
  }
}
