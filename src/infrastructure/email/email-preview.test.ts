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
});
