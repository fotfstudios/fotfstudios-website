import type { EmailContent } from "@/src/application/ports/mailer";
import { SESSION_FORMAT_LABELS, type SessionFormat } from "@/src/domain/applications/application";
import { EXPERIENCE_LABELS, LEAD_PLAN_LABELS } from "@/src/domain/course/course";
import type { CourseLeadInput } from "@/src/domain/course/lead";
import { EMAIL as T } from "./email-tokens";

export interface BookingView {
  name: string | null;
  when: string;
  total: string;
  lines: { description: string; amount: string }[];
}

/** Escapa texto para incrustar en HTML (datos del cliente/catálogo). */
const esc = (s: string | null | undefined): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const rows = (lines: { description: string; amount: string }[]) =>
  lines
    .map(
      (l) =>
        `<tr><td style="padding:4px 0;color:${T.boneDim}">${esc(l.description)}</td><td style="padding:4px 0;text-align:right;color:${T.bone}">${esc(l.amount)}</td></tr>`,
    )
    .join("");

/**
 * Envoltorio de todos los correos. Documento completo, no un <div> suelto:
 * - `lang="es"` + `color-scheme: dark` declarados: Gmail/Outlook con dark mode no
 *   invierten un correo que ya es oscuro (Gold sobre Ink seguía siendo el diseño).
 * - Tabla contenedora con `bgcolor`: Outlook de escritorio ignora `max-width` y el
 *   fondo de un <div>; con la tabla el Ink llega de borde a borde.
 * - Preheader oculto: lo que Gmail muestra como snippet junto al asunto (la fecha,
 *   no "FOTF STUDIOS ¡Reserva confirmada! Hola…").
 */
const shell = (inner: string, preheader = "") =>
  `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>FOTF Studios</title>
<style>:root{color-scheme:dark;supported-color-schemes:dark}</style>
</head>
<body style="margin:0;padding:0;background:${T.ink}" bgcolor="${T.ink}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.ink}" style="background:${T.ink}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="color:${T.bone};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<p style="color:${T.gold};letter-spacing:.15em;font-size:12px;margin:0 0 16px">FOTF STUDIOS</p>
${inner}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

/** Email al cliente: confirmación de reserva + cómo llega el acceso (PIN por email 10 min antes). */
export function customerConfirmation(
  v: BookingView,
  ctx: {
    address: string;
    whatsappUrl: string;
    /** La reserva al bolsillo: recibo público, calendario y la cuenta (puntos + próximas). */
    links: { statusUrl: string; calendarUrl: string; accountUrl: string };
  },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">¡Reserva confirmada!</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión quedó reservada.</p>
     <p style="margin:0 0 4px"><strong>${esc(v.when)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(ctx.address)}</p>
     <table style="width:100%;border-top:1px solid ${T.inkLine};border-bottom:1px solid ${T.inkLine};margin:8px 0">${rows(v.lines)}</table>
     <p style="font-size:20px;margin:12px 0"><strong>Total: ${v.total}</strong> <span style="color:${T.boneQuiet};font-size:12px">IVA incluido</span></p>
     <p style="color:${T.boneDim};margin:16px 0">Tu <strong style="color:${T.bone}">código de acceso te llega por email 10 minutos antes</strong> de tu sesión (revisa spam). Si no lo ves, escríbenos por WhatsApp.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.links.statusUrl)}" style="color:${T.gold};font-weight:bold">Ver mi reserva</a> <span style="color:${T.boneQuiet}">·</span> <a href="${esc(ctx.links.calendarUrl)}" style="color:${T.gold};font-weight:bold">Agregar a mi calendario</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0">Tus puntos y tus próximas sesiones, en <a href="${esc(ctx.links.accountUrl)}" style="color:${T.gold}">tu cuenta</a>.</p>`,
    `${v.when} · ${ctx.address}`,
  );
  const text = `¡Reserva confirmada! ${v.when}. ${ctx.address}. Total ${v.total} (IVA incl.). Tu código de acceso te llega por email 10 minutos antes de tu sesión (revisa spam). Si no lo ves, escríbenos por WhatsApp: ${ctx.whatsappUrl}. Ver mi reserva: ${ctx.links.statusUrl}. Tu cuenta (puntos y próximas sesiones): ${ctx.links.accountUrl}`;
  return { template: "customerConfirmation", subject: "Tu reserva en FOTF Studios está confirmada", html, text };
}

/**
 * Email al cliente: confirmación de una sesión de CORTESÍA (sin cobro, sin orden).
 * Sin tabla de líneas ni total; los extras van como texto ("Incluye: …"), igual que
 * en las notas de la reserva. Los T&C viajan acá porque la cortesía no registra
 * consentimiento (no hay orden), espejo del mensaje de WhatsApp manual.
 */
export function customerCourtesyConfirmation(
  v: { name: string | null; when: string; addonNames: string[] },
  ctx: { address: string; whatsappUrl: string; termsUrl: string; privacyUrl: string },
): EmailContent {
  const addonsLine =
    v.addonNames.length > 0
      ? `<p style="color:${T.boneDim};margin:0 0 16px">Incluye: ${esc(v.addonNames.join(", "))}</p>`
      : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">¡Reserva confirmada!</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión quedó reservada.</p>
     <p style="margin:0 0 4px"><strong>${esc(v.when)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(ctx.address)}</p>
     <p style="margin:8px 0 16px;border-top:1px solid ${T.inkLine};border-bottom:1px solid ${T.inkLine};padding:8px 0"><strong>Cortesía:</strong> sesión sin cobro.</p>
     ${addonsLine}
     <p style="color:${T.boneDim};margin:16px 0">Tu <strong style="color:${T.bone}">código de acceso te llega por email 10 minutos antes</strong> de tu sesión (revisa spam). Si no lo ves, escríbenos por WhatsApp.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0">Al reservar aceptas nuestros <a href="${ctx.termsUrl}" style="color:${T.gold}">términos</a> y <a href="${ctx.privacyUrl}" style="color:${T.gold}">política de privacidad</a>.</p>`,
    `${v.when} · ${ctx.address} · cortesía`,
  );
  const text = `¡Reserva confirmada! ${v.when}. ${ctx.address}. Cortesía: sesión sin cobro.${v.addonNames.length > 0 ? ` Incluye: ${v.addonNames.join(", ")}.` : ""} Tu código de acceso te llega por email 10 minutos antes de tu sesión (revisa spam). Si no lo ves, escríbenos por WhatsApp: ${ctx.whatsappUrl}. Al reservar aceptas nuestros términos y política de privacidad: ${ctx.termsUrl} · ${ctx.privacyUrl}`;
  return { template: "customerCourtesyConfirmation", subject: "Tu sesión de cortesía en FOTF Studios está confirmada", html, text };
}

/**
 * Email al cliente: código/instrucciones de acceso a la sala. El "código" es texto
 * libre del staff (puede ser un código de puerta o instrucciones cortas). Se envía
 * cada vez que el staff guarda el acceso — un código corregido también viaja.
 */
export function customerAccessCode(
  v: { name: string | null; when: string; code: string },
  ctx: { address: string; whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu acceso a la sala</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}aquí tienes el acceso para tu sesión del <strong style="color:${T.bone}">${esc(v.when)}</strong>.</p>
     <p style="background:${T.inkLine};color:${T.gold};font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.08em;padding:14px 18px;margin:0 0 16px">${esc(v.code)}</p>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(ctx.address)}</p>
     <p style="color:${T.boneDim};margin:16px 0">Llegas, conectas tu música y a darle.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
    `Tu PIN para el ${v.when}`,
  );
  const text = `Tu acceso para el ${v.when}: ${v.code}. ${ctx.address}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerAccessCode", subject: "Tu código de acceso — FOTF Studios", html, text };
}

/**
 * Email al cliente: recordatorio de su sesión (sale hasta 24 h antes desde el cron de
 * 5 min). Fecha completa, nunca "mañana": la ventana es ancha a propósito para que un
 * cron caído no deje a nadie sin aviso. Repite la promesa de acceso (PIN por email 10
 * min antes) porque este es el correo que el cliente relee camino a la sala.
 */
export function customerReminder(
  v: { name: string | null; when: string },
  ctx: { address: string; whatsappUrl: string; statusUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu sesión se acerca</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}te esperamos el <strong style="color:${T.bone}">${esc(v.when)}</strong>.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(ctx.address)}</p>
     <p style="color:${T.boneDim};margin:16px 0">Tu <strong style="color:${T.bone}">código de acceso te llega por email 10 minutos antes</strong> (revisa spam). Entras solo, sin esperar a nadie. Trae tu música en USB.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.statusUrl)}" style="color:${T.gold};font-weight:bold">Ver mi reserva</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Algo cambió? Escríbenos por WhatsApp</a>`,
    `${v.when} · ${ctx.address}`,
  );
  const text = `Tu sesión se acerca: ${v.when}. ${ctx.address}. Tu código de acceso te llega por email 10 minutos antes (revisa spam). Ver mi reserva: ${ctx.statusUrl}. ¿Algo cambió? ${ctx.whatsappUrl}`;
  return { template: "customerReminder", subject: "Tu sesión en FOTF Studios se acerca", html, text };
}

/**
 * Email al cliente: su pago se aprobó pero el horario ya no estaba reservado
 * (`paid_no_hold`). Antes no recibía NADA — plata fuera, cero correo — mientras el
 * dueño recibía la alerta. Reconoce el pago, dice la verdad y promete WhatsApp; no
 * promete la sala ni dice "confirmada" (eso lo decide el dueño: devolver o reasignar).
 */
export function customerPaymentNoSlot(
  v: { name: string | null; when: string; total: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Recibimos tu pago</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}recibimos tu pago de <strong style="color:${T.bone}">${esc(v.total)}</strong> para el <strong style="color:${T.bone}">${esc(v.when)}</strong>, pero ese horario ya no estaba disponible cuando llegó el pago.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Te escribimos por WhatsApp en breve para darte otro horario o devolverte el pago completo. Si prefieres, adelántate:</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `${v.total} · ${v.when}`,
  );
  const text = `Recibimos tu pago de ${v.total} para el ${v.when}, pero ese horario ya no estaba disponible cuando llegó el pago. Te escribimos por WhatsApp en breve para darte otro horario o devolverte el pago completo: ${ctx.whatsappUrl}`;
  return { template: "customerPaymentNoSlot", subject: "Recibimos tu pago — te escribimos por WhatsApp", html, text };
}

/**
 * Email al cliente: una reserva pendiente de pago (link de 72 h) venció y el horario
 * se liberó. Antes recibía "Tu hora está tomada — falta el pago" y después silencio.
 */
export function customerHoldExpired(
  v: { name: string | null; when: string },
  ctx: { whatsappUrl: string; bookUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Se liberó tu hora</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}no recibimos el pago de tu reserva del <strong style="color:${T.bone}">${esc(v.when)}</strong>, así que el horario volvió a quedar disponible para todos.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Si aún quieres la sesión, <a href="${esc(ctx.bookUrl)}" style="color:${T.gold};font-weight:bold">reserva de nuevo</a> o escríbenos y te ayudamos.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Sesión del ${v.when}`,
  );
  const text = `No recibimos el pago de tu reserva del ${v.when}, así que el horario volvió a quedar disponible. Si aún quieres la sesión, reserva de nuevo: ${ctx.bookUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerHoldExpired", subject: "Se liberó tu hora en FOTF Studios", html, text };
}

/** Email al cliente: su sesión de CORTESÍA fue cancelada. Sin dinero de por medio. */
export function customerCourtesyCancelled(
  v: { name: string | null; when: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Sesión cancelada</h1>
     <p style="color:${T.boneDim};margin:0 0 20px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión del <strong style="color:${T.bone}">${esc(v.when)}</strong> fue cancelada. Si quieres otro horario, escríbenos y lo vemos.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Tu sesión del ${v.when} fue cancelada. Si quieres otro horario: ${ctx.whatsappUrl}`;
  return { template: "customerCourtesyCancelled", subject: "Tu sesión en FOTF Studios fue cancelada", html, text };
}

/** Email al cliente: su reserva fue cancelada (con o sin reembolso). */
export function customerCancellation(
  v: { name: string | null; when: string; refunded: string | null; restoredPoints?: number | null },
  ctx: { whatsappUrl: string },
): EmailContent {
  // Orden pagada 100% con puntos: no hubo cobro, se reponen puntos (nada de "tarjeta").
  const pts = v.restoredPoints && v.restoredPoints > 0 ? `${Math.round(v.restoredPoints).toLocaleString("es-CL")} puntos` : null;
  const refundLine = pts
    ? `<p style="color:${T.boneDim};margin:0 0 16px">Te repusimos <strong style="color:${T.bone}">${pts}</strong> en tu cuenta.</p>`
    : v.refunded
      ? `<p style="color:${T.boneDim};margin:0 0 16px">Te reembolsamos <strong style="color:${T.bone}">${esc(v.refunded)}</strong> al medio de pago original. Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.</p>`
      : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Reserva cancelada</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión del <strong style="color:${T.bone}">${esc(v.when)}</strong> fue cancelada.</p>
     ${refundLine}
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
    `Sesión del ${v.when}`,
  );
  const textLine = pts
    ? ` Te repusimos ${pts} en tu cuenta.`
    : v.refunded
      ? ` Te reembolsamos ${v.refunded} al medio de pago original.`
      : "";
  const text = `Tu reserva del ${v.when} fue cancelada.${textLine} ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerCancellation", subject: "Tu reserva en FOTF Studios fue cancelada", html, text };
}

export function customerReschedule(
  v: { name: string | null; when: string; refunded: string | null },
  ctx: { whatsappUrl: string; address: string },
): EmailContent {
  const refundLine = v.refunded
    ? `<p style="color:${T.boneDim};margin:0 0 16px">Como el nuevo horario cuesta menos, te reembolsamos <strong style="color:${T.bone}">${esc(v.refunded)}</strong> al medio de pago original. Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.</p>`
    : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Reserva reagendada</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión quedó reagendada para el <strong style="color:${T.bone}">${esc(v.when)}</strong>.</p>
     ${refundLine}
     <p style="color:${T.boneDim};margin:0 0 20px">Te esperamos en ${esc(ctx.address)}.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
    `Nuevo horario: ${v.when}`,
  );
  const text = `Tu reserva quedó reagendada para el ${v.when}.${v.refunded ? ` Te reembolsamos ${v.refunded} al medio de pago original.` : ""} Te esperamos en ${ctx.address}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerReschedule", subject: "Tu reserva en FOTF Studios cambió de horario", html, text };
}

export function customerRescheduleFailed(
  v: { name: string | null; when: string; refunded: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">No pudimos cambiar tu horario</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}el horario que pediste ya estaba tomado cuando se procesó el pago. Mantuvimos tu reserva original del <strong style="color:${T.bone}">${esc(v.when)}</strong> y te devolvimos <strong style="color:${T.bone}">${esc(v.refunded)}</strong> al medio de pago.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos para elegir otro horario</a>`,
    `Se mantiene tu reserva del ${v.when}`,
  );
  const text = `No pudimos moverte de horario (ya estaba tomado). Mantuvimos tu reserva del ${v.when} y te devolvimos ${v.refunded}. Escríbenos: ${ctx.whatsappUrl}`;
  return { template: "customerRescheduleFailed", subject: "No pudimos cambiar tu horario en FOTF Studios", html, text };
}

/**
 * Email al dueño: un pago se aprobó pero el horario ya no estaba reservado (el hold
 * venció antes de que llegara el pago). Requiere acción manual: refund o reasignar.
 * Sirena (${T.sirena}) es legítima aquí: es urgencia real, no decoración.
 */
export function ownerNeedsReview(
  v: { when: string; total: string; email: string | null; paymentId: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px;color:${T.sirena}">Pago sin reserva — revisar</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Se aprobó un pago pero el horario ya no estaba reservado (el hold venció antes del pago). Hay que <strong style="color:${T.bone}">devolver o reasignar</strong>.</p>
     <p style="margin:0 0 4px">Horario solicitado: <strong>${esc(v.when)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Cliente: ${esc(v.email ?? "sin email")}</p>
     <p style="color:${T.boneDim};margin:0 0 16px">Pago: ${esc(v.paymentId)} · Total ${esc(v.total)}</p>`,
  );
  const text = `PAGO SIN RESERVA — revisar. Horario ${v.when}. Cliente ${v.email ?? "?"}. Pago ${v.paymentId}, total ${v.total}. Devolver o reasignar.`;
  return { template: "ownerNeedsReview", subject: "⚠️ Pago sin reserva — acción requerida", html, text };
}

/**
 * Email al dueño: nueva postulación de DJ (/unete). El teléfono llega normalizado
 * (`+56912345678`); para el link wa.me van solo los dígitos. Instagram y géneros
 * son opcionales: sus líneas se omiten si vienen null. Todo el input del postulante
 * es hostil → pasa por esc(), incluido dentro de href (la URL ya se validó http(s)).
 */
export function ownerNewApplication(v: {
  name: string;
  email: string;
  phone: string;
  format: SessionFormat;
  availability: string;
  mixUrl: string;
  instagram: string | null;
  genres: string | null;
  pitch: string;
}): EmailContent {
  const waDigits = v.phone.replace(/\D/g, "");
  const formatLabel = SESSION_FORMAT_LABELS[v.format];
  const optional = (label: string, value: string) =>
    `<p style="color:${T.boneDim};margin:0 0 4px">${label}: <strong style="color:${T.bone}">${esc(value)}</strong></p>`;
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Nueva postulación de DJ</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.name)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Email: <a href="mailto:${esc(v.email)}" style="color:${T.gold}">${esc(v.email)}</a></p>
     <p style="color:${T.boneDim};margin:0 0 16px">WhatsApp: <a href="https://wa.me/${esc(waDigits)}" style="color:${T.gold}">${esc(v.phone)}</a></p>
     ${optional("Puede hacer", formatLabel)}
     ${optional("Disponibilidad", v.availability)}
     <p style="margin:12px 0 12px">Set: <a href="${esc(v.mixUrl)}" style="color:${T.gold}">${esc(v.mixUrl)}</a></p>
     ${v.instagram ? optional("Instagram", v.instagram) : ""}
     ${v.genres ? optional("Géneros", v.genres) : ""}
     <p style="color:${T.boneDim};margin:16px 0 4px">Experiencia:</p>
     <p style="background:${T.inkSoft};padding:10px 12px;margin:0;color:${T.bone};white-space:pre-wrap">${esc(v.pitch)}</p>`,
  );
  const igText = v.instagram ? ` IG: ${v.instagram}.` : "";
  const genresText = v.genres ? ` Géneros: ${v.genres}.` : "";
  const text = `Nueva postulación de DJ: ${v.name}. Puede hacer: ${formatLabel}. Disponibilidad: ${v.availability}. Email ${v.email}. WhatsApp https://wa.me/${waDigits}. Set: ${v.mixUrl}.${igText}${genresText}\n\n${v.pitch}`;
  return { template: "ownerNewApplication", subject: `Nueva postulación de DJ — ${v.name}`, html, text };
}

/** Email al postulante: confirmación de que recibimos su postulación. Sin plazos prometidos. */
export function applicantConfirmation(
  v: { name: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Recibimos tu postulación</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Gracias por querer sumarte al equipo, ${esc(v.name)}. Vamos a escuchar tu set y revisar tu experiencia; si calza, te escribimos por WhatsApp para coordinar clases o sesiones 1:1.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Mientras tanto, síguenos y mándanos lo que estés preparando.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Recibimos tu postulación al equipo, ${v.name}. Vamos a escuchar tu set y revisar tu experiencia; si calza, te escribimos por WhatsApp para coordinar clases o sesiones 1:1: ${ctx.whatsappUrl}`;
  return { template: "applicantConfirmation", subject: "Recibimos tu postulación — FOTF Studios", html, text };
}

/**
 * Email al dueño: nueva solicitud del Curso de DJ. Trae todo lo que necesita para
 * triar desde el teléfono —interés, punto de partida, disponibilidad y el wa.me
 * listo— sin abrir el panel. Los cupos restantes van acá a propósito: es la
 * información que decide si contesta ahora o mañana.
 */
export function ownerNewCourseLead(
  v: CourseLeadInput,
  gen: { code: string; seatsLeft: number } | null,
): EmailContent {
  const waDigits = v.phone.replace(/\D/g, "");
  const plan = LEAD_PLAN_LABELS[v.plan];
  const nivel = EXPERIENCE_LABELS[v.experience];
  const cupos = gen
    ? `<p style="color:${T.gold};margin:16px 0 0">${gen.code}: quedan ${gen.seatsLeft} ${gen.seatsLeft === 1 ? "cupo" : "cupos"}.</p>`
    : `<p style="color:${T.boneDim};margin:16px 0 0">No hay generación abierta.</p>`;
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Nueva solicitud del curso</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.name)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Email: <a href="mailto:${esc(v.email)}" style="color:${T.gold}">${esc(v.email)}</a></p>
     <p style="color:${T.boneDim};margin:0 0 16px">WhatsApp: <a href="https://wa.me/${esc(waDigits)}" style="color:${T.gold}">${esc(v.phone)}</a></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Le interesa: <strong style="color:${T.bone}">${esc(plan)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Parte desde: <strong style="color:${T.bone}">${esc(nivel)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Disponibilidad: <strong style="color:${T.bone}">${esc(v.availability)}</strong></p>
     ${v.message ? `<p style="color:${T.boneDim};margin:16px 0 4px">Mensaje:</p><p style="background:${T.inkSoft};padding:10px 12px;margin:0;color:${T.bone};white-space:pre-wrap">${esc(v.message)}</p>` : ""}
     ${cupos}`,
  );
  const cuposText = gen ? ` ${gen.code}: quedan ${gen.seatsLeft} cupos.` : " Sin generación abierta.";
  const msgText = v.message ? `\n\n${v.message}` : "";
  const text = `Nueva solicitud del curso: ${v.name}. Le interesa: ${plan}. Parte desde: ${nivel}. Disponibilidad: ${v.availability}. Email ${v.email}. WhatsApp https://wa.me/${waDigits}.${cuposText}${msgText}`;
  return { template: "ownerNewCourseLead", subject: `Nueva solicitud del curso — ${v.name}`, html, text };
}

/**
 * Email al alumno: acuse de recibo. NO promete cupo ni fechas — la solicitud no
 * reserva asiento, eso pasa recién cuando el dueño la confirma.
 */
export function courseLeadConfirmation(
  v: { name: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Recibimos tu solicitud</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Gracias, ${esc(v.name)}. Revisamos cada solicitud a mano y te escribimos por WhatsApp para cerrar tu cupo y coordinar las fechas.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Si prefieres adelantarlo, escríbenos directo y lo vemos al tiro.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Recibimos tu solicitud del Curso de Iniciación DJ, ${v.name}. Revisamos cada una a mano y te escribimos por WhatsApp para cerrar tu cupo y coordinar las fechas. Si prefieres adelantarlo: ${ctx.whatsappUrl}`;
  return { template: "courseLeadConfirmation", subject: "Recibimos tu solicitud — Curso de DJ", html, text };
}

/**
 * Email al alumno: cupo confirmado. Recién ACÁ viaja la dirección — la FAQ de la
 * landing promete que se comparte al confirmar la inscripción, y una solicitud sin
 * pagar no lo es. Lleva las fechas de todas las sesiones porque el curso se compra
 * entero, no sesión por sesión.
 */
export function courseEnrollmentPaid(v: {
  name: string;
  generation: string;
  total: string;
  sessions: string[];
}, ctx: { address: string; whatsappUrl: string }): EmailContent {
  const lista = v.sessions.length
    ? `<ul style="margin:0 0 20px;padding-left:18px;color:${T.bone}">${v.sessions
        .map((d) => `<li style="margin:0 0 6px">${esc(d)}</li>`)
        .join("")}</ul>`
    : `<p style="color:${T.boneDim};margin:0 0 20px">Te confirmamos las fechas por WhatsApp.</p>`;
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu cupo está confirmado</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Listo, ${esc(v.name)}. Quedaste en la generación ${esc(v.generation)} del Curso de Iniciación DJ.</p>
     <p style="color:${T.boneDim};margin:0 0 8px">Tus sesiones:</p>
     ${lista}
     <p style="color:${T.boneDim};margin:0 0 4px">Dónde: <strong style="color:${T.bone}">${esc(ctx.address)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 20px">Qué traer: tus audífonos y un USB con tu música.</p>
     <p style="margin:0 0 20px"><strong>Total pagado: ${esc(v.total)}</strong></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Generación ${v.generation} · ${v.sessions[0] ?? "fechas por WhatsApp"}`,
  );
  const text = `Tu cupo está confirmado, ${v.name}. Generación ${v.generation} del Curso de Iniciación DJ.${v.sessions.length ? " Sesiones: " + v.sessions.join(" · ") + "." : " Te confirmamos las fechas por WhatsApp."} Dónde: ${ctx.address}. Qué traer: audífonos y un USB con tu música. Total pagado: ${v.total}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "courseEnrollmentPaid", subject: "Tu cupo está confirmado — Curso de DJ", html, text };
}

/**
 * Email al alumno con el link de pago. La dirección NO viaja acá: la FAQ promete
 * compartirla al confirmar la inscripción, y una inscripción sin pagar no lo es.
 * Sí viajan los términos, porque es el punto donde el alumno acepta la compra.
 */
export function courseEnrollmentPending(
  v: { name: string; generation: string; total: string; initPoint: string; expiresInHours: number },
  ctx: { termsUrl: string; whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu cupo te espera</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(v.name)}: reservamos tu cupo en la generación ${esc(v.generation)} del Curso de Iniciación DJ. Queda confirmado al pagar.</p>
     <p style="font-size:22px;margin:0 0 20px"><strong>${esc(v.total)}</strong></p>
     <a href="${esc(v.initPoint)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Pagar ahora</a>
     <p style="color:${T.boneDim};margin:20px 0 0">El link vence en ${v.expiresInHours} horas. Si se te pasa, escríbenos y te mandamos otro.</p>
     <p style="color:${T.boneDim};margin:16px 0 0;font-size:13px">Al pagar aceptas los <a href="${ctx.termsUrl}" style="color:${T.gold}">términos y condiciones</a>.</p>`,
    `Generación ${v.generation} · ${v.total} · el link vence en ${v.expiresInHours} h`,
  );
  const text = `${v.name}: reservamos tu cupo en la generación ${v.generation} del Curso de Iniciación DJ. Total ${v.total}. Paga acá: ${v.initPoint} (el link vence en ${v.expiresInHours} horas). Al pagar aceptas los términos: ${ctx.termsUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "courseEnrollmentPending", subject: `Tu cupo en el Curso de DJ — falta el pago`, html, text };
}

/**
 * Email al cliente: su reserva está tomada pero falta pagar, con el link.
 *
 * Espejo de `courseEnrollmentPending` — mismo patrón, mismo vencimiento visible.
 * El link se dice CUÁNDO vence a propósito: son 72 h y una reserva manual puede
 * ser para dentro de semanas, así que el cliente tiene que saber que este link
 * no lo va a esperar hasta la sesión.
 */
export function bookingPaymentPending(
  v: { name: string | null; when: string; total: string; initPoint: string; expiresInHours: number },
  ctx: { termsUrl: string; whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu hora está tomada</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${v.name ? `${esc(v.name)}: ` : ""}te reservamos la sala. Queda confirmada al pagar.</p>
     <p style="margin:0 0 4px"><strong>${esc(v.when)}</strong></p>
     <p style="font-size:22px;margin:8px 0 20px"><strong>${esc(v.total)}</strong></p>
     <a href="${esc(v.initPoint)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Pagar ahora</a>
     <p style="color:${T.boneDim};margin:20px 0 0">El link vence en ${v.expiresInHours} horas. Si se te pasa, escríbenos y te mandamos otro.</p>
     <p style="color:${T.boneDim};margin:16px 0 0;font-size:13px">Al pagar aceptas los <a href="${ctx.termsUrl}" style="color:${T.gold}">términos y condiciones</a>.</p>`,
    `${v.when} · ${v.total} · el link vence en ${v.expiresInHours} h`,
  );
  const text = `${v.name ? `${v.name}: ` : ""}Te reservamos la sala para ${v.when}. Total ${v.total}. Paga acá: ${v.initPoint} (el link vence en ${v.expiresInHours} horas). Al pagar aceptas los términos: ${ctx.termsUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "bookingPaymentPending", subject: "Tu hora en FOTF Studios — falta el pago", html, text };
}

/** Email al dueño: inscripción pagada. Cierra recordando la boleta, como ownerNotification. */
export function ownerCoursePaid(v: {
  name: string;
  generation: string;
  total: string;
  method: string;
  seatsLeft: number;
}): EmailContent {
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Inscripción pagada</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.name)}</strong> · ${esc(v.generation)}</p>
     <p style="color:${T.boneDim};margin:0 0 16px">Pagó por ${esc(v.method)}.</p>
     <p style="font-size:20px;margin:12px 0"><strong>Total: ${esc(v.total)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Quedan ${v.seatsLeft} ${v.seatsLeft === 1 ? "cupo" : "cupos"} en la generación.</p>
     <p style="color:${T.gold};margin:16px 0">Recuerda emitir la boleta.</p>`,
  );
  const text = `Inscripción pagada: ${v.name} (${v.generation}). Pagó por ${v.method}. Total ${v.total}. Quedan ${v.seatsLeft} cupos. Recuerda emitir la boleta.`;
  return { template: "ownerCoursePaid", subject: `Inscripción pagada — ${v.name} (${v.generation})`, html, text };
}

/** Email al alumno: su inscripción quedó anulada (impaga). Sin dinero de por medio. */
export function courseEnrollmentCancelled(
  v: { name: string; generation: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu inscripción quedó anulada</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Hola ${esc(v.name)}: liberamos tu cupo en la generación ${esc(v.generation)}. No se hizo ningún cobro.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Si fue un error o quieres entrar a la siguiente, escríbenos y lo arreglamos.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Tu inscripción en la generación ${v.generation} quedó anulada y liberamos tu cupo. No se hizo ningún cobro. Si fue un error o quieres entrar a la siguiente: ${ctx.whatsappUrl}`;
  return { template: "courseEnrollmentCancelled", subject: "Tu inscripción quedó anulada — Curso de DJ", html, text };
}

/**
 * Email al alumno: su inscripción PAGADA fue cancelada, con o sin reembolso. Espejo de
 * `customerCancellation`: con monto dice cuánto y a dónde vuelve; sin monto no dice nada
 * de dinero (la política de /terminos ya lo explica; una línea confrontacional acá no ayuda).
 * Nunca "no se hizo ningún cobro" — eso es `courseEnrollmentCancelled`, para la impaga.
 */
export function courseEnrollmentRefunded(
  v: { name: string; generation: string; refunded: string | null },
  ctx: { whatsappUrl: string },
): EmailContent {
  const refundLine = v.refunded
    ? `<p style="color:${T.boneDim};margin:0 0 16px">Te reembolsamos <strong style="color:${T.bone}">${esc(v.refunded)}</strong> al medio de pago original. Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.</p>`
    : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Inscripción cancelada</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Hola ${esc(v.name)}: cancelamos tu cupo en la generación ${esc(v.generation)} del Curso de Iniciación DJ.</p>
     ${refundLine}
     <p style="color:${T.boneDim};margin:0 0 20px">Si quieres entrar a la siguiente generación, escríbenos y lo vemos.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
  );
  const text = `Cancelamos tu cupo en la generación ${v.generation} del Curso de Iniciación DJ.${v.refunded ? ` Te reembolsamos ${v.refunded} al medio de pago original.` : ""} Si quieres entrar a la siguiente generación: ${ctx.whatsappUrl}`;
  return { template: "courseEnrollmentRefunded", subject: "Tu inscripción al Curso de DJ fue cancelada", html, text };
}

/*
 * ─── Supabase Auth (Send Email Hook) ───────────────────────────────────────────
 * Antes vivían en supabase/templates/*.html y había que espejarlas a mano en el
 * Dashboard (la caída de #151 fue esa deriva). Con el hook, GoTrue nos pide el correo
 * y estas plantillas son la única fuente. Mismo criterio de copy: "código de
 * verificación", nunca "código de acceso" (ese es el PIN de la sala).
 */

/** Código de inicio de sesión (magic link y alta de cliente nuevo). */
export function authLoginCode(v: { token: string; confirmUrl: string }): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Inicia sesión en tu cuenta</h1>
     <p style="color:${T.boneDim};margin:0 0 20px">Usa este código para confirmar que eres tú e iniciar sesión en FOTF Studios. Vence en una hora y sirve una sola vez.</p>
     <p style="font-size:34px;letter-spacing:8px;font-weight:700;font-family:'Courier New',monospace;color:${T.gold};margin:0 0 20px">${esc(v.token)}</p>
     <p style="color:${T.boneDim};margin:0 0 20px">¿Prefieres un clic? <a href="${esc(v.confirmUrl)}" style="color:${T.bone};font-weight:bold">Iniciar sesión</a>.</p>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0;border-top:1px solid ${T.inkLine};padding-top:16px">Este es tu código para iniciar sesión en el sitio — no es el código de acceso a la sala (ese te llega en otro correo, 10 minutos antes de tu sesión). Si no intentaste iniciar sesión, ignora este correo: tu cuenta sigue segura.</p>`,
  );
  const text = `Tu código para iniciar sesión en FOTF Studios: ${v.token} (vence en una hora, sirve una sola vez). O entra con un clic: ${v.confirmUrl}. No es el código de acceso a la sala; ese te llega 10 minutos antes de tu sesión. Si no fuiste tú, ignora este correo.`;
  return { template: "authLoginCode", subject: `Tu código para iniciar sesión en FOTF Studios: ${v.token}`, html, text };
}

/** Recuperación de acceso (la app es passwordless; queda on-brand por si se gatilla). */
export function authRecovery(v: { token: string; confirmUrl: string }): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Recupera el acceso a tu cuenta</h1>
     <p style="color:${T.boneDim};margin:0 0 20px">Pediste recuperar el acceso a tu cuenta de FOTF Studios. Usa este código para verificar que eres tú. Vence en una hora y sirve una sola vez.</p>
     <p style="font-size:34px;letter-spacing:8px;font-weight:700;font-family:'Courier New',monospace;color:${T.gold};margin:0 0 20px">${esc(v.token)}</p>
     <p style="color:${T.boneDim};margin:0 0 20px">¿Prefieres un clic? <a href="${esc(v.confirmUrl)}" style="color:${T.bone};font-weight:bold">Recuperar mi cuenta</a>.</p>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0;border-top:1px solid ${T.inkLine};padding-top:16px">Este código es para tu cuenta del sitio — no es el código de acceso a la sala (ese te llega en otro correo, 10 minutos antes de tu sesión). Si no lo pediste, ignora este correo: tu cuenta sigue segura.</p>`,
  );
  const text = `Tu código para recuperar el acceso a FOTF Studios: ${v.token} (vence en una hora). O con un clic: ${v.confirmUrl}. Si no lo pediste, ignora este correo.`;
  return { template: "authRecovery", subject: `Tu código para recuperar el acceso a FOTF Studios: ${v.token}`, html, text };
}

/** Confirmación de cambio de correo (puede ir al actual y al nuevo). */
export function authEmailChange(v: { token: string; confirmUrl: string }): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Confirma tu nuevo correo</h1>
     <p style="color:${T.boneDim};margin:0 0 20px">Pediste cambiar el correo de tu cuenta de FOTF Studios. Confirma que este correo es tuyo con el código o el botón. Vence en una hora y sirve una sola vez.</p>
     <p style="font-size:34px;letter-spacing:8px;font-weight:700;font-family:'Courier New',monospace;color:${T.gold};margin:0 0 20px">${esc(v.token)}</p>
     <p style="color:${T.boneDim};margin:0 0 20px">¿Prefieres un clic? <a href="${esc(v.confirmUrl)}" style="color:${T.bone};font-weight:bold">Confirmar correo</a>.</p>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0;border-top:1px solid ${T.inkLine};padding-top:16px">Este código es para verificar tu correo en el sitio — no es el código de acceso a la sala. Si no pediste este cambio, ignora este correo: tu cuenta sigue segura.</p>`,
  );
  const text = `Confirma tu nuevo correo en FOTF Studios con este código: ${v.token} (vence en una hora). O con un clic: ${v.confirmUrl}. Si no pediste este cambio, ignora este correo.`;
  return { template: "authEmailChange", subject: `Confirma tu nuevo correo en FOTF Studios: ${v.token}`, html, text };
}

/** Código de verificación genérico (reautenticación u otros tipos con token). */
export function authVerificationCode(v: { token: string }): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu código de verificación</h1>
     <p style="color:${T.boneDim};margin:0 0 20px">Usa este código para confirmar que eres tú. Vence en una hora y sirve una sola vez.</p>
     <p style="font-size:34px;letter-spacing:8px;font-weight:700;font-family:'Courier New',monospace;color:${T.gold};margin:0 0 20px">${esc(v.token)}</p>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0;border-top:1px solid ${T.inkLine};padding-top:16px">Es un código de verificación del sitio — no es el código de acceso a la sala. Si no lo pediste, ignora este correo.</p>`,
  );
  const text = `Tu código de verificación en FOTF Studios: ${v.token} (vence en una hora). Si no lo pediste, ignora este correo.`;
  return { template: "authVerificationCode", subject: `Tu código de verificación en FOTF Studios: ${v.token}`, html, text };
}

/** Email al dueño: aviso de nueva reserva pagada. */
export function ownerNotification(
  v: BookingView & { email: string | null },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Nueva reserva pagada</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.when)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(v.name ?? "Cliente")} · ${esc(v.email ?? "sin email")}</p>
     <table style="width:100%;border-top:1px solid ${T.inkLine};border-bottom:1px solid ${T.inkLine};margin:8px 0">${rows(v.lines)}</table>
     <p style="font-size:20px;margin:12px 0"><strong>Total: ${v.total}</strong></p>
     <p style="color:${T.gold};margin:16px 0">Recuerda cargar el PIN en la cerradura y emitir la boleta.</p>`,
    `${v.when} · ${v.total} · ${v.name ?? "Cliente"}`,
  );
  const text = `Nueva reserva pagada: ${v.when}. ${v.name ?? ""} ${v.email ?? ""}. Total ${v.total}. Cargar el PIN en la cerradura + emitir boleta.`;
  return { template: "ownerNotification", subject: `Nueva reserva — ${v.when}`, html, text };
}
