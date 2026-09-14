import { DateTime } from "luxon";
import { formatSessionWhen } from "./format-when";
import { buildIcs, googleCalendarUrl } from "@/src/domain/calendar/ics";
import type { Mailer } from "@/src/application/ports/mailer";
import type { NotificationRepository } from "@/src/application/ports/notifications";
import { formatCLP } from "@/src/domain/money/money";
import type { ApplicationInput } from "@/src/domain/applications/application";
import type { CourseLeadInput } from "@/src/domain/course/lead";
import {
  applicantConfirmation,
  customerAccessCode,
  customerCancellation,
  customerConfirmation,
  customerCourtesyConfirmation,
  customerReschedule,
  customerRescheduleFailed,
  customerReminder,
  customerCourtesyCancelled,
  customerHoldExpired,
  customerPaymentNoSlot,
  ownerNeedsReview,
  ownerNewApplication,
  ownerNotification,
  courseLeadConfirmation,
  ownerNewCourseLead,
  courseEnrollmentCancelled,
  courseEnrollmentRefunded,
  courseEnrollmentPaid,
  ownerCoursePaid,
  bookingPaymentPending,
  courseEnrollmentPending,
} from "./templates";

export interface NotificationConfig {
  ownerEmail: string;
  /** Origen público del sitio (https://www.fotfstudios.cl): links a la reserva y a la cuenta. */
  siteUrl: string;
  tz: string;
  address: string;
  whatsappUrl: string;
  termsUrl: string;
  privacyUrl: string;
}

/** Envía emails de confirmación (cliente + dueño) al pagarse una reserva. */
export class NotificationService {
  constructor(
    private readonly mailer: Mailer,
    private readonly repo: NotificationRepository,
    private readonly config: NotificationConfig,
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
      // adjunto (Apple Mail / Gmail lo ofrecen como evento), más la cuenta.
      const links = {
        statusUrl: `${this.config.siteUrl}/reserva/estado?b=${orderId}`,
        calendarUrl: o.startsAt && o.endsAt ? googleCalendarUrl(this.calendarEvent(orderId, o.startsAt, o.endsAt)) : this.config.siteUrl,
        accountUrl: `${this.config.siteUrl}/cuenta`,
      };
      const attachments =
        o.startsAt && o.endsAt
          ? [{ filename: "reserva-fotf.ics", content: buildIcs(this.calendarEvent(orderId, o.startsAt, o.endsAt)) }]
          : undefined;
      try {
        await this.mailer.send({
          to: o.email,
          ...customerConfirmation(view, { address: this.config.address, whatsappUrl: this.config.whatsappUrl, links }),
          ...(attachments ? { attachments } : {}),
        });
      } catch (e) {
        await this.repo.releaseNotified(orderId).catch((e2) => console.error("[notify:release]", orderId, e2));
        throw e;
      }
    }
    if (this.config.ownerEmail) {
      await this.mailer
        .send({ to: this.config.ownerEmail, ...ownerNotification({ ...view, email: o.email }) })
        .catch((e) => console.error("[notify:owner]", orderId, e));
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
    startsAt: string;
    endsAt?: string | null;
    addonNames: string[];
  }): Promise<boolean> {
    if (!input.email) return false;
    const when = this.when(input.startsAt, input.endsAt ?? null);
    await this.mailer.send({
      to: input.email,
      ...customerCourtesyConfirmation(
        { name: input.name, when, addonNames: input.addonNames },
        {
          address: this.config.address,
          whatsappUrl: this.config.whatsappUrl,
          termsUrl: this.config.termsUrl,
          privacyUrl: this.config.privacyUrl,
        },
      ),
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
  }): Promise<boolean> {
    if (!input.email) return false;
    const when = this.when(input.startsAt, input.endsAt ?? null);
    await this.mailer.send({
      to: input.email,
      ...customerAccessCode(
        { name: input.name, when, code: input.code },
        { address: this.config.address, whatsappUrl: this.config.whatsappUrl },
      ),
    });
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
  }): Promise<boolean> {
    if (!input.email) return false;
    const statusUrl = input.orderId
      ? `${this.config.siteUrl}/reserva/estado?b=${input.orderId}`
      : `${this.config.siteUrl}/cuenta`;
    await this.mailer.send({
      to: input.email,
      ...customerReminder(
        { name: input.name, when: this.when(input.startsAt, input.endsAt) },
        { address: this.config.address, whatsappUrl: this.config.whatsappUrl, statusUrl },
      ),
    });
    return true;
  }

  /**
   * Aviso al CLIENTE de que su reserva fue cancelada (con o sin reembolso).
   * Best-effort y sin guard de `notified_at` (esa columna es de la confirmación):
   * se dispara solo en los dos momentos únicos — la acción del admin o un
   * reembolso externo FRESCO vía webhook (el loopback admin dedupea por inbox).
   */
  async notifyCancellation(
    orderId: string,
    /** `restoredPoints`: orden 100% puntos — se repusieron puntos, no hubo plata. */
    opts: { refundAmount: number | null; restoredPoints?: number | null },
  ): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
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
  async notifyReschedule(orderId: string, opts: { refundAmount: number }): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o?.email) return false;
    const when = this.when(o.startsAt, o.endsAt);
    await this.mailer.send({
      to: o.email,
      ...customerReschedule(
        { name: o.name, when, refunded: opts.refundAmount > 0 ? formatCLP(opts.refundAmount) : null },
        { whatsappUrl: this.config.whatsappUrl, address: this.config.address },
      ),
    });
    return true;
  }

  /**
   * Aviso al CLIENTE cuando el cobro de un reagendamiento se pagó pero el slot ya
   * estaba tomado: la reserva NO se movió (sigue en su horario original) y se le
   * devolvió el excedente. Best-effort.
   */
  async notifyRescheduleFailed(orderId: string, opts: { refundAmount: number }): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o?.email) return false;
    const when = this.when(o.startsAt, o.endsAt);
    await this.mailer.send({
      to: o.email,
      ...customerRescheduleFailed(
        { name: o.name, when, refunded: formatCLP(opts.refundAmount) },
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
  async notifyCourseLead(
    lead: CourseLeadInput,
    gen: { code: string; seatsLeft: number } | null,
  ): Promise<void> {
    if (this.config.ownerEmail) {
      await this.mailer.send({ to: this.config.ownerEmail, ...ownerNewCourseLead(lead, gen) });
    }
    await this.mailer.send({
      to: lead.email,
      ...courseLeadConfirmation({ name: lead.name }, { whatsappUrl: this.config.whatsappUrl }),
    });
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
    seatsLeft: number;
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
          { address: this.config.address, whatsappUrl: this.config.whatsappUrl },
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
          seatsLeft: v.seatsLeft,
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
  private calendarEvent(orderId: string, startsAt: string, endsAt: string) {
    return {
      start: startsAt,
      end: endsAt,
      summary: "FOTF Studios — Sala",
      description: "Tu código de acceso te llega por email 10 minutos antes de tu sesión.",
      location: this.config.address,
      uid: `fotf-${orderId}@fotfstudios.cl`,
      url: `${this.config.siteUrl}/reserva/estado?b=${orderId}`,
    };
  }

  /** Horario en el formato único de los correos; "—" si la orden no tiene reserva. */
  private when(startsAt: string | null, endsAt: string | null): string {
    return startsAt ? formatSessionWhen(startsAt, this.config.tz, { endsAt }) : "—";
  }
}
