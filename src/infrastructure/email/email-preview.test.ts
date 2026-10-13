/**
 * Vista previa de los correos en el Mailpit LOCAL (http://127.0.0.1:54424). No es un test:
 * se salta salvo que se pida — CI nunca lo corre.
 *
 *   npm run db:start                                  # Mailpit viene con el stack local
 *   EMAIL_PREVIEW=1 npx vitest run email-preview
 *
 * Cada correo pasa por el NotificationService REAL (vista, ficha, pie, links, .ics) con un
 * repositorio de mentira: solo la lectura de la DB es inventada. Así se ven los casos
 * raros (pago duplicado, hora liberada…) sin Mercado Pago, cron ni esperar 72 h.
 * Al migrar o agregar una plantilla, súmala acá.
 */
import { it } from "vitest";
import { SITE, TRANSFER } from "@/lib/site";
import type { NotificationRepository } from "@/src/application/ports/notifications";
import { SmtpMailer } from "./smtp-mailer";
import { NotificationService } from "@/src/application/notifications/notification-service";
import { authEmailChange, authLoginCode, authRecovery, authVerificationCode } from "@/src/application/notifications/templates";

const SMTP = process.env.EMAIL_PREVIEW_SMTP ?? "smtp://127.0.0.1:54325";
const CUSTOMER = "ana.rojas@ejemplo.cl";
const START = "2026-10-16T21:00:00Z"; // viernes 16 oct, 18:00 Santiago
const END = "2026-10-16T23:00:00Z";
const BEFORE = { startsAt: "2026-10-15T22:00:00Z", endsAt: "2026-10-16T00:00:00Z" }; // jueves 15, 19:00–21:00
const ORDER_ID = "32c68e1f-0000-4000-8000-000000000000";

const base = {
  id: ORDER_ID, kind: "booking", email: CUSTOMER, name: "Ana Rojas", amount: 24000, currency: "CLP",
  startsAt: START, endsAt: END, notifiedAt: null, paymentMethod: "mercadopago", reservationId: "r-demo",
  lines: [{ description: "Sala de ensayo DJ · 2 h", subtotal: 24000 }],
};

it.skipIf(!process.env.EMAIL_PREVIEW)("manda los correos al Mailpit local", { timeout: 60_000 }, async () => {
  const mailer = new SmtpMailer(SMTP, "FOTF Studios <reservas@fotfstudios.cl>");
  let current: Record<string, unknown> = base;
  const repo = {
    getOrderForEmail: async () => ({ ...current, notifiedAt: null }),
    getReservationContact: async () => ({ reservationId: "r-demo", name: "Ana Rojas", email: CUSTOMER, phone: "+56912345678", whatsappOptIn: false, startsAt: START, endsAt: END }),
    pendingPaidOrderIds: async () => [],
    markNotified: async () => true,
    releaseNotified: async () => {},
  } as unknown as NotificationRepository;
  const svc = new NotificationService(mailer, repo, {
    ownerEmail: "dueno@fotfstudios.cl",
    siteUrl: "http://localhost:3000",
    tz: "America/Santiago",
    address: SITE.address,
    mapsUrl: SITE.mapsUrl,
    whatsappUrl: `https://wa.me/${SITE.whatsapp}`,
    instagramUrl: SITE.instagramUrl,
    termsUrl: "https://www.fotfstudios.cl/terminos",
    privacyUrl: "https://www.fotfstudios.cl/privacidad",
    reviewUrl: "https://search.google.com/local/writereview?placeid=demo",
    transfer: TRANSFER,
  });
  const as = (patch: Record<string, unknown>) => (current = { ...base, ...patch });
  const auth = (m: ReturnType<typeof authLoginCode>) => mailer.send({ to: CUSTOMER, ...m });
  const confirm = "http://localhost:3000/auth/confirm";
  const clock = { clockStart: "2026-10-14T13:00:00Z", now: new Date("2026-10-16T13:00:00Z") };

  // Acceso
  await auth(authLoginCode({ token: "48213907", confirmUrl: confirm }));
  await auth(authRecovery({ token: "48213907", confirmUrl: confirm }));
  await auth(authEmailChange({ token: "48213907", confirmUrl: confirm }));
  await auth(authVerificationCode({ token: "48213907" }));
  // Transferencia (checkout público) y pendientes del admin
  as({ paymentMethod: "transferencia" });
  await svc.notifyTransferHeld(ORDER_ID, new Date("2026-10-16T18:40:00Z"));
  await svc.notifyTransferDeclared(ORDER_ID, "2026-10-16T18:40:00Z");
  await svc.notifyBookingHeld(ORDER_ID, clock);
  await svc.notifyPaymentReminder(ORDER_ID, clock);
  await svc.notifyBookingPaymentLink(ORDER_ID, { initPoint: "https://www.mercadopago.cl/checkout/demo", expiresInHours: 72 });
  // Pago
  await svc.notifyOrder(ORDER_ID);
  as({});
  await svc.notifyPaymentNeedsReview(ORDER_ID, "128734551");
  await svc.notifyDuplicatePayment(ORDER_ID, "128734551", 24000);
  // Hold vencido
  await svc.notifyHoldExpired(ORDER_ID);
  // Antes de la sesión
  await svc.notifyReminder({ email: CUSTOMER, name: "Ana Rojas", orderId: ORDER_ID, startsAt: START, endsAt: END });
  await svc.notifyAccessCode({ email: CUSTOMER, name: "Ana Rojas", startsAt: START, endsAt: END, code: "4821#" });
  // Cambios
  as(BEFORE);
  await svc.notifyReschedulePaymentLink(ORDER_ID, { newStartsAt: START, newEndsAt: END, amount: 4000, initPoint: "https://www.mercadopago.cl/checkout/demo", expiresInHours: 2 });
  as({});
  await svc.notifyReschedule(ORDER_ID, { refundAmount: 0 });
  await svc.notifyReschedule(ORDER_ID, { refundAmount: 4000, offline: true });
  as(BEFORE);
  await svc.notifyRescheduleFailed(ORDER_ID, { refundAmount: 4000, kept: true });
  await svc.notifyRescheduleFailed(ORDER_ID, { refundAmount: 4000, kept: false });
  as({});
  await svc.notifyCancellation(ORDER_ID, { refundAmount: 24000 });
  as({ paymentMethod: "transferencia" });
  await svc.notifyCancellation(ORDER_ID, { refundAmount: 24000 });
  as({ paymentMethod: "puntos" });
  await svc.notifyCancellation(ORDER_ID, { refundAmount: null, restoredPoints: 24000 });
  // Prueba del curso
  as({ kind: "trial", amount: 15000, endsAt: "2026-10-16T22:00:00Z", lines: [{ description: "Prueba Curso de DJ · 1 h", subtotal: 15000 }] });
  await svc.notifyOrder(ORDER_ID);
  await svc.notifyTrialRescheduled({ orderId: ORDER_ID, reservationId: "r-demo", oldStartsAt: "2026-10-14T21:00:00Z", oldEndsAt: "2026-10-14T22:00:00Z" });
  await svc.notifyTrialReminder({ email: CUSTOMER, name: "Ana Rojas", startsAt: START, endsAt: "2026-10-16T22:00:00Z" });
  await svc.notifyTrialCredit("followup", { email: CUSTOMER, name: "Ana Rojas", amount: 15000, expiresAt: "2026-11-13T12:00:00Z" });
  await svc.notifyTrialCredit("expiring", { email: CUSTOMER, name: "Ana Rojas", amount: 15000, expiresAt: "2026-11-13T12:00:00Z" });
  // Cortesías
  await svc.notifyCourtesy({ email: CUSTOMER, name: "Ana Rojas", reservationId: "r-demo", startsAt: START, endsAt: END, addonNames: ["Grabación de audio"] });
  await svc.notifyCourtesyRescheduled({ email: CUSTOMER, name: "Ana Rojas", reservationId: "r-demo", oldStartsAt: BEFORE.startsAt, startsAt: START, endsAt: END });
  await svc.notifyCourtesyCancelled({ email: CUSTOMER, name: "Ana Rojas", startsAt: START, endsAt: END });
  // Curso: agenda, recordatorio y práctica libre
  const students = [{ name: "Ana Rojas", email: CUSTOMER }];
  const s = (n: number, title: string, day: number) => ({ n, title, instructor: n === 1 ? "Benja" : null, reservationId: `r-s${n}`, startsAt: `2026-10-${day}T21:00:00Z`, endsAt: `2026-10-${day}T23:00:00Z` });
  await svc.notifyCourseSessions("scheduled", { students, sessions: [s(1, "Fundamentos", 16), s(2, "Mezcla y transiciones", 23), s(3, "Armar un set", 30)] });
  await svc.notifyCourseSessions("moved", { students, sessions: [s(2, "Mezcla y transiciones", 23)], previous: { startsAt: "2026-10-22T21:00:00Z", endsAt: "2026-10-22T23:00:00Z" } });
  await svc.notifyCourseSessions("cancelled", { students, sessions: [s(3, "Armar un set", 30)] });
  await svc.notifyCourseSessionReminder({ email: CUSTOMER, name: "Ana Rojas", startsAt: START, endsAt: END, n: 1, title: "Fundamentos", instructor: "Benja" });
  await svc.notifyPractice("booked", { name: "Ana Rojas", email: CUSTOMER, reservationId: "r-demo", startsAt: START, endsAt: END, hoursLeft: 3 });
  await svc.notifyPracticeMoved({ reservationId: "r-demo", oldStartsAt: BEFORE.startsAt, oldEndsAt: BEFORE.endsAt, accessLoaded: false });
  await svc.notifyPractice("released", { name: "Ana Rojas", email: CUSTOMER, reservationId: "r-demo", startsAt: START, endsAt: END, hoursLeft: 4 });
  // Inscripción del curso: solicitud → link de pago → pagada → anulada / reembolsada; reseña
  const alumna = [{ name: "Ana Rojas", email: CUSTOMER }];
  await svc.notifyCourseLead({ name: "Ana Rojas", email: CUSTOMER, phone: "+56912345678", plan: "individual", experience: "controlador", availability: "Tardes de semana", message: "Tengo un controlador y quiero pasar a equipos de club." });
  await svc.notifyCoursePaymentLink({ name: "Ana Rojas", email: CUSTOMER, generation: "P0001", totalClp: 249990, initPoint: "https://www.mercadopago.cl/checkout/demo", expiresInHours: 72 });
  await svc.notifyCoursePaid({ students: alumna, generation: "P0001", totalClp: 249990, method: "Transferencia", sessions: [] });
  await svc.notifyCourseCancelled({ students: alumna, generation: "P0001" });
  await svc.notifyCourseRefunded({ students: alumna, generation: "P0001", refundedClp: 249990 });
  await svc.notifyCourseRefunded({ students: alumna, generation: "P0001", refundedClp: 249990, refundOffline: true });
  await svc.notifyReviewRequest({ email: CUSTOMER, name: "Ana Rojas" });
});
