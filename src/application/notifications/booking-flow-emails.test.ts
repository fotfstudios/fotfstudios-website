import { describe, expect, it } from "vitest";
import { TRANSFER } from "@/lib/site";
import type { EmailContent } from "@/src/application/ports/mailer";
import {
  authEmailChange,
  authLoginCode,
  authRecovery,
  authVerificationCode,
  bookingHeldPending,
  bookingPaymentPending,
  bookingPaymentReminder,
  customerAccessCode,
  customerCancellation,
  customerConfirmation,
  customerCourtesyConfirmation,
  customerHoldExpired,
  customerPaymentNoSlot,
  customerReminder,
  customerReschedule,
  customerRescheduleFailed,
  customerReschedulePaymentLink,
  ownerDuplicatePayment,
  ownerNeedsReview,
  ownerNotification,
  ownerTransferDeclared,
  trialConfirmation,
  customerCourtesyCancelled,
  newsletterWelcome,
} from "./templates";

/**
 * Los correos del flujo público de reserva (y sus hermanos de forma) usan el design system
 * de la superficie de reservas — CLAUDE.md → Brand guardrails. El resto sigue en el shell
 * clásico hasta migrarlo; este test fija la frontera en las dos direcciones.
 */
const wa = "https://wa.me/56962803298";
const MAPS = "https://www.google.com/maps/search/?api=1&query=Los+Chercanes+78a";
const place = { address: "Los Chercanes 78a, Viña del Mar", mapsUrl: MAPS };
const links = { statusUrl: "https://www.fotfstudios.cl/reserva/estado", calendarUrl: "https://calendar.google.com/x", accountUrl: "https://www.fotfstudios.cl/cuenta" };
const parts = { date: "Viernes 16 de octubre", time: "18:00–20:00", duration: "2 h" };
const when = "viernes 16 de octubre, 18:00–20:00 h";
const view = { name: "Ana", when, parts, total: "$24.000", lines: [{ description: "Sala de ensayo DJ · 2 h", amount: "$24.000" }] };
const pending = { termsUrl: "https://www.fotfstudios.cl/terminos", whatsappUrl: wa, transfer: TRANSFER, ...place };

const IN_SCOPE: [string, () => EmailContent][] = [
  ["authLoginCode", () => authLoginCode({ token: "48213907", confirmUrl: "https://x/confirm" })],
  ["authRecovery", () => authRecovery({ token: "48213907", confirmUrl: "https://x/confirm" })],
  ["authEmailChange", () => authEmailChange({ token: "48213907", confirmUrl: "https://x/confirm" })],
  ["authVerificationCode", () => authVerificationCode({ token: "48213907" })],
  ["bookingHeldPending", () => bookingHeldPending({ name: "Ana", when, parts, total: "$24.000", payBy: "viernes 16 de octubre, 15:40 h" }, pending)],
  ["bookingPaymentReminder", () => bookingPaymentReminder({ name: "Ana", when, parts, total: "$24.000", payBy: "viernes 16 de octubre, 15:40 h" }, pending)],
  ["bookingPaymentPending", () => bookingPaymentPending({ name: "Ana", when, parts, total: "$24.000", initPoint: "https://mp/x", expiresInHours: 72 }, pending)],
  ["ownerTransferDeclared", () => ownerTransferDeclared({ name: "Ana", email: "ana@e.cl", when, total: "$24.000", holdUntil: "15:40 h", adminUrl: "https://x/admin/reservas/r1" })],
  ["customerConfirmation", () => customerConfirmation(view, { ...place, whatsappUrl: wa, links })],
  ["trialConfirmation", () => trialConfirmation({ ...view, creditDays: 30 }, { ...place, whatsappUrl: wa, links })],
  ["ownerNotification", () => ownerNotification({ ...view, email: "ana@e.cl", method: "Mercado Pago", adminUrl: "https://x/admin/reservas/r1" })],
  ["customerPaymentNoSlot", () => customerPaymentNoSlot({ name: "Ana", when, total: "$24.000" }, { whatsappUrl: wa })],
  ["ownerNeedsReview", () => ownerNeedsReview({ when, total: "$24.000", email: "ana@e.cl", paymentId: "128734551" })],
  ["ownerDuplicatePayment", () => ownerDuplicatePayment({ when, email: "ana@e.cl", paymentId: "128734551", amount: "$24.000", storedMethod: "Transferencia" })],
  ["customerHoldExpired", () => customerHoldExpired({ name: "Ana", when, parts }, { whatsappUrl: wa, bookUrl: "https://x/reservar" })],
  ["customerReminder", () => customerReminder({ name: "Ana", when, parts }, { ...place, whatsappUrl: wa, statusUrl: links.statusUrl })],
  ["customerAccessCode", () => customerAccessCode({ name: "Ana", when, parts, code: "4821#" }, { ...place, whatsappUrl: wa })],
  ["customerReschedulePaymentLink", () => customerReschedulePaymentLink({ name: "Ana", oldWhen: "jueves 15 de octubre, 19:00–21:00 h", newWhen: when, amount: "$4.000", initPoint: "https://mp/x", expiresInHours: 2 }, { whatsappUrl: wa, termsUrl: "https://x/t" })],
  ["customerReschedule", () => customerReschedule({ name: "Ana", when, parts, refunded: null, refundedOffline: false }, { ...place, whatsappUrl: wa, calendarUrl: links.calendarUrl })],
  ["customerRescheduleFailed", () => customerRescheduleFailed({ name: "Ana", when, refunded: "$4.000", kept: true }, { whatsappUrl: wa })],
  ["customerCancellation", () => customerCancellation({ name: "Ana", when, parts, refunded: "$24.000" }, { whatsappUrl: wa, bookUrl: "https://x/reservar" })],
];

describe("correos del flujo de reserva — design system", () => {
  it.each(IN_SCOPE)("%s usa el shell del design system (fuentes, logo PNG, sin Arial de cuerpo)", (name, make) => {
    const m = make();
    expect(m.template).toBe(name);
    expect(m.html).toContain("'Space Grotesk',Arial");
    expect(m.html).toContain("@font-face{font-family:'Anton'");
    expect(m.html).toContain('src="https://www.fotfstudios.cl/email/fotf-mini-cream.png"');
    expect(m.html).not.toContain("font-family:Arial,Helvetica,sans-serif;font-size:16px");
    expect(m.html).not.toContain("FOTF STUDIOS</p>");
  });

  it.each(IN_SCOPE)("%s: imágenes y fuentes absolutas https, nunca SVG (Gmail no lo renderiza)", (_name, make) => {
    const html = make().html;
    for (const [, src] of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      expect(src).toMatch(/^https:\/\//);
      expect(src).not.toMatch(/\.svg$/i);
    }
    for (const [, url] of html.matchAll(/url\(([^)]+)\)/g)) expect(url).toMatch(/^https:\/\//);
  });

  it.each(IN_SCOPE)("%s: un solo CTA naranja como máximo", (_name, make) => {
    const ctas = make().html.match(/<td align="center" bgcolor="#ff4d1d"/gi) ?? [];
    expect(ctas.length).toBeLessThanOrEqual(1);
  });

  it.each(IN_SCOPE)("%s: nunca ofrece efectivo", (_name, make) => {
    const m = make();
    for (const body of [m.subject, m.html, m.text]) expect(body).not.toMatch(/efectivo/i);
  });

  it("el PIN de la puerta nunca va en el asunto (se ve en la notificación del bloqueo)", () => {
    const m = customerAccessCode({ name: "Ana", when, parts, code: "4821#" }, { ...place, whatsappUrl: wa });
    expect(m.subject).not.toContain("4821");
    expect(m.html).toContain("4821#");
    expect(m.text).toContain("4821#");
  });

  it("los avisos al dueño se marcan internos y no llevan el pie del cliente", () => {
    for (const make of [IN_SCOPE[7][1], IN_SCOPE[10][1], IN_SCOPE[12][1], IN_SCOPE[13][1]]) {
      const html = make().html;
      expect(html).toContain("AVISO INTERNO · SOLO EQUIPO FOTF");
      expect(html).not.toContain("Recibes este correo porque reservaste");
    }
  });

  it("el pie del cliente trae dirección, WhatsApp e Instagram cuando el servicio los pasa", () => {
    const m = customerConfirmation(view, { ...place, whatsappUrl: wa, links, instagramUrl: "https://instagram.com/fotfstudios" });
    expect(m.html).toContain("Recibes este correo porque reservaste en fotfstudios.cl.");
    expect(m.html).toContain('href="https://instagram.com/fotfstudios"');
    expect(m.html).toContain(`href="${MAPS.replace(/&/g, "&amp;")}"`);
  });

  it("la ficha parte el horario cuando hay `parts`; sin ellas, una sola fila con `when`", () => {
    const con = customerReminder({ name: "Ana", when, parts }, { ...place, whatsappUrl: wa, statusUrl: links.statusUrl }).html;
    expect(con).toContain("Viernes 16 de octubre");
    expect(con).toMatch(/>Fecha</);
    const sin = customerReminder({ name: "Ana", when }, { ...place, whatsappUrl: wa, statusUrl: links.statusUrl }).html;
    expect(sin).toMatch(/>Cuándo</);
    expect(sin).not.toMatch(/>Fecha</);
  });

  it("escapa nombre, código y email en las piezas nuevas (anti-XSS)", () => {
    const x = "<img src=x onerror=alert(1)>";
    expect(customerAccessCode({ name: x, when, parts, code: x }, { ...place, whatsappUrl: wa }).html).not.toContain(x);
    expect(ownerTransferDeclared({ name: x, email: x, when, total: "$1", holdUntil: "x", adminUrl: "https://x" }).html).not.toContain(x);
    expect(ownerNotification({ ...view, name: x, email: x, lines: [{ description: x, amount: "$1" }] }).html).not.toContain(x);
  });
});

describe("fuera del alcance: siguen en el shell clásico hasta migrarlos", () => {
  it.each([
    ["customerCourtesyConfirmation", () => customerCourtesyConfirmation({ name: "Ana", when, addonNames: [] }, { ...place, whatsappUrl: wa, termsUrl: "t", privacyUrl: "p", links: { calendarUrl: "c", accountUrl: "a" } })],
    ["customerCourtesyCancelled", () => customerCourtesyCancelled({ name: "Ana", when }, { whatsappUrl: wa })],
    ["newsletterWelcome", () => newsletterWelcome({ unsubscribeUrl: "u", blogUrl: "b" })],
  ] as [string, () => EmailContent][])("%s", (_name, make) => {
    const html = make().html;
    expect(html).toContain("FOTF STUDIOS</p>");
    expect(html).not.toContain("'Space Grotesk'");
  });
});

describe("N° de reserva (orderShort) en los correos con pedido", () => {
  const ref = "32c68e1f";
  const withRef: [string, () => EmailContent][] = [
    ["customerConfirmation", () => customerConfirmation({ ...view, ref }, { ...place, whatsappUrl: wa, links })],
    ["trialConfirmation", () => trialConfirmation({ ...view, ref, creditDays: 30 }, { ...place, whatsappUrl: wa, links })],
    ["customerCancellation", () => customerCancellation({ name: "Ana", when, parts, refunded: "$1", ref }, { whatsappUrl: wa })],
    ["customerReschedule", () => customerReschedule({ name: "Ana", when, parts, refunded: null, refundedOffline: false, ref }, { ...place, whatsappUrl: wa, calendarUrl: "c" })],
    ["bookingHeldPending", () => bookingHeldPending({ name: "Ana", when, parts, total: "$1", payBy: "x", ref }, pending)],
    ["bookingPaymentReminder", () => bookingPaymentReminder({ name: "Ana", when, parts, total: "$1", payBy: "x", ref }, pending)],
    ["bookingPaymentPending", () => bookingPaymentPending({ name: "Ana", when, parts, total: "$1", initPoint: "https://mp/x", expiresInHours: 72, ref }, pending)],
  ];

  it.each(withRef)("%s lo muestra en el eyebrow y en el texto, nunca en el asunto", (_n, make) => {
    const m = make();
    expect(m.html).toContain(`N° ${ref}`);
    expect(m.text).toContain(`N° de reserva: ${ref}`);
    expect(m.subject).not.toContain(ref);
  });

  it("al cliente dice 'Reserva N°'; al dueño, 'Para el estudio · N°'", () => {
    expect(customerConfirmation({ ...view, ref }, { ...place, whatsappUrl: wa, links }).html).toContain(`Reserva N° ${ref}`);
    expect(ownerNotification({ ...view, ref, email: "a@e.cl" }).html).toContain(`Para el estudio · N° ${ref}`);
  });

  it("sin ref el eyebrow queda como antes", () => {
    const m = customerConfirmation(view, { ...place, whatsappUrl: wa, links });
    expect(m.html).toContain(">Tu reserva</p>");
    expect(m.text).not.toContain("N° de reserva");
  });
});

describe("reembolso según cómo se pagó", () => {
  const base = { name: "Ana", when, parts, refunded: "$7.990" };
  it("pagado por transferencia: 'te devolvemos por transferencia', fila Devolución (pendiente), sin tarjeta ni efectivo", () => {
    const m = customerCancellation({ ...base, refundOffline: true }, { whatsappUrl: wa });
    expect(m.html).toMatch(/Te devolvemos <strong[^>]*>\$7\.990<\/strong> por transferencia; te escribimos para coordinarla/);
    expect(m.html).toContain(">Devolución<");
    expect(m.text).toContain("Te devolvemos $7.990 por transferencia");
    for (const body of [m.html, m.text]) {
      expect(body).not.toMatch(/tarjeta|efectivo/i);
      expect(body).not.toContain("medio de pago original");
    }
  });

  it("pagado con Mercado Pago: el copy de siempre (medio de pago original)", () => {
    const m = customerCancellation({ ...base, refundOffline: false }, { whatsappUrl: wa });
    expect(m.html).toContain("Te reembolsamos al medio de pago original");
    expect(m.html).toContain(">Reembolso<");
  });

  it("Beatcoins repuestos ganan a refundOffline (no hubo plata)", () => {
    const m = customerCancellation({ ...base, refunded: null, restoredPoints: 7990, refundOffline: true }, { whatsappUrl: wa });
    expect(m.html).toContain("Te repusimos");
    expect(m.html).not.toContain("por transferencia");
  });
});
