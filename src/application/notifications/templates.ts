import type { EmailContent } from "@/src/application/ports/mailer";
import { SESSION_FORMAT_LABELS, type SessionFormat } from "@/src/domain/applications/application";
import { EXPERIENCE_LABELS, LEAD_PLAN_LABELS } from "@/src/domain/course/course";
import type { CourseLeadInput } from "@/src/domain/course/lead";
import { COURSE_PROGRAM } from "@/src/domain/course/program";
import { formatPoints, fmtBeatcoins } from "@/src/domain/points/points";
import {
  a,
  amountRow,
  b,
  callout,
  codeBox,
  copyBlock,
  cta,
  dsShell,
  esc,
  eyebrow,
  fine,
  type FooterCtx,
  gap,
  ghosts,
  mono,
  p,
  quiet,
  receipt,
  steps,
  ticket,
  type TicketRow,
  toned,
} from "./ds-email";
import { EMAIL as T, EMAIL_DS as D } from "./email-tokens";
import type { SessionParts } from "./format-when";

export interface BookingView {
  name: string | null;
  when: string;
  total: string;
  lines: { description: string; amount: string }[];
  /** El mismo horario partido para la ficha (Fecha / Hora). Sin él, una fila "Cuándo". */
  parts?: SessionParts;
}

// ── Piezas compartidas de los correos del flujo de reserva (design system) ──
// Las plantillas del flujo público de reserva usan dsShell (ds-email.ts); el resto
// sigue en `shell` hasta migrarlas. Ver CLAUDE.md → Brand guardrails.

/** Links opcionales del pie: Instagram y la cuenta, cuando el servicio los conoce. */
export interface BookingFoot {
  instagramUrl?: string;
  accountUrl?: string;
}

const bookingFooter = (ctx: BookingFoot & { address?: string; mapsUrl?: string; whatsappUrl?: string }): FooterCtx => ({
  address: ctx.address,
  mapsUrl: ctx.mapsUrl,
  whatsappUrl: ctx.whatsappUrl,
  instagramUrl: ctx.instagramUrl,
  accountUrl: ctx.accountUrl,
  reason: "Recibes este correo porque reservaste en fotfstudios.cl.",
});

/** Fecha y hora de la sesión como filas de la ficha; sin `parts`, una sola fila con `when`. */
const sessionRows = (v: { when: string; parts?: SessionParts }): TicketRow[] =>
  v.parts
    ? [
        { label: "Fecha", value: esc(v.parts.date) },
        { label: "Hora", value: `${esc(v.parts.time)}${v.parts.duration ? ` ${quiet(`· ${esc(v.parts.duration)}`)}` : ""}` },
      ]
    : [{ label: "Cuándo", value: esc(v.when) }];

/** La dirección como link PROPIO a Maps (Gmail auto-enlaza el texto plano en su azul). */
const placeRow = (ctx: { address: string; mapsUrl: string }): TicketRow => ({
  label: "Lugar",
  value: a(esc(ctx.address), ctx.mapsUrl, D.text),
});

/** Email del cliente en los avisos al dueño: un mailto, o "sin email". */
const contact = (email: string | null): string => (email ? a(esc(email), `mailto:${email}`, D.text) : "sin email");

/** Actividad de la cuenta de Mercado Pago: desde ahí se devuelve un pago. */
const MP_ACTIVITIES = "https://www.mercadopago.cl/activities";

/** Los cuatro correos de código de Supabase Auth comparten forma: código grande + aviso. */
const authShell = (o: { preheader: string; title: string; lead: string; token: string; action?: [string, string]; note: string }): string =>
  dsShell({
    preheader: o.preheader,
    status: ["Verificación", "neutral"],
    eyebrow: "Tu cuenta",
    title: o.title,
    body: `${p(o.lead, "0 0 28px")}
${codeBox("Código de verificación", esc(o.token), { size: 40 })}
${o.action ? `${gap(24)}${cta(o.action[0], o.action[1])}` : ""}
${gap(28)}${callout("No es tu PIN de la sala", o.note, "neutral")}`,
    footer: { reason: "Recibes este correo porque pediste un código en fotfstudios.cl." },
  });

/** "Hola Ana, tu sesión…" o, sin nombre, "Tu sesión…" (la mayúscula la ponía el saludo). */
const hola = (name: string | null | undefined, rest: string): string =>
  name ? `Hola ${esc(name)}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1);

/** Dirección como link PROPIO a Maps: si va como texto plano, Gmail la auto-enlaza en su azul sobre Ink. */
const place = (ctx: { address: string; mapsUrl: string }): string =>
  `<a href="${esc(ctx.mapsUrl)}" style="color:${T.gold};text-decoration:underline">${esc(ctx.address)}</a>`;

/**
 * Envoltorio clásico (Arial / Gold), el de los correos que todavía no pasan al design
 * system de reservas (`dsShell` en ds-email.ts). Documento completo, no un <div> suelto:
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
  ctx: BookingFoot & {
    address: string;
    mapsUrl: string;
    whatsappUrl: string;
    /** La reserva al bolsillo: recibo público, calendario y la cuenta (puntos + próximas). */
    links: { statusUrl: string; calendarUrl: string; accountUrl: string };
  },
): EmailContent {
  const html = dsShell({
    preheader: `${v.when} · ${ctx.address} · tu código llega 10 min antes`,
    status: ["Confirmada", "ok"],
    eyebrow: "Tu reserva",
    title: "¡Reserva confirmada!",
    body: `${p(hola(v.name, "tu sesión quedó reservada."), "0 0 28px")}
${ticket([...sessionRows(v), placeRow(ctx)])}
${gap(12)}${receipt(v.lines.map((l) => ({ description: esc(l.description), amount: esc(l.amount) })), esc(v.total))}
${gap(32)}${steps("Qué sigue", [
      ["Agrégala a tu calendario", "Va adjunta como evento (.ics) en este correo."],
      [
        "Tu código de acceso te llega por email 10 minutos antes",
        "Y por WhatsApp si lo activaste. Revisa spam; si no lo ves, escríbenos por WhatsApp.",
      ],
      ["Llegas, conectas tu música y a darle", "Trae tus audífonos y tu USB."],
    ])}
${gap(12)}${cta("Agregar a mi calendario", ctx.links.calendarUrl)}
${ghosts([["Ver mi reserva", ctx.links.statusUrl], ["WhatsApp", ctx.whatsappUrl]])}
${fine(`Tus Beatcoins y tus próximas sesiones, en ${a("tu cuenta", ctx.links.accountUrl, D.text2)}.`)}`,
    footer: bookingFooter({ ...ctx, accountUrl: ctx.links.accountUrl }),
  });
  const text = `¡Reserva confirmada! ${v.when}. ${ctx.address}. Total ${v.total} (IVA incl.). Tu código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes de tu sesión (revisa spam). Si no lo ves, escríbenos por WhatsApp: ${ctx.whatsappUrl}. Trae tus audífonos y tu USB. Agregar a mi calendario: ${ctx.links.calendarUrl}. Ver mi reserva: ${ctx.links.statusUrl}. Tu cuenta (Beatcoins y próximas sesiones): ${ctx.links.accountUrl}`;
  return { template: "customerConfirmation", subject: `Reserva confirmada · ${v.when}`, html, text };
}

/**
 * Email al cliente: confirmación de una sesión de CORTESÍA (sin cobro, sin orden).
 * Sin tabla de líneas ni total; los extras van como texto ("Incluye: …"), igual que
 * en las notas de la reserva. Los T&C viajan acá porque la cortesía no registra
 * consentimiento (no hay orden), espejo del mensaje de WhatsApp manual.
 */
export function customerCourtesyConfirmation(
  v: { name: string | null; when: string; addonNames: string[] },
  ctx: {
    address: string;
    mapsUrl: string;
    whatsappUrl: string;
    termsUrl: string;
    privacyUrl: string;
    /** Sin orden no hay recibo público: calendario + cuenta. */
    links: { calendarUrl: string; accountUrl: string };
  },
): EmailContent {
  const addonsLine =
    v.addonNames.length > 0
      ? `<p style="color:${T.boneDim};margin:0 0 16px">Incluye: ${esc(v.addonNames.join(", "))}</p>`
      : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">¡Reserva confirmada!</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tu")} sesión quedó reservada.</p>
     <p style="margin:0 0 4px"><strong>${esc(v.when)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${place(ctx)}</p>
     <p style="margin:8px 0 16px;border-top:1px solid ${T.inkLine};border-bottom:1px solid ${T.inkLine};padding:8px 0"><strong>Cortesía:</strong> sesión sin cobro.</p>
     ${addonsLine}
     <p style="color:${T.boneDim};margin:16px 0">Tu <strong style="color:${T.bone}">código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes</strong> de tu sesión (revisa spam). Si no lo ves, escríbenos por WhatsApp.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.links.calendarUrl)}" style="color:${T.gold};font-weight:bold">Agregar a mi calendario</a> <span style="color:${T.boneQuiet}">·</span> <a href="${esc(ctx.links.accountUrl)}" style="color:${T.gold};font-weight:bold">Ver mi cuenta</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0">Al reservar aceptas nuestros <a href="${ctx.termsUrl}" style="color:${T.gold}">términos</a> y <a href="${ctx.privacyUrl}" style="color:${T.gold}">política de privacidad</a>.</p>`,
    `${v.when} · ${ctx.address} · cortesía`,
  );
  const text = `¡Reserva confirmada! ${v.when}. ${ctx.address}. Cortesía: sesión sin cobro.${v.addonNames.length > 0 ? ` Incluye: ${v.addonNames.join(", ")}.` : ""} Tu código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes de tu sesión (revisa spam). Si no lo ves, escríbenos por WhatsApp: ${ctx.whatsappUrl}. Tu cuenta: ${ctx.links.accountUrl}. Al reservar aceptas nuestros términos y política de privacidad: ${ctx.termsUrl} · ${ctx.privacyUrl}`;
  return { template: "customerCourtesyConfirmation", subject: `Sesión de cortesía confirmada · ${v.when}`, html, text };
}

/**
 * Email al cliente: código/instrucciones de acceso a la sala. El "código" es texto
 * libre del staff (puede ser un código de puerta o instrucciones cortas). Se envía
 * cada vez que el staff guarda el acceso — un código corregido también viaja.
 */
export function customerAccessCode(
  v: { name: string | null; when: string; code: string; parts?: SessionParts },
  ctx: BookingFoot & { address: string; mapsUrl: string; whatsappUrl: string },
): EmailContent {
  // El "código" es texto libre del staff: un PIN corto va en grande; instrucciones
  // largas, en un tamaño que se lea sin cortar.
  const short = v.code.trim().length <= 12;
  const html = dsShell({
    preheader: `Tu PIN para el ${v.when}`,
    status: ["Acceso activo", "accent"],
    eyebrow: esc(v.parts ? `${v.parts.date} · ${v.parts.time}` : v.when),
    title: "Tu acceso a la sala",
    body: `${p(hola(v.name, "aquí tienes el acceso para tu sesión."), "0 0 28px")}
${codeBox("Código de acceso", esc(v.code), {
      size: short ? 52 : 20,
      labelColor: D.orange,
      note: short ? "Marca el código en la cerradura de la puerta." : undefined,
    })}
${gap(12)}${ticket([placeRow(ctx), ...sessionRows(v).filter((r) => r.label !== "Fecha")])}
${gap(24)}${p("Llegas, conectas tu música y a darle.", "0 0 24px")}
${cta("Cómo llegar", ctx.mapsUrl)}
${ghosts([["¿Dudas? WhatsApp", ctx.whatsappUrl]])}`,
    footer: bookingFooter(ctx),
  });
  const text = `Tu acceso para el ${v.when}: ${v.code}. ${ctx.address}. Cómo llegar: ${ctx.mapsUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerAccessCode", subject: `Tu código de acceso · ${v.when}`, html, text };
}

/**
 * Email al cliente: recordatorio de su sesión (sale hasta 24 h antes desde el cron de
 * 5 min). Fecha completa, nunca "mañana": la ventana es ancha a propósito para que un
 * cron caído no deje a nadie sin aviso. Repite la promesa de acceso (PIN por email 10
 * min antes) porque este es el correo que el cliente relee camino a la sala.
 */
export function customerReminder(
  v: { name: string | null; when: string; parts?: SessionParts },
  ctx: BookingFoot & { address: string; mapsUrl: string; whatsappUrl: string; statusUrl: string },
): EmailContent {
  const html = dsShell({
    preheader: `${v.when} · ${ctx.address} · tu código llega por email 10 min antes`,
    status: ["Confirmada", "ok"],
    eyebrow: "Recordatorio",
    title: "Tu sesión se acerca",
    body: `${p(hola(v.name, `te esperamos el ${b(esc(v.when))}.`), "0 0 28px")}
${ticket([...sessionRows(v), placeRow(ctx)])}
${gap(12)}${callout(
      "Acceso",
      `Tu código de acceso te llega ${b("por email (y por WhatsApp si lo activaste) 10 minutos antes")}. Revisa spam. Entras solo, sin esperar a nadie.`,
    )}
${gap(28)}${steps("Lo que traes tú", [
      ["Audífonos", "Traes los tuyos."],
      ["Tu música en USB", null],
    ])}
${gap(4)}${cta("Cómo llegar", ctx.mapsUrl)}
${ghosts([["Ver mi reserva", ctx.statusUrl], ["¿Algo cambió?", ctx.whatsappUrl]])}`,
    footer: bookingFooter(ctx),
  });
  const text = `Tu sesión se acerca: ${v.when}. ${ctx.address}. Tu código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes (revisa spam). Trae tus audífonos y tu música en USB. Ver mi reserva: ${ctx.statusUrl}. ¿Algo cambió? ${ctx.whatsappUrl}`;
  return { template: "customerReminder", subject: `Tu sesión se acerca · ${v.when}`, html, text };
}

// ── Prueba del Curso de DJ ─────────────────────────────────────────────────
// Sesión GUIADA y vendida: no promete PIN ("te recibimos en la puerta") y recuerda el
// crédito para inscribirse. Los dos correos de seguimiento salen del barrido de 5 min.

export const GUIADA = "Es una sesión guiada: te recibimos en la puerta, no necesitas código.";

// ── Agenda del Curso de DJ (al agendar, mover o cancelar) ──────────────────
// Confirmaciones inmediatas, no recordatorios: el recordatorio de 24 h llega aparte (y no
// llega si se agenda con menos de ~14 h, así que estas son a veces el único aviso).

type SessionLine = { n: number; title: string; when: string; instructor: string | null };

const sessionLi = (s: SessionLine) =>
  `<li style="margin:0 0 8px"><strong>Sesión ${s.n} · ${esc(s.title)}</strong><br><span style="color:${T.boneDim}">${esc(s.when)}${s.instructor ? ` · con ${esc(s.instructor)}` : ""}</span></li>`;

/** Una o varias sesiones guiadas recién agendadas, en un solo correo. */
export function courseSessionsScheduled(
  v: { name: string | null; sessions: SessionLine[] },
  ctx: { address: string; mapsUrl: string; whatsappUrl: string; courseUrl: string },
): EmailContent {
  const one = v.sessions.length === 1;
  const title = one ? `Agendamos tu sesión ${v.sessions[0].n} del curso` : `Agendamos tus ${v.sessions.length} sesiones del curso`;
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">${title}</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "te")} esperamos en:</p>
     <ul style="padding-left:18px;margin:0 0 16px">${v.sessions.map(sessionLi).join("")}</ul>
     <p style="color:${T.boneDim};margin:0 0 16px">${place(ctx)}</p>
     <p style="color:${T.boneDim};margin:16px 0">${GUIADA} Trae tus audífonos y un USB con tu música.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">¿No puedes venir? Avísanos con 24 horas o más y la reagendamos sin costo.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver mi curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    v.sessions.map((s) => `Sesión ${s.n}: ${s.when}`).join(" · "),
  );
  const list = v.sessions.map((s) => `Sesión ${s.n} (${s.title}): ${s.when}${s.instructor ? `, con ${s.instructor}` : ""}`).join(". ");
  const text = `${title}. ${list}. ${ctx.address}. ${GUIADA} Trae tus audífonos y un USB con tu música. ¿No puedes venir? Avísanos con 24 horas o más y la reagendamos sin costo. Ver mi curso: ${ctx.courseUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "courseSessionsScheduled", subject: one ? `Sesión ${v.sessions[0].n} del curso agendada · ${v.sessions[0].when}` : `Tus ${v.sessions.length} sesiones del curso están agendadas`, html, text };
}

/** Una sesión guiada cambió de hora. */
export function courseSessionMoved(
  v: { name: string | null; n: number; title: string; before: string; after: string },
  ctx: { address: string; mapsUrl: string; whatsappUrl: string; courseUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Movimos tu sesión ${v.n} del curso</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tu")} sesión <strong style="color:${T.bone}">${esc(v.title)}</strong> cambió de horario.</p>
     <p style="color:${T.boneQuiet};margin:0 0 4px;text-decoration:line-through">${esc(v.before)}</p>
     <p style="margin:0 0 16px"><strong>${esc(v.after)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${place(ctx)}</p>
     <p style="color:${T.boneDim};margin:16px 0">${GUIADA}</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver mi curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Sesión ${v.n}: ahora ${v.after}`,
  );
  const text = `Movimos tu sesión ${v.n} del curso (${v.title}). Antes: ${v.before}. Ahora: ${v.after}. ${ctx.address}. ${GUIADA} Ver mi curso: ${ctx.courseUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "courseSessionMoved", subject: `Sesión ${v.n} del curso: nuevo horario · ${v.after}`, html, text };
}

/** Una sesión guiada se canceló (se reagenda conversando). */
export function courseSessionCancelled(
  v: { name: string | null; n: number; title: string; when: string },
  ctx: { whatsappUrl: string; courseUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Cancelamos tu sesión ${v.n} del curso</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tu")} sesión <strong style="color:${T.bone}">${esc(v.title)}</strong> del <strong style="color:${T.bone}">${esc(v.when)}</strong> quedó cancelada.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">No se pierde: la reagendamos contigo por WhatsApp en una fecha que te acomode.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver mi curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Sesión ${v.n} cancelada · la reagendamos contigo`,
  );
  const text = `Cancelamos tu sesión ${v.n} del curso (${v.title}) del ${v.when}. No se pierde: la reagendamos contigo por WhatsApp. Ver mi curso: ${ctx.courseUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "courseSessionCancelled", subject: `Sesión ${v.n} del curso cancelada · ${v.when}`, html, text };
}

/** Hora de práctica libre agendada: el alumno entra solo, con su PIN. */
export function practiceBooked(
  v: { name: string | null; when: string; hoursLeft: number },
  ctx: { address: string; mapsUrl: string; whatsappUrl: string; courseUrl: string },
): EmailContent {
  const quedan = v.hoursLeft === 1 ? "Te queda 1 hora" : `Te quedan ${v.hoursLeft} horas`;
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Agendamos tu práctica libre</h1>
     <p style="color:${T.boneDim};margin:0 0 8px">${hola(v.name, "la")} sala es tuya el <strong style="color:${T.bone}">${esc(v.when)}</strong>.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">${place(ctx)}</p>
     <p style="color:${T.boneDim};margin:16px 0">Entras solo: tu <strong style="color:${T.bone}">código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes</strong> (revisa spam).</p>
     <p style="color:${T.boneDim};margin:0 0 16px">${quedan} de práctica incluidas en tu curso.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver mi curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Práctica libre · ${v.when}`,
  );
  const text = `Agendamos tu práctica libre: ${v.when}. ${ctx.address}. Entras solo: tu código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes (revisa spam). ${quedan} de práctica incluidas en tu curso. Ver mi curso: ${ctx.courseUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "practiceBooked", subject: `Práctica libre agendada · ${v.when}`, html, text };
}

/** Hora de práctica movida a otro horario (la movió el estudio). Entra solo: PIN 10 min antes. */
export function practiceMoved(
  v: { name: string | null; before: string; after: string },
  ctx: { address: string; mapsUrl: string; whatsappUrl: string; courseUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Movimos tu práctica libre</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tu")} práctica cambió de horario. Las horas de tu saldo no cambian.</p>
     <p style="color:${T.boneQuiet};margin:0 0 4px;text-decoration:line-through">${esc(v.before)}</p>
     <p style="margin:0 0 16px"><strong>${esc(v.after)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${place(ctx)}</p>
     <p style="color:${T.boneDim};margin:16px 0">Entras solo: tu <strong style="color:${T.bone}">código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes del nuevo horario</strong> (revisa spam).</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver mi curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
    `Nuevo horario: ${v.after}`,
  );
  const text = `Movimos tu práctica libre. Antes: ${v.before}. Ahora: ${v.after}. ${ctx.address}. Las horas de tu saldo no cambian. Entras solo: tu código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes del nuevo horario (revisa spam). Ver mi curso: ${ctx.courseUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "practiceMoved", subject: `Práctica libre: nuevo horario · ${v.after}`, html, text };
}

/** Hora de práctica cancelada: vuelve al saldo. */
export function practiceReleased(
  v: { name: string | null; when: string; hoursLeft: number },
  ctx: { whatsappUrl: string; courseUrl: string },
): EmailContent {
  const quedan = v.hoursLeft === 1 ? "Te queda 1 hora" : `Te quedan ${v.hoursLeft} horas`;
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Cancelamos tu práctica libre</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tu")} práctica del <strong style="color:${T.bone}">${esc(v.when)}</strong> quedó cancelada y la hora volvió a tu saldo. ${quedan} de práctica.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver mi curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Práctica cancelada · ${quedan.toLowerCase()}`,
  );
  const text = `Cancelamos tu práctica libre del ${v.when}; la hora volvió a tu saldo. ${quedan} de práctica. Ver mi curso: ${ctx.courseUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "practiceReleased", subject: `Práctica libre cancelada · ${v.when}`, html, text };
}

/** Confirmación de una prueba pagada. */
export function trialConfirmation(
  v: BookingView & { creditDays: number },
  ctx: BookingFoot & {
    address: string;
    mapsUrl: string;
    whatsappUrl: string;
    links: { statusUrl: string; calendarUrl: string; accountUrl: string };
  },
): EmailContent {
  const html = dsShell({
    preheader: `${v.when} · ${ctx.address} · sesión guiada de 1 hora`,
    status: ["Confirmada", "ok"],
    eyebrow: "Curso de DJ · prueba",
    title: "Tu prueba está confirmada",
    body: `${p(hola(v.name, "te esperamos para tu sesión de prueba de 1 hora."), "0 0 28px")}
${ticket([...sessionRows(v), placeRow(ctx)])}
${gap(12)}${receipt(v.lines.map((l) => ({ description: esc(l.description), amount: esc(l.amount) })), esc(v.total))}
${gap(12)}${callout("Si te inscribes", `Si después te inscribes en el curso, ${b(`te descontamos los ${esc(v.total)}`)}: el descuento vale ${v.creditDays} días desde la prueba.`, "pending")}
${gap(32)}${steps("Qué sigue", [
      ["Agrégala a tu calendario", "Va adjunta como evento (.ics) en este correo."],
      ["Te recibimos en la puerta", GUIADA],
      ["Trae tus audífonos", "Y, si tienes, un USB con tu música."],
    ])}
${gap(12)}${cta("Agregar a mi calendario", ctx.links.calendarUrl)}
${ghosts([["Ver mi reserva", ctx.links.statusUrl], ["WhatsApp", ctx.whatsappUrl]])}`,
    footer: bookingFooter({ ...ctx, accountUrl: ctx.links.accountUrl }),
  });
  const text = `Tu prueba del Curso de DJ está confirmada: ${v.when}. ${ctx.address}. Total ${v.total} (IVA incl.). ${GUIADA} Trae tus audífonos y, si tienes, un USB con tu música. Si te inscribes en el curso te descontamos los ${v.total} (vale ${v.creditDays} días desde la prueba). Ver mi reserva: ${ctx.links.statusUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "trialConfirmation", subject: `Prueba del Curso de DJ confirmada · ${v.when}`, html, text };
}

/** Recordatorio ~24 h antes de la prueba (mismo barrido que el de la sala). */
export function trialReminder(
  v: { name: string | null; when: string },
  ctx: { address: string; mapsUrl: string; whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu prueba del Curso de DJ se acerca</h1>
     <p style="color:${T.boneDim};margin:0 0 8px">${hola(v.name, "te")} esperamos el <strong style="color:${T.bone}">${esc(v.when)}</strong>.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">${place(ctx)}</p>
     <p style="color:${T.boneDim};margin:16px 0">${GUIADA} Trae tus audífonos y, si tienes, un USB con tu música.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">¿No puedes venir? Avísanos con 24 horas o más y la cambiamos.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Prueba del Curso de DJ · ${v.when}`,
  );
  const text = `Tu prueba del Curso de DJ se acerca: ${v.when}. ${ctx.address}. ${GUIADA} Trae tus audífonos y, si tienes, un USB con tu música. ¿No puedes venir? Avísanos con 24 horas o más. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "trialReminder", subject: `Tu prueba del Curso de DJ se acerca · ${v.when}`, html, text };
}

/** El día después de la prueba: la invitación a inscribirse con el descuento vigente. */
export function trialFollowUp(
  v: { name: string | null; amount: string; expiresOn: string },
  ctx: { courseUrl: string; whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">¿Te animas con el curso?</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "gracias")} por venir a tu prueba. Si quieres seguir, armamos tu programa 1:1 con las fechas que te acomoden.</p>
     <p style="margin:0 0 16px">Tu descuento de <strong>${esc(v.amount)}</strong> vale hasta el <strong>${esc(v.expiresOn)}</strong>.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver el curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Tu descuento de ${v.amount} vale hasta el ${v.expiresOn}`,
  );
  const text = `¿Te animas con el curso? Gracias por venir a tu prueba. Tu descuento de ${v.amount} vale hasta el ${v.expiresOn}. Ver el curso: ${ctx.courseUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "trialFollowUp", subject: `¿Te animas con el curso? Tu descuento vale hasta el ${v.expiresOn}`, html, text };
}

/** Dos días antes de que venza el crédito de la prueba. */
export function trialCreditExpiring(
  v: { name: string | null; amount: string; expiresOn: string },
  ctx: { courseUrl: string; whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu descuento del curso vence pronto</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "te")} recordamos que tu descuento de <strong style="color:${T.bone}">${esc(v.amount)}</strong> en el Curso de DJ vale hasta el <strong style="color:${T.bone}">${esc(v.expiresOn)}</strong>.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">Escríbenos y armamos tu programa con las fechas que te acomoden.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver el curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Tu descuento de ${v.amount} vence el ${v.expiresOn}`,
  );
  const text = `Tu descuento de ${v.amount} en el Curso de DJ vale hasta el ${v.expiresOn}. Escríbenos y armamos tu programa. Ver el curso: ${ctx.courseUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "trialCreditExpiring", subject: `Tu descuento del Curso de DJ vence el ${v.expiresOn}`, html, text };
}

/** La prueba del curso cambió de hora (la movió el estudio). Guiada: sin PIN. */
export function trialRescheduled(
  v: { name: string | null; before: string; after: string },
  ctx: { address: string; mapsUrl: string; whatsappUrl: string; calendarUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu prueba del Curso de DJ tiene nuevo horario</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "movimos")} tu sesión de prueba de 1 hora.</p>
     <p style="color:${T.boneQuiet};margin:0 0 4px;text-decoration:line-through">${esc(v.before)}</p>
     <p style="margin:0 0 16px"><strong>${esc(v.after)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${place(ctx)}</p>
     <p style="color:${T.boneDim};margin:16px 0">${GUIADA} Trae tus audífonos y, si tienes, un USB con tu música.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.calendarUrl)}" style="color:${T.gold};font-weight:bold">Actualizar en mi calendario</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
    `Nuevo horario: ${v.after}`,
  );
  const text = `Movimos tu prueba del Curso de DJ. Antes: ${v.before}. Ahora: ${v.after}. ${ctx.address}. ${GUIADA} Trae tus audífonos y, si tienes, un USB con tu música. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "trialRescheduled", subject: `Prueba del Curso de DJ: nuevo horario · ${v.after}`, html, text };
}

/**
 * Pago duplicado: la orden YA estaba pagada (p. ej. marcada en efectivo) y el cliente
 * igual pagó el link de MP. La guardia no tocó nada; el dueño tiene que devolver ESTE
 * pago desde el panel de Mercado Pago. Sirena: hay plata del cliente que no corresponde.
 */
export function ownerDuplicatePayment(
  v: { when: string; email: string | null; paymentId: string; amount: string; storedMethod: string | null },
): EmailContent {
  const already = v.storedMethod ? ` por ${esc(v.storedMethod)}` : "";
  const html = dsShell({
    preheader: `La reserva ya estaba pagada${v.storedMethod ? ` por ${v.storedMethod}` : ""}.`,
    status: ["Devolver", "danger"],
    eyebrow: "Para el estudio",
    title: "Pago duplicado — devolver",
    body: `${p(`Llegó un pago de Mercado Pago para una reserva que ${b(`ya estaba pagada${already}`)}. No se registró: hay que ${b("devolverlo desde el panel de Mercado Pago")}.`, "0 0 24px")}
${ticket([
      { label: "Devolver", value: toned(esc(v.amount), "danger", true), accent: "danger" },
      { label: "Pago MP", value: `#${esc(v.paymentId)}` },
      { label: "Reserva", value: esc(v.when) },
      { label: "Cliente", value: contact(v.email) },
    ])}
${gap(28)}${cta("Devolver en Mercado Pago", MP_ACTIVITIES)}`,
    footer: "owner",
  });
  const text = `PAGO DUPLICADO — devolver. Reserva ${v.when}, ya pagada${v.storedMethod ? ` por ${v.storedMethod}` : ""}. Cliente ${v.email ?? "?"}. Pago MP #${v.paymentId}, ${v.amount}. Devolverlo desde el panel de Mercado Pago: ${MP_ACTIVITIES}`;
  return { template: "ownerDuplicatePayment", subject: `Acción requerida · Pago duplicado · devolver ${v.amount} · ${v.when}`, html, text };
}

/**
 * Recordatorio de una sesión GUIADA del curso (lo dispara el mismo barrido que el de
 * la sala). Distinto del de la sala a propósito: es una clase, así que no dice "entras
 * solo, sin esperar a nadie"; nombra la sesión y a quien la dicta, y recuerda la regla
 * de las 24 h de los términos para reagendar sin costo.
 */
export function courseSessionReminder(
  v: { name: string | null; when: string; n: number; title: string; instructor: string | null },
  ctx: { address: string; mapsUrl: string; whatsappUrl: string; courseUrl: string },
): EmailContent {
  const sesion = `Sesión ${v.n} · ${v.title}`;
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu sesión ${v.n} del curso se acerca</h1>
     <p style="color:${T.boneDim};margin:0 0 8px">${hola(v.name, "te")} esperamos el <strong style="color:${T.bone}">${esc(v.when)}</strong>.</p>
     <p style="margin:0 0 16px"><strong>${esc(sesion)}</strong></p>
     ${v.instructor ? `<p style="color:${T.boneDim};margin:0 0 16px">${esc(v.instructor)} te espera en la sala.</p>` : ""}
     <p style="color:${T.boneDim};margin:0 0 16px">${place(ctx)}</p>
     <p style="color:${T.boneDim};margin:16px 0">Es una sesión guiada: <strong style="color:${T.bone}">te recibimos en la puerta</strong>, no necesitas código. Trae tus audífonos y un USB con tu música.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">¿No puedes venir? Avísanos con 24 horas o más y la reagendamos sin costo.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.courseUrl)}" style="color:${T.gold};font-weight:bold">Ver mi curso</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `${sesion} · ${v.when}`,
  );
  const text = `Tu sesión ${v.n} del curso se acerca: ${v.when}. ${sesion}.${v.instructor ? ` ${v.instructor} te espera en la sala.` : ""} ${ctx.address}. Es una sesión guiada: te recibimos en la puerta, no necesitas código. Trae tus audífonos y un USB con tu música. ¿No puedes venir? Avísanos con 24 horas o más y la reagendamos sin costo. Ver mi curso: ${ctx.courseUrl}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "courseSessionReminder", subject: `Tu sesión ${v.n} del curso se acerca · ${v.when}`, html, text };
}

/**
 * Email al cliente: su pago se aprobó pero el horario ya no estaba reservado
 * (`paid_no_hold`). Antes no recibía NADA — plata fuera, cero correo — mientras el
 * dueño recibía la alerta. Reconoce el pago, dice la verdad y promete WhatsApp; no
 * promete la sala ni dice "confirmada" (eso lo decide el dueño: devolver o reasignar).
 */
export function customerPaymentNoSlot(
  v: { name: string | null; when: string; total: string },
  ctx: BookingFoot & { whatsappUrl: string },
): EmailContent {
  const html = dsShell({
    preheader: `${v.total} · el horario ya no estaba disponible. Otro horario o devolución completa.`,
    status: ["En revisión", "pending"],
    eyebrow: "Pago recibido",
    title: "Recibimos tu pago",
    body: `${p(hola(v.name, `recibimos tu pago de ${b(mono(esc(v.total)))}, pero ese horario ya no estaba disponible cuando llegó el pago.`), "0 0 28px")}
${ticket([
      { label: "Pedido", value: esc(v.when), strike: true },
      { label: "Pagado", value: esc(v.total) },
    ])}
${gap(28)}${steps("Qué pasa ahora", [
      ["Te escribimos por WhatsApp en breve", null],
      ["Eliges otro horario o te devolvemos el pago completo", null],
    ])}
${gap(4)}${cta("Adelantarme por WhatsApp", ctx.whatsappUrl)}`,
    footer: bookingFooter(ctx),
  });
  const text = `Recibimos tu pago de ${v.total} para el ${v.when}, pero ese horario ya no estaba disponible cuando llegó el pago. Te escribimos por WhatsApp en breve para darte otro horario o devolverte el pago completo: ${ctx.whatsappUrl}`;
  return { template: "customerPaymentNoSlot", subject: `Recibimos tu pago · ${v.when} · te escribimos por WhatsApp`, html, text };
}

/**
 * Email al cliente: una reserva pendiente de pago (link de 72 h) venció y el horario
 * se liberó. Antes recibía "Tu hora está tomada — falta el pago" y después silencio.
 */
export function customerHoldExpired(
  v: { name: string | null; when: string; parts?: SessionParts },
  ctx: BookingFoot & { whatsappUrl: string; bookUrl: string },
): EmailContent {
  const html = dsShell({
    preheader: "No recibimos el pago y el horario volvió a quedar disponible.",
    status: ["Anulada", "neutral"],
    eyebrow: "Reserva sin pago",
    title: "Se liberó tu hora",
    body: `${p(hola(v.name, "no recibimos el pago de tu reserva, así que el horario volvió a quedar disponible para todos."), "0 0 28px")}
${ticket(sessionRows(v).map((r) => ({ ...r, strike: true })))}
${gap(28)}${p("Si aún quieres la sesión, reserva de nuevo o escríbenos y te ayudamos.", "0 0 24px")}
${cta("Reservar de nuevo", ctx.bookUrl)}
${ghosts([["Escríbenos por WhatsApp", ctx.whatsappUrl]])}`,
    footer: bookingFooter(ctx),
  });
  const text = `No recibimos el pago de tu reserva del ${v.when}, así que el horario volvió a quedar disponible. Si aún quieres la sesión, reserva de nuevo: ${ctx.bookUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerHoldExpired", subject: `Se liberó tu hora · ${v.when}`, html, text };
}

/** Email al cliente: su sesión de CORTESÍA fue cancelada. Sin dinero de por medio. */
export function customerCourtesyCancelled(
  v: { name: string | null; when: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Sesión cancelada</h1>
     <p style="color:${T.boneDim};margin:0 0 20px">${hola(v.name, "tu")} sesión del <strong style="color:${T.bone}">${esc(v.when)}</strong> fue cancelada. Si quieres otro horario, escríbenos y lo vemos.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Tu sesión del ${v.when} fue cancelada. Si quieres otro horario: ${ctx.whatsappUrl}`;
  return { template: "customerCourtesyCancelled", subject: `Sesión cancelada · ${v.when}`, html, text };
}

/** Email al cliente: su reserva fue cancelada (con o sin reembolso). */
export function customerCancellation(
  v: { name: string | null; when: string; refunded: string | null; restoredPoints?: number | null; parts?: SessionParts },
  ctx: BookingFoot & { whatsappUrl: string; bookUrl?: string },
): EmailContent {
  // Orden pagada 100% con puntos: no hubo cobro, se reponen puntos (nada de "tarjeta").
  const pts = v.restoredPoints && v.restoredPoints > 0 ? fmtBeatcoins(v.restoredPoints) : null;
  const money: TicketRow[] = pts
    ? [{ label: "Repuestos", value: esc(pts), accent: "ok" }]
    : v.refunded
      ? [{ label: "Reembolso", value: esc(v.refunded), accent: "ok" }]
      : [];
  const refundLine = pts
    ? p(`Te repusimos ${b(esc(pts))} en tu cuenta.`, "0 0 28px")
    : v.refunded
      ? p("Te reembolsamos al medio de pago original. Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.", "0 0 28px")
      : gap(28);
  const html = dsShell({
    preheader: pts ? `Te repusimos ${pts}.` : v.refunded ? `Te reembolsamos ${v.refunded} al medio de pago original.` : `Sesión del ${v.when}`,
    status: ["Cancelada", "neutral"],
    eyebrow: "Tu reserva",
    title: "Reserva cancelada",
    body: `${p(hola(v.name, "tu sesión fue cancelada."), "0 0 28px")}
${ticket([...sessionRows(v).map((r) => ({ ...r, strike: true })), ...money])}
${gap(12)}${refundLine}
${ctx.bookUrl ? `${cta("Reservar otra hora", ctx.bookUrl)}\n${ghosts([["¿Dudas? WhatsApp", ctx.whatsappUrl]])}` : cta("¿Dudas? Escríbenos por WhatsApp", ctx.whatsappUrl)}`,
    footer: bookingFooter(ctx),
  });
  const textLine = pts
    ? ` Te repusimos ${pts} en tu cuenta.`
    : v.refunded
      ? ` Te reembolsamos ${v.refunded} al medio de pago original.`
      : "";
  const text = `Tu reserva del ${v.when} fue cancelada.${textLine}${ctx.bookUrl ? ` Reservar otra hora: ${ctx.bookUrl}.` : ""} ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerCancellation", subject: `Reserva cancelada · ${v.when}`, html, text };
}

export function customerReschedule(
  v: { name: string | null; when: string; refunded: string | null; refundedOffline: boolean; oldWhen?: string | null; parts?: SessionParts },
  ctx: BookingFoot & { whatsappUrl: string; address: string; mapsUrl: string; calendarUrl: string },
): EmailContent {
  const refundLine = v.refunded
    ? v.refundedOffline
      ? p(`Como el nuevo horario cuesta menos, coordinamos contigo la devolución de ${b(esc(v.refunded))} (pagaste en efectivo/transferencia).`, "0 0 28px")
      : p(`Como el nuevo horario cuesta menos, te reembolsamos ${b(esc(v.refunded))} al medio de pago original. Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.`, "0 0 28px")
    : gap(16);
  const now = v.parts ? `${v.parts.date} · ${v.parts.time}` : v.when;
  const html = dsShell({
    preheader: `Nuevo horario: ${v.when}`,
    status: ["Reagendada", "ok"],
    eyebrow: "Cambio de horario",
    title: "Reserva reagendada",
    body: `${p(hola(v.name, "tu sesión quedó reagendada."), "0 0 28px")}
${ticket([
      ...(v.oldWhen ? [{ label: "Antes", value: esc(v.oldWhen), strike: true }] : []),
      { label: "Ahora", value: esc(now), accent: "ok" as const },
      placeRow(ctx),
    ])}
${gap(12)}${callout("Acceso", "Tu código de acceso te llega por email 10 minutos antes del nuevo horario.")}
${gap(12)}${refundLine}
${cta("Actualizar en mi calendario", ctx.calendarUrl)}
${ghosts([["¿Dudas? WhatsApp", ctx.whatsappUrl]])}`,
    footer: bookingFooter(ctx),
  });
  const refundTextLine = v.refunded
    ? v.refundedOffline
      ? ` Coordinamos contigo la devolución de ${v.refunded} (pagaste en efectivo/transferencia).`
      : ` Te reembolsamos ${v.refunded} al medio de pago original.`
    : "";
  const text = `Tu reserva quedó reagendada para el ${v.when}.${refundTextLine} Tu código de acceso te llega por email 10 minutos antes del nuevo horario. Te esperamos en ${ctx.address}. Actualizar en mi calendario: ${ctx.calendarUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerReschedule", subject: `Reserva reagendada · ahora ${v.when}`, html, text };
}

/** Email al cliente: su sesión de CORTESÍA cambió de horario. Sin dinero de por medio (sin línea de reembolso). */
export function customerCourtesyRescheduled(
  v: { name: string | null; oldWhen: string; when: string },
  ctx: { whatsappUrl: string; address: string; mapsUrl: string; calendarUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Sesión reagendada</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tu")} sesión del <strong style="color:${T.bone}">${esc(v.oldWhen)}</strong> quedó reagendada para el <strong style="color:${T.bone}">${esc(v.when)}</strong>.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Te esperamos en ${place(ctx)}.</p>
     <p style="margin:0 0 20px"><a href="${esc(ctx.calendarUrl)}" style="color:${T.gold};font-weight:bold">Actualizar en mi calendario</a></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
    `Nuevo horario: ${v.when}`,
  );
  const text = `Tu sesión del ${v.oldWhen} quedó reagendada para el ${v.when}. Te esperamos en ${ctx.address}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerCourtesyRescheduled", subject: `Sesión reagendada · ${v.when}`, html, text };
}

/**
 * Email al cliente cuando el cobro de un reagendamiento se devolvió sin aplicarse.
 * `kept` distingue dos historias reales (FR2, auditoría 2026-09-14):
 *  - true (el caso típico): el slot pedido ya estaba tomado — la reserva original
 *    SIGUE viva en su horario de siempre.
 *  - false: la reserva ya estaba cancelada cuando llegó el pago del cambio de
 *    horario (`reservation_gone`/`charge_void` tras cancelarla, o un reembolso
 *    manual sobre un cobro que ya no aplica) — decir "mantuvimos tu reserva" acá
 *    sería falso, así que cambia el h1/cuerpo/asunto entero (mismo `template` name:
 *    el pin de nombres de plantilla sigue verde).
 */
export function customerRescheduleFailed(
  v: { name: string | null; when: string; refunded: string; kept: boolean },
  ctx: BookingFoot & { whatsappUrl: string },
): EmailContent {
  const devuelto: TicketRow = { label: "Devuelto", value: `${esc(v.refunded)} ${quiet("· medio de pago original")}` };
  if (!v.kept) {
    const html = dsShell({
      preheader: `Te devolvimos ${v.refunded}.`,
      status: ["Devuelto", "neutral"],
      eyebrow: "Cambio de horario",
      title: "Devolvimos el cobro del cambio de horario",
      body: `${p(`Tu reserva ya estaba cancelada cuando llegó el pago del cambio de horario, así que te devolvimos ${b(esc(v.refunded))} al medio de pago original.`, "0 0 28px")}
${ticket([devuelto])}
${gap(28)}${cta("Escríbenos si tienes dudas", ctx.whatsappUrl)}
${fine("Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.")}`,
      footer: bookingFooter(ctx),
    });
    const text = `Tu reserva ya estaba cancelada cuando llegó el pago del cambio de horario, así que te devolvimos ${v.refunded} al medio de pago original (si pagaste con tarjeta, el abono puede tardar unos días). Escríbenos: ${ctx.whatsappUrl}`;
    return { template: "customerRescheduleFailed", subject: `Te devolvimos ${v.refunded} · cambio de horario`, html, text };
  }
  const html = dsShell({
    preheader: `Te devolvimos ${v.refunded}. Tu reserva original sigue en pie.`,
    status: ["Sin cambios", "neutral"],
    eyebrow: "Cambio de horario",
    title: "No pudimos cambiar tu horario",
    body: `${p(hola(v.name, `el horario que pediste ya estaba tomado cuando se procesó el pago. Mantuvimos tu reserva original del ${b(esc(v.when))}.`), "0 0 28px")}
${ticket([{ label: "Se mantiene", value: esc(v.when), accent: "ok" }, devuelto])}
${gap(28)}${cta("Escríbenos para elegir otro horario", ctx.whatsappUrl)}
${fine("Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.")}`,
    footer: bookingFooter(ctx),
  });
  const text = `No pudimos moverte de horario (ya estaba tomado). Mantuvimos tu reserva del ${v.when} y te devolvimos ${v.refunded}. Escríbenos: ${ctx.whatsappUrl}`;
  return { template: "customerRescheduleFailed", subject: `No pudimos cambiar tu horario · se mantiene ${v.when}`, html, text };
}

/**
 * Email al cliente: el nuevo horario de un reagendamiento cuesta más — falta pagar el
 * excedente. La reserva sigue en su horario ORIGINAL hasta que pague (mismo patrón que
 * `bookingPaymentPending`); `oldWhen` dice qué horario se mantiene mientras tanto.
 */
export function customerReschedulePaymentLink(
  v: { name: string | null; oldWhen: string; newWhen: string; amount: string; initPoint: string; expiresInHours: number },
  ctx: BookingFoot & { whatsappUrl: string; termsUrl: string },
): EmailContent {
  const html = dsShell({
    preheader: `El link vence en ${v.expiresInHours} h; mientras tanto se mantiene tu horario actual.`,
    status: ["Falta pagar", "pending"],
    eyebrow: "Cambio de horario",
    title: "Confirma tu nuevo horario",
    body: `${p(hola(v.name, `pediste mover tu sesión. El nuevo horario cuesta ${b(mono(esc(v.amount)))} más.`), "0 0 28px")}
${ticket([
      { label: "Actual", value: esc(v.oldWhen) },
      { label: "Nuevo", value: esc(v.newWhen), accent: "pending" },
      { label: "Diferencia", value: esc(v.amount) },
      { label: "Vence en", value: toned(`${v.expiresInHours} h`, "pending") },
    ])}
${gap(12)}${p("Tu reserva se mueve sola apenas pagues la diferencia. Mientras tanto se mantiene tu horario actual.", "0 0 28px")}
${cta(`Pagar la diferencia · ${esc(v.amount)}`, v.initPoint)}
${fine(`Aplican los ${a("términos de reagendamiento", ctx.termsUrl, D.text2)}. ¿Dudas? ${a("WhatsApp", ctx.whatsappUrl, D.text2)}.`)}`,
    footer: bookingFooter(ctx),
  });
  const text = `Pediste mover tu sesión del ${v.oldWhen} al ${v.newWhen}. Cuesta ${v.amount} más; paga aquí y la reserva se mueve sola: ${v.initPoint} (vence en ${v.expiresInHours} h). Mientras tanto se mantiene tu horario actual. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerReschedulePaymentLink", subject: `Confirma tu nuevo horario · ${v.newWhen} · falta pagar ${v.amount}`, html, text };
}

/**
 * Email al cliente: cuántos Puntos FOTF tiene. Lo dispara el dueño a mano desde la
 * ficha del cliente, así que no cuelga de una reserva ni de un cron: no lleva `when`
 * ni nada de la sesión. `value` es la equivalencia en pesos —1 punto = $1, por eso
 * se puede afirmar sin conversión—. Sin Sirena: acá no hay urgencia, hay un saldo.
 */
export function customerPointsBalance(
  v: { name: string | null; points: string; value: string },
  ctx: { whatsappUrl: string; bookUrl: string; accountUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tienes ${esc(v.points)} Beatcoins</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tus")} Beatcoins equivalen a <strong style="color:${T.bone}">${esc(v.value)}</strong> de descuento en tu próxima sesión.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Ganas 5% de vuelta en cada sesión que pagas, y los canjeas al reservar.</p>
     <a href="${esc(ctx.bookUrl)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Reservar mi hora</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0">Tu saldo y tus movimientos, en <a href="${esc(ctx.accountUrl)}" style="color:${T.gold}">tu cuenta</a>. ¿Dudas? <a href="${ctx.whatsappUrl}" style="color:${T.gold}">WhatsApp</a>.</p>`,
    `Equivalen a ${v.value} de descuento en tu próxima sesión.`,
  );
  const text = `Tienes ${v.points} Beatcoins: equivalen a ${v.value} de descuento en tu próxima sesión. Ganas 5% de vuelta en cada sesión que pagas, y los canjeas al reservar. Reservar: ${ctx.bookUrl}. Tu saldo y tus movimientos: ${ctx.accountUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "customerPointsBalance", subject: `Tienes ${v.points} Beatcoins`, html, text };
}

/**
 * Link de campaña con UTMs: sin ellos, una reserva que llega desde un correo de
 * Beatcoins se ve en GA4 como tráfico directo. `campaign` = nombre de la plantilla.
 */
export const campaignUrl = (url: string, campaign: string): string => {
  const u = new URL(url);
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "beatcoins");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
};

/**
 * Aviso de cuenta (transaccional, sin baja): parte del saldo vence en ≤ 30 o ≤ 7 días.
 * Dice cuánto vence, cuándo, cuánto queda sin vencer y que cualquier reserva reinicia
 * el reloj —el motivo del correo—. Sin Sirena: es un recordatorio, no una alarma.
 */
export function beatcoinsExpiring(
  v: { name: string | null; expiring: string; value: string; expiresOn: string; permanent: string | null },
  ctx: { whatsappUrl: string; bookUrl: string; accountUrl: string },
): EmailContent {
  const book = campaignUrl(ctx.bookUrl, "beatcoinsExpiring");
  const account = campaignUrl(ctx.accountUrl, "beatcoinsExpiring");
  const keep = v.permanent ? ` Tus otros ${esc(v.permanent)} Beatcoins no vencen.` : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tus ${esc(v.expiring)} Beatcoins vencen el ${esc(v.expiresOn)}</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "te")} quedan <strong style="color:${T.bone}">${esc(v.expiring)} Beatcoins</strong> (equivalen a <strong style="color:${T.bone}">${esc(v.value)}</strong> de descuento) que vencen el <strong style="color:${T.bone}">${esc(v.expiresOn)}</strong>.${keep}</p>
     <p style="color:${T.boneDim};margin:0 0 20px"><strong style="color:${T.bone}">Cualquier reserva pagada reinicia el plazo</strong>: tus Beatcoins vuelven a valer 12 meses. Y puedes usarlos para pagar esa misma hora.</p>
     <a href="${esc(book)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Reservar mi hora</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0">Tu saldo y tus movimientos, en <a href="${esc(account)}" style="color:${T.gold}">tu cuenta</a>. ¿Dudas? <a href="${ctx.whatsappUrl}" style="color:${T.gold}">WhatsApp</a>.</p>`,
    `${v.value} de descuento que vence el ${v.expiresOn}. Una reserva reinicia el plazo.`,
  );
  const text = `Tus ${v.expiring} Beatcoins (${v.value} de descuento) vencen el ${v.expiresOn}.${v.permanent ? ` Tus otros ${v.permanent} Beatcoins no vencen.` : ""} Cualquier reserva pagada reinicia el plazo: tus Beatcoins vuelven a valer 12 meses, y puedes usarlos para pagar esa misma hora. Reservar: ${book}. Tu cuenta: ${account}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "beatcoinsExpiring", subject: `Tus ${v.expiring} Beatcoins vencen el ${v.expiresOn}`, html, text };
}

/**
 * Anuncio del cambio de términos (vencimiento), una vez por cliente con saldo. Es aviso de
 * cambio de condiciones → transaccional. Lo que más importa decir: SUS Beatcoins de hoy no
 * vencen, y lo que gane antes del corte tampoco (el empujón a reservar ya).
 */
export function beatcoinsLaunch(
  v: { name: string | null; balance: string; value: string; from: string },
  ctx: { whatsappUrl: string; bookUrl: string; termsUrl: string },
): EmailContent {
  const book = campaignUrl(ctx.bookUrl, "beatcoinsLaunch");
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tus ${esc(v.balance)} Beatcoins no vencen</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tienes")} <strong style="color:${T.bone}">${esc(v.balance)} Beatcoins</strong>: equivalen a <strong style="color:${T.bone}">${esc(v.value)}</strong> de descuento en tus próximas horas.</p>
     <p style="color:${T.boneDim};margin:0 0 16px">Cambia una regla del programa: desde el <strong style="color:${T.bone}">${esc(v.from)}</strong>, los Beatcoins que ganes vencen <strong style="color:${T.bone}">12 meses después de tu última reserva pagada</strong>. Cada reserva reinicia el plazo, y te avisamos por correo 30 y 7 días antes.</p>
     <p style="color:${T.boneDim};margin:0 0 20px"><strong style="color:${T.bone}">Lo que ya tienes no vence nunca</strong>, y lo que ganes en reservas pagadas antes del ${esc(v.from)}, tampoco.</p>
     <a href="${esc(book)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Reservar mi hora</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0">El detalle, en los <a href="${esc(ctx.termsUrl)}" style="color:${T.gold}">términos y condiciones</a>. ¿Dudas? <a href="${ctx.whatsappUrl}" style="color:${T.gold}">WhatsApp</a>.</p>`,
    `Lo que ya tienes no vence nunca. Cambia una regla desde el ${v.from}.`,
  );
  const text = `Tus ${v.balance} Beatcoins no vencen. Equivalen a ${v.value} de descuento en tus próximas horas. Cambia una regla del programa: desde el ${v.from}, los Beatcoins que ganes vencen 12 meses después de tu última reserva pagada; cada reserva reinicia el plazo y te avisamos 30 y 7 días antes. Lo que ya tienes no vence nunca, y lo que ganes en reservas pagadas antes del ${v.from}, tampoco. Reservar: ${book}. Términos: ${ctx.termsUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "beatcoinsLaunch", subject: `Tus ${v.balance} Beatcoins no vencen: cambio en el programa`, html, text };
}

/**
 * Resumen mensual (promocional, opt-out): saldo, a cuánto equivale, qué vence y cuándo, y
 * la baja de un clic. El mes va en el asunto para que cada resumen sea su propio hilo.
 */
export function beatcoinsDigest(
  v: { name: string | null; month: string; balance: string; value: string; expiry: string | null },
  ctx: { whatsappUrl: string; bookUrl: string; accountUrl: string; unsubscribeUrl: string },
): EmailContent {
  const book = campaignUrl(ctx.bookUrl, "beatcoinsDigest");
  const account = campaignUrl(ctx.accountUrl, "beatcoinsDigest");
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tienes ${esc(v.balance)} Beatcoins</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "tus")} Beatcoins equivalen a <strong style="color:${T.bone}">${esc(v.value)}</strong> de descuento: puedes pagar con ellos hasta el 100% de tu hora.</p>
     ${v.expiry ? `<p style="color:${T.boneDim};margin:0 0 16px">${esc(v.expiry)}</p>` : ""}
     <p style="color:${T.boneDim};margin:0 0 20px">Cada sesión que pagas te devuelve el 5% en Beatcoins.</p>
     <a href="${esc(book)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Reservar mi hora</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0">Tus movimientos, en <a href="${esc(account)}" style="color:${T.gold}">tu cuenta</a>. ¿Dudas? <a href="${ctx.whatsappUrl}" style="color:${T.gold}">WhatsApp</a>.</p>
     <p style="color:${T.boneQuiet};font-size:12px;margin:24px 0 0">Te llega una vez al mes porque tienes Beatcoins. <a href="${esc(ctx.unsubscribeUrl)}" style="color:${T.boneQuiet}">Dejar de recibir este resumen</a>.</p>`,
    `Equivalen a ${v.value} de descuento.${v.expiry ? ` ${v.expiry}` : ""}`,
  );
  const text = `Tienes ${v.balance} Beatcoins: equivalen a ${v.value} de descuento.${v.expiry ? ` ${v.expiry}` : ""} Cada sesión que pagas te devuelve el 5%. Reservar: ${book}. Tu cuenta: ${account}. ¿Dudas? ${ctx.whatsappUrl}. Dejar de recibir este resumen: ${ctx.unsubscribeUrl}`;
  return { template: "beatcoinsDigest", subject: `Tu resumen de Beatcoins · ${v.month}`, html, text };
}

/** Aviso de cuenta: venció parte del saldo. Qué venció, qué queda y cómo volver a ganar. */
export function beatcoinsExpired(
  v: { name: string | null; expired: string; remaining: string | null },
  ctx: { whatsappUrl: string; bookUrl: string; accountUrl: string },
): EmailContent {
  const book = campaignUrl(ctx.bookUrl, "beatcoinsExpired");
  const account = campaignUrl(ctx.accountUrl, "beatcoinsExpired");
  const left = v.remaining
    ? `Te quedan <strong style="color:${T.bone}">${esc(v.remaining)} Beatcoins</strong> que no vencen.`
    : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Vencieron ${esc(v.expired)} Beatcoins</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${hola(v.name, "pasaron")} 12 meses desde tu última reserva y vencieron ${esc(v.expired)} Beatcoins. ${left}</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Vuelves a ganar el 5% de lo que pagas en cada sesión. Te esperamos en la sala.</p>
     <a href="${esc(book)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Reservar mi hora</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:24px 0 0">Tus movimientos, en <a href="${esc(account)}" style="color:${T.gold}">tu cuenta</a>. ¿Dudas? <a href="${ctx.whatsappUrl}" style="color:${T.gold}">WhatsApp</a>.</p>`,
    `Vuelves a ganar el 5% en cada sesión.`,
  );
  const text = `Vencieron ${v.expired} Beatcoins: pasaron 12 meses desde tu última reserva.${v.remaining ? ` Te quedan ${v.remaining} Beatcoins que no vencen.` : ""} Vuelves a ganar el 5% de lo que pagas en cada sesión. Reservar: ${book}. Tu cuenta: ${account}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "beatcoinsExpired", subject: `Vencieron ${v.expired} Beatcoins`, html, text };
}

/**
 * Email al dueño: un pago se aprobó pero el horario ya no estaba reservado (el hold
 * venció antes de que llegara el pago). Requiere acción manual: refund o reasignar.
 * Sirena (${T.sirena}) es legítima aquí: es urgencia real, no decoración.
 */
export function ownerNeedsReview(
  v: { when: string; total: string; email: string | null; paymentId: string; adminUrl?: string },
): EmailContent {
  const html = dsShell({
    preheader: "El hold venció antes del pago. Devolver o reasignar.",
    status: ["Acción requerida", "danger"],
    eyebrow: "Para el estudio",
    title: "Pago sin reserva — revisar",
    body: `${p(`Se aprobó un pago pero el horario ya no estaba reservado (el hold venció antes del pago). Hay que ${b("devolver o reasignar")}.`, "0 0 24px")}
${ticket([
      { label: "Horario", value: esc(v.when) },
      { label: "Cliente", value: contact(v.email) },
      { label: "Pago", value: esc(v.paymentId) },
      { label: "Total", value: esc(v.total) },
    ])}
${gap(28)}${steps("Por hacer", [
      ["Escribirle al cliente por WhatsApp", v.email ? "Ya recibió un correo que se lo avisa." : null],
      ["Reasignar otro horario o devolver el pago", null],
    ])}
${v.adminUrl ? `${gap(4)}${cta("Abrir la reserva", v.adminUrl)}` : ""}`,
    footer: "owner",
  });
  const text = `PAGO SIN RESERVA — revisar. Horario ${v.when}. Cliente ${v.email ?? "?"}. Pago ${v.paymentId}, total ${v.total}. Devolver o reasignar.${v.adminUrl ? ` ${v.adminUrl}` : ""}`;
  return { template: "ownerNeedsReview", subject: `Acción requerida · pago sin reserva · ${v.total} · ${v.when}`, html, text };
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
 * listo— sin abrir el panel. Sin conteo de cupos: el curso es 1:1, cada
 * inscripción abre su propio programa.
 */
export function ownerNewCourseLead(v: CourseLeadInput): EmailContent {
  const waDigits = v.phone.replace(/\D/g, "");
  const plan = LEAD_PLAN_LABELS[v.plan];
  const nivel = EXPERIENCE_LABELS[v.experience];
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Nueva solicitud del curso</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.name)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Email: <a href="mailto:${esc(v.email)}" style="color:${T.gold}">${esc(v.email)}</a></p>
     <p style="color:${T.boneDim};margin:0 0 16px">WhatsApp: <a href="https://wa.me/${esc(waDigits)}" style="color:${T.gold}">${esc(v.phone)}</a></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Le interesa: <strong style="color:${T.bone}">${esc(plan)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Parte desde: <strong style="color:${T.bone}">${esc(nivel)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 4px">Disponibilidad: <strong style="color:${T.bone}">${esc(v.availability)}</strong></p>
     ${v.message ? `<p style="color:${T.boneDim};margin:16px 0 4px">Mensaje:</p><p style="background:${T.inkSoft};padding:10px 12px;margin:0;color:${T.bone};white-space:pre-wrap">${esc(v.message)}</p>` : ""}`,
  );
  const msgText = v.message ? `\n\n${v.message}` : "";
  const text = `Nueva solicitud del curso: ${v.name}. Le interesa: ${plan}. Parte desde: ${nivel}. Disponibilidad: ${v.availability}. Email ${v.email}. WhatsApp https://wa.me/${waDigits}.${msgText}`;
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
     <p style="color:${T.boneDim};margin:0 0 16px">Gracias, ${esc(v.name)}. Revisamos cada solicitud a mano y te escribimos por WhatsApp para coordinar tus fechas.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Si prefieres adelantarlo, escríbenos directo y lo vemos al tiro.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Recibimos tu solicitud del Curso de Iniciación DJ, ${v.name}. Revisamos cada una a mano y te escribimos por WhatsApp para coordinar tus fechas. Si prefieres adelantarlo: ${ctx.whatsappUrl}`;
  return { template: "courseLeadConfirmation", subject: "Recibimos tu solicitud — Curso de DJ", html, text };
}

/**
 * Email al lead de /guia-dj: la entrega de la Guía de iniciación al DJing. El link es
 * DURABLE (token estable por email; cada clic firma una URL nueva del bucket), así que
 * el correo lo dice: se puede volver a usar. Sin cupos, precios ni curso: la landing
 * "sin CTA" no vende nada, y este correo tampoco.
 */
export interface GuideDeliveryCopy {
  templateKey: string;
  subject: string;
  preheader: string;
  h1: string;
  blurb: string;
  ctaLabel: string;
  name: string;
  /** "Por dónde empezar": atajos numerados bajo el botón. Sin él, el correo no cambia. */
  quickStart?: readonly { readonly lead: string; readonly body: string }[];
}

/**
 * Entrega de una guía en PDF. El copy entra como DATO (lo trae lib/guides vía el
 * servicio) para que este módulo siga siendo copy puro, sin importar el registro.
 * Lo estructural —el link de respaldo, "guárdalo", la salida por WhatsApp— queda fijo:
 * no cambia entre guías.
 */
export function guideDelivery(
  v: { downloadUrl: string; copy: GuideDeliveryCopy },
  ctx: { whatsappUrl: string },
): EmailContent {
  const url = esc(v.downloadUrl);
  const c = v.copy;
  const steps = c.quickStart ?? [];
  const num = (i: number) => String(i + 1).padStart(2, "0");
  // Tabla y no flex/grid: los clientes de correo no los soportan; el número queda en su columna.
  const quickStart = steps.length
    ? `<p style="color:${T.bone};font-size:13px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;margin:28px 0 12px">Por dónde empezar</p>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%">${steps
       .map(
         (q, i) =>
           `<tr><td valign="top" style="width:36px;padding:0 0 12px;color:${T.gold};font-family:monospace;font-weight:bold">${num(i)}</td><td valign="top" style="padding:0 0 12px;color:${T.boneDim}"><strong style="color:${T.bone}">${esc(q.lead)}</strong> ${esc(q.body)}</td></tr>`,
       )
       .join("")}</table>`
    : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">${esc(c.h1)}</h1>
     <p style="color:${T.boneDim};margin:0 0 20px">${esc(c.blurb)}</p>
     <a href="${url}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">${esc(c.ctaLabel)}</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:20px 0 0">Si el botón no abre, copia este link: <a href="${url}" style="color:${T.gold};text-decoration:underline;word-break:break-all">${url}</a></p>${quickStart}
     <p style="color:${T.boneDim};margin:20px 0 0">Guárdalo: el link es tuyo y lo puedes volver a usar cuando quieras.</p>
     <p style="color:${T.boneDim};margin:12px 0 0">¿Problemas para abrirla? <a href="${esc(ctx.whatsappUrl)}" style="color:${T.gold};text-decoration:underline">Escríbenos por WhatsApp</a> y lo vemos al tiro.</p>`,
    c.preheader,
  );
  const quickStartText = steps.length
    ? `\n\nPor dónde empezar:\n${steps.map((q, i) => `${num(i)} ${q.lead} ${q.body}`).join("\n")}`
    : "";
  const text = `Acá está tu ${c.name} (PDF): ${v.downloadUrl}${quickStartText}

Guárdalo: el link es tuyo y lo puedes volver a usar cuando quieras.
¿Problemas para abrirla? Escríbenos por WhatsApp: ${ctx.whatsappUrl}`;
  return { template: c.templateKey, subject: c.subject, html, text };
}

/**
 * Bienvenida al newsletter ("Sigue aprendiendo", /curso-dj). Solo en alta nueva o re-alta.
 * El link de baja va en TODOS los correos de la lista: esta es la primera vez que la
 * persona lo ve, y la promesa del formulario ("te das de baja cuando quieras") vive acá.
 */
export function newsletterWelcome(v: { unsubscribeUrl: string; blogUrl: string }): EmailContent {
  const baja = esc(v.unsubscribeUrl);
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Quedaste en la lista</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Te vamos a escribir cuando publiquemos una guía o un artículo nuevo para aprender a mezclar. Solo eso: nada de promociones diarias.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Mientras tanto, lo último está en el blog.</p>
     <a href="${esc(v.blogUrl)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Ir al blog</a>
     <p style="color:${T.boneQuiet};font-size:13px;margin:28px 0 0">¿No lo pediste o ya no quieres recibirlo? <a href="${baja}" style="color:${T.gold};text-decoration:underline">Date de baja aquí</a>.</p>`,
    "Te avisamos cuando haya una guía o un post nuevo.",
  );
  const text = `Quedaste en la lista de FOTF Studios: te escribimos cuando publiquemos una guía o un artículo nuevo. Solo eso.

Lo último está en el blog: ${v.blogUrl}

¿No lo pediste o ya no quieres recibirlo? Date de baja: ${v.unsubscribeUrl}`;
  return { template: "newsletterWelcome", subject: "Quedaste en la lista — FOTF Studios", html, text };
}

/**
 * Pedido de reseña en Google, después de la sesión de prueba o del curso. Lo dispara el
 * dueño a mano desde la bandeja del admin: es una persona que ya vino a la sala. Un solo
 * botón, sin incentivos (Google prohíbe ofrecer algo a cambio de una reseña).
 */
export function courseReviewRequest(
  v: { name: string },
  ctx: { reviewUrl: string; whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">¿Cómo te fue en la cabina?</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Gracias por venir, ${esc(v.name)}. Si te gustó la clase, una reseña en Google nos ayuda a que más gente de Viña y Valparaíso encuentre el curso.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Toma un minuto. Cuenta lo que te sirvió, tal cual.</p>
     <a href="${esc(ctx.reviewUrl)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Dejar una reseña en Google</a>
     <p style="color:${T.boneDim};margin:24px 0 0">Si algo no estuvo bien, preferimos saberlo directo: <a href="${esc(ctx.whatsappUrl)}" style="color:${T.gold};text-decoration:underline">escríbenos por WhatsApp</a>.</p>`,
    "Una reseña en Google nos ayuda a que más gente encuentre el curso",
  );
  const text = `Gracias por venir, ${v.name}. Si te gustó la clase, una reseña en Google nos ayuda mucho: ${ctx.reviewUrl} — Si algo no estuvo bien, escríbenos por WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "courseReviewRequest", subject: "¿Cómo te fue? Tu reseña nos ayuda — FOTF Studios", html, text };
}

/**
 * Email al alumno: curso confirmado. Recién ACÁ viaja la dirección — la FAQ de la
 * landing promete que se comparte al confirmar la inscripción, y una solicitud sin
 * pagar no lo es. Lleva las fechas ya agendadas; en el curso 1:1 lo normal es que
 * aún no haya ninguna (se fijan con el alumno), y el correo lo dice así.
 * `generation` es el código del programa: solo para el dueño, no se muestra acá.
 */
export function courseEnrollmentPaid(v: {
  name: string;
  generation: string;
  total: string;
  sessions: string[];
}, ctx: { address: string; mapsUrl: string; whatsappUrl: string }): EmailContent {
  const n = COURSE_PROGRAM.sessions;
  const lista = v.sessions.length
    ? `<p style="color:${T.boneDim};margin:0 0 8px">Tus sesiones:</p>
       <ul style="margin:0 0 20px;padding-left:18px;color:${T.bone}">${v.sessions
        .map((d) => `<li style="margin:0 0 6px">${esc(d)}</li>`)
        .join("")}</ul>`
    : `<p style="color:${T.boneDim};margin:0 0 20px">Fijamos contigo las fechas de tus ${n} sesiones por WhatsApp.</p>`;
  const practica = `Incluye ${COURSE_PROGRAM.practiceHours} horas de práctica libre en la sala, que agendas con nosotros.`;
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu curso está confirmado</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Listo, ${esc(v.name)}. Tu Curso de Iniciación DJ quedó confirmado.</p>
     ${lista}
     <p style="color:${T.boneDim};margin:0 0 16px">${practica}</p>
     <p style="color:${T.boneDim};margin:0 0 4px">Dónde: <strong style="color:${T.bone}">${place(ctx)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 20px">Qué traer: tus audífonos y un USB con tu música.</p>
     <p style="margin:0 0 20px"><strong>Total pagado: ${esc(v.total)}</strong></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
    `Curso de Iniciación DJ · ${v.sessions[0] ?? "fechas por WhatsApp"}`,
  );
  const text = `Tu curso está confirmado, ${v.name}. Curso de Iniciación DJ.${v.sessions.length ? " Sesiones: " + v.sessions.join(" · ") + "." : ` Fijamos contigo las fechas de tus ${n} sesiones por WhatsApp.`} ${practica} Dónde: ${ctx.address}. Qué traer: audífonos y un USB con tu música. Total pagado: ${v.total}. WhatsApp: ${ctx.whatsappUrl}`;
  return { template: "courseEnrollmentPaid", subject: "Tu curso está confirmado — Curso de DJ", html, text };
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
    `<h1 style="font-size:24px;margin:0 0 8px">Tu curso te espera</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(v.name)}: reservamos tu lugar en el Curso de Iniciación DJ. Queda confirmado al pagar.</p>
     <p style="font-size:22px;margin:0 0 20px"><strong>${esc(v.total)}</strong></p>
     <a href="${esc(v.initPoint)}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Pagar ahora</a>
     <p style="color:${T.boneDim};margin:20px 0 0">El link vence en ${v.expiresInHours} horas. Si se te pasa, escríbenos y te mandamos otro.</p>
     <p style="color:${T.boneDim};margin:16px 0 0;font-size:13px">Al pagar aceptas los <a href="${ctx.termsUrl}" style="color:${T.gold}">términos y condiciones</a>.</p>`,
    `Curso de DJ · ${v.total} · el link vence en ${v.expiresInHours} h`,
  );
  const text = `${v.name}: reservamos tu lugar en el Curso de Iniciación DJ. Total ${v.total}. Paga acá: ${v.initPoint} (el link vence en ${v.expiresInHours} horas). Al pagar aceptas los términos: ${ctx.termsUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "courseEnrollmentPending", subject: "Tu inscripción al Curso de DJ — falta el pago", html, text };
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
  v: { name: string | null; when: string; total: string; initPoint: string; expiresInHours: number; parts?: SessionParts },
  ctx: BookingFoot & { termsUrl: string; whatsappUrl: string },
): EmailContent {
  const html = dsShell({
    preheader: `${v.when} · ${v.total} · el link vence en ${v.expiresInHours} h`,
    status: ["Pendiente de pago", "pending"],
    eyebrow: "Falta el pago",
    title: "Tu hora está tomada",
    body: `${p(`${v.name ? `${esc(v.name)}: ` : ""}te reservamos la sala. Queda confirmada al pagar.`, "0 0 28px")}
${ticket([
      ...sessionRows(v),
      { label: "Total", value: esc(v.total) },
      { label: "Vence en", value: toned(`${v.expiresInHours} h`, "pending"), accent: "pending" },
    ])}
${gap(28)}${cta(`Pagar ahora · ${esc(v.total)}`, v.initPoint)}
${fine(`El link vence en ${v.expiresInHours} horas. Si se te pasa, escríbenos por ${a("WhatsApp", ctx.whatsappUrl, D.text2)} y te mandamos otro. Al pagar aceptas los ${a("términos y condiciones", ctx.termsUrl, D.text2)}.`)}`,
    footer: bookingFooter(ctx),
  });
  const text = `${v.name ? `${v.name}: ` : ""}Te reservamos la sala para ${v.when}. Total ${v.total}. Paga acá: ${v.initPoint} (el link vence en ${v.expiresInHours} horas). Al pagar aceptas los términos: ${ctx.termsUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { template: "bookingPaymentPending", subject: `Falta el pago · link para tu hora del ${v.when} · vence en ${v.expiresInHours} h`, html, text };
}

/** Datos de transferencia (lib/site.ts TRANSFER), inyectados por la config del servicio. */
export interface TransferDetails {
  holder: string;
  rut: string;
  bank: string;
  accountType: string;
  accountNumber: string;
  email: string;
}

/**
 * Datos del destinatario en el formato que leen los bancos chilenos al "pegar datos"
 * para agregar un destinatario: una línea `Etiqueta: valor` por campo, con las
 * etiquetas habituales (Nombre, RUT, Banco, Tipo de cuenta, Número de cuenta, Correo).
 * El monto queda FUERA del bloque: se pide al transferir, no al agregar el destinatario.
 */
function transferLines(t: TransferDetails): [string, string][] {
  return [
    ["Nombre", t.holder],
    ["RUT", t.rut],
    ["Banco", t.bank],
    ["Tipo de cuenta", t.accountType],
    ["Número de cuenta", t.accountNumber],
    ["Correo", t.email],
  ];
}

/**
 * Bloque de transferencia de los correos de reserva pendiente. Los datos van en UN solo
 * elemento con `<br>` (no un párrafo por campo ni etiquetas con otro estilo): al
 * seleccionarlo y copiarlo sale texto limpio, línea por línea, listo para pegar.
 */
function transferHtml(t: TransferDetails, total: string): string {
  const block = transferLines(t).map(([k, v]) => `${k}: ${esc(v)}`);
  return `${eyebrow("Paga por transferencia")}
${p("Copia estos datos y pégalos en tu banco para agregar el destinatario:", "0 0 12px")}
${copyBlock(block)}
${amountRow("Monto a transferir", esc(total))}`;
}

/** Versión texto: el mismo bloque, una línea por campo, para que también se pueda pegar. */
function transferText(t: TransferDetails, total: string): string {
  const block = transferLines(t)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `Paga por transferencia. Copia estos datos y pégalos en tu banco para agregar el destinatario:\n\n${block}\n\nMonto a transferir: ${total}. Envía el comprobante a ${t.email} o por WhatsApp y confirmamos tu hora.`;
}

/**
 * Email al cliente al CREAR una reserva manual "pendiente de pago".
 *
 * Hermano de `bookingPaymentPending` (el del link de MP): este sale apenas se toma la
 * hora, con los datos de transferencia para que el cliente pueda pagar sin escribir
 * antes. Dice HASTA CUÁNDO hay que pagar (`payBy`, ya formateado: lo primero entre el
 * barrido que libera el hold de 72 h y el inicio de la sesión, ver manualHoldDeadline);
 * si no lo dijéramos, lo primero que sabría el cliente del plazo sería `customerHoldExpired`.
 * Solo transferencia: el efectivo existe pero no se ofrece (decisión del dueño).
 */
export function bookingHeldPending(
  v: { name: string | null; when: string; total: string; payBy: string; parts?: SessionParts },
  ctx: BookingFoot & { termsUrl: string; whatsappUrl: string; transfer: TransferDetails; address?: string; mapsUrl?: string },
): EmailContent {
  const html = dsShell({
    preheader: `${v.when} · ${v.total} · paga antes del ${v.payBy}`,
    status: ["Pendiente de pago", "pending"],
    eyebrow: "Falta el pago",
    title: "Tu hora está tomada",
    body: `${p(`${v.name ? `${esc(v.name)}: ` : ""}te reservamos la sala. Queda confirmada al pagar.`, "0 0 28px")}
${ticket([
      ...sessionRows(v),
      ...(ctx.address && ctx.mapsUrl ? [placeRow({ address: ctx.address, mapsUrl: ctx.mapsUrl })] : []),
      { label: "Paga antes", value: toned(esc(v.payBy), "pending"), accent: "pending" },
    ])}
${gap(12)}${p(`Para confirmarla, paga antes del ${b(esc(v.payBy))}. Si no recibimos el pago antes, la reserva se anula.`, "0 0 32px")}
${transferHtml(ctx.transfer, v.total)}
${gap(28)}${cta("Enviar comprobante por WhatsApp", ctx.whatsappUrl)}
${fine(`O envíalo a ${a(esc(ctx.transfer.email), `mailto:${ctx.transfer.email}`, D.text2)} y confirmamos tu hora. Al pagar aceptas los ${a("términos y condiciones", ctx.termsUrl, D.text2)}.`)}`,
    footer: bookingFooter(ctx),
  });
  const text = `${v.name ? `${v.name}: ` : ""}Te reservamos la sala para ${v.when}. Total ${v.total}. Para confirmarla, paga antes del ${v.payBy}. Si no recibimos el pago antes, la reserva se anula.\n\n${transferText(ctx.transfer, v.total)}\n\nWhatsApp: ${ctx.whatsappUrl}. Al pagar aceptas los términos: ${ctx.termsUrl}.`;
  return { template: "bookingHeldPending", subject: `Falta el pago · tu hora del ${v.when}`, html, text };
}

/**
 * Email al cliente: recordatorio de pago de una reserva manual pendiente, UNO, cuando
 * quedan ≤ 24 h para el plazo de pago (manualHoldDeadline) (PaymentReminderService, pg_cron de 5 min). Asunto propio
 * (no el de bookingHeldPending) para que no se enhebre como un duplicado del aviso.
 * Gold, no Sirena: un recordatorio no es una emergencia.
 */
export function bookingPaymentReminder(
  v: { name: string | null; when: string; total: string; payBy: string; parts?: SessionParts },
  ctx: BookingFoot & { termsUrl: string; whatsappUrl: string; transfer: TransferDetails; address?: string; mapsUrl?: string },
): EmailContent {
  const html = dsShell({
    preheader: `${v.when} · ${v.total} · paga antes del ${v.payBy}`,
    status: ["Falta el pago", "pending"],
    eyebrow: "Recordatorio de pago",
    title: "Falta el pago de tu hora",
    body: `${p(`${v.name ? `${esc(v.name)}: ` : ""}todavía no recibimos el pago de tu reserva.`, "0 0 28px")}
${ticket([
      ...sessionRows(v),
      { label: "Paga antes", value: toned(esc(v.payBy), "pending"), accent: "pending" },
    ])}
${gap(12)}${p(`Para confirmarla, paga antes del ${b(esc(v.payBy))}. Si no recibimos el pago antes, la reserva se anula. Si ya pagaste, mándanos el comprobante y listo.`, "0 0 32px")}
${transferHtml(ctx.transfer, v.total)}
${gap(28)}${cta("Enviar comprobante por WhatsApp", ctx.whatsappUrl)}
${fine(`O envíalo a ${a(esc(ctx.transfer.email), `mailto:${ctx.transfer.email}`, D.text2)}. Al pagar aceptas los ${a("términos y condiciones", ctx.termsUrl, D.text2)}.`)}`,
    footer: bookingFooter(ctx),
  });
  const text = `${v.name ? `${v.name}: ` : ""}Todavía no recibimos el pago de tu reserva para ${v.when} (total ${v.total}). Para confirmarla, paga antes del ${v.payBy}. Si no recibimos el pago antes, la reserva se anula.\n\n${transferText(ctx.transfer, v.total)}\n\nSi ya pagaste, mándanos el comprobante y listo. WhatsApp: ${ctx.whatsappUrl}. Al pagar aceptas los términos: ${ctx.termsUrl}.`;
  return { template: "bookingPaymentReminder", subject: `Recordatorio · falta el pago de tu hora del ${v.when}`, html, text };
}

/**
 * Email al dueño: un cliente del checkout público avisó "Ya transferí". Lo accionable es
 * verificar la transferencia en el banco y marcarla pagada en el admin (Cobro →
 * Transferencia); el cupo espera hasta `holdUntil` y después se libera solo. Gold, no
 * Sirena: es una tarea, no una emergencia.
 */
export function ownerTransferDeclared(v: {
  name: string | null;
  email: string | null;
  when: string;
  total: string;
  holdUntil: string;
  adminUrl: string;
}): EmailContent {
  const who = `${v.name ?? "Cliente"} · ${v.email ?? "sin email"}`;
  const html = dsShell({
    preheader: `El cupo se sostiene hasta el ${v.holdUntil}.`,
    status: ["Por verificar", "pending"],
    eyebrow: "Para el estudio",
    title: "Revisa una transferencia",
    body: `${p(`${esc(v.name ?? "Un cliente")} avisó que ya transfirió.`, "0 0 24px")}
${ticket([
      { label: "Monto", value: `<span style="font-size:20px;font-weight:700">${esc(v.total)}</span>` },
      { label: "Sesión", value: esc(v.when) },
      { label: "Cliente", value: `${esc(v.name ?? "Cliente")} · ${contact(v.email)}` },
      { label: "Cupo hasta", value: toned(esc(v.holdUntil), "pending"), accent: "pending" },
    ])}
${gap(12)}${p("Si la transferencia llegó, márcala pagada en el admin y el cliente recibe su confirmación. Si no la confirmas, el cupo se libera solo.", "0 0 28px")}
${cta("Abrir la reserva", v.adminUrl)}`,
    footer: "owner",
  });
  const text = `${who} avisó que ya transfirió ${v.total} por la reserva del ${v.when}. Si llegó, márcala pagada en el admin: ${v.adminUrl}. El cupo se sostiene hasta el ${v.holdUntil}; si no la confirmas, se libera solo.`;
  return { template: "ownerTransferDeclared", subject: `Revisa una transferencia · ${v.total} · ${v.name ?? v.email ?? "Cliente"} · ${v.when}`, html, text };
}

/** Email al dueño: inscripción pagada. Cierra recordando la boleta, como ownerNotification. */
export function ownerCoursePaid(v: {
  name: string;
  generation: string;
  total: string;
  method: string;
}): EmailContent {
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Inscripción pagada</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.name)}</strong> · ${esc(v.generation)}</p>
     <p style="color:${T.boneDim};margin:0 0 16px">Pagó por ${esc(v.method)}.</p>
     <p style="font-size:20px;margin:12px 0"><strong>Total: ${esc(v.total)}</strong></p>
     <p style="color:${T.gold};margin:16px 0">Recuerda emitir la boleta.</p>`,
  );
  const text = `Inscripción pagada: ${v.name} (${v.generation}). Pagó por ${v.method}. Total ${v.total}. Recuerda emitir la boleta.`;
  return { template: "ownerCoursePaid", subject: `Inscripción pagada — ${v.name} (${v.generation})`, html, text };
}

/** Email al alumno: su inscripción quedó anulada (impaga). Sin dinero de por medio. */
export function courseEnrollmentCancelled(
  v: { name: string; generation: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu inscripción quedó anulada</h1>
     <p style="color:${T.boneDim};margin:0 0 16px">Hola ${esc(v.name)}: anulamos tu inscripción al Curso de Iniciación DJ. No se hizo ningún cobro.</p>
     <p style="color:${T.boneDim};margin:0 0 20px">Si fue un error o quieres retomarlo, escríbenos y fijamos fechas nuevas.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Anulamos tu inscripción al Curso de Iniciación DJ. No se hizo ningún cobro. Si fue un error o quieres retomarlo: ${ctx.whatsappUrl}`;
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
     <p style="color:${T.boneDim};margin:0 0 16px">Hola ${esc(v.name)}: cancelamos tu inscripción al Curso de Iniciación DJ.</p>
     ${refundLine}
     <p style="color:${T.boneDim};margin:0 0 20px">Si quieres retomarlo más adelante, escríbenos y fijamos fechas nuevas.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:${T.gold};color:${T.ink};padding:14px 22px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
  );
  const text = `Cancelamos tu inscripción al Curso de Iniciación DJ.${v.refunded ? ` Te reembolsamos ${v.refunded} al medio de pago original.` : ""} Si quieres retomarlo más adelante: ${ctx.whatsappUrl}`;
  return { template: "courseEnrollmentRefunded", subject: "Tu inscripción al Curso de DJ fue cancelada", html, text };
}

/*
 * ─── Supabase Auth (Send Email Hook) ───────────────────────────────────────────
 * Antes vivían en HTML aparte y había que espejarlas a mano en el Dashboard (la
 * caída de #151 fue esa deriva). Con el hook (activo en local y prod), GoTrue nos pide
 * el correo y estas plantillas son la única fuente. Mismo criterio de copy: "código de
 * verificación", nunca "código de acceso" (ese es el PIN de la sala).
 */

/** Código de inicio de sesión (magic link y alta de cliente nuevo). */
export function authLoginCode(v: { token: string; confirmUrl: string }): EmailContent {
  const html = authShell({
    preheader: "Vence en una hora y sirve una sola vez.",
    title: "Inicia sesión en tu cuenta",
    lead: "Usa este código para confirmar que eres tú e iniciar sesión en FOTF Studios. Vence en una hora y sirve una sola vez.",
    token: v.token,
    action: ["Iniciar sesión con un clic", v.confirmUrl],
    note: "Este código es solo para el sitio. El código de acceso a la sala te llega en otro correo, 10 minutos antes de tu sesión. Si no intentaste iniciar sesión, ignora este correo: tu cuenta sigue segura.",
  });
  const text = `Tu código para iniciar sesión en FOTF Studios: ${v.token} (vence en una hora, sirve una sola vez). O entra con un clic: ${v.confirmUrl}. No es el código de acceso a la sala; ese te llega 10 minutos antes de tu sesión. Si no fuiste tú, ignora este correo.`;
  return { template: "authLoginCode", subject: `${v.token} es tu código para iniciar sesión · FOTF Studios`, html, text };
}

/** Recuperación de acceso (la app es passwordless; queda on-brand por si se gatilla). */
export function authRecovery(v: { token: string; confirmUrl: string }): EmailContent {
  const html = authShell({
    preheader: "Vence en una hora y sirve una sola vez.",
    title: "Recupera el acceso a tu cuenta",
    lead: "Pediste recuperar el acceso a tu cuenta de FOTF Studios. Usa este código para verificar que eres tú. Vence en una hora y sirve una sola vez.",
    token: v.token,
    action: ["Recuperar mi cuenta", v.confirmUrl],
    note: "Este código es para tu cuenta del sitio — no es el código de acceso a la sala (ese te llega en otro correo, 10 minutos antes de tu sesión). Si no lo pediste, ignora este correo: tu cuenta sigue segura.",
  });
  const text = `Tu código para recuperar el acceso a FOTF Studios: ${v.token} (vence en una hora). O con un clic: ${v.confirmUrl}. Si no lo pediste, ignora este correo.`;
  return { template: "authRecovery", subject: `Tu código para recuperar el acceso a FOTF Studios: ${v.token}`, html, text };
}

/** Confirmación de cambio de correo (puede ir al actual y al nuevo). */
export function authEmailChange(v: { token: string; confirmUrl: string }): EmailContent {
  const html = authShell({
    preheader: "Vence en una hora y sirve una sola vez.",
    title: "Confirma tu nuevo correo",
    lead: "Pediste cambiar el correo de tu cuenta de FOTF Studios. Confirma que este correo es tuyo con el código o el botón. Vence en una hora y sirve una sola vez.",
    token: v.token,
    action: ["Confirmar correo", v.confirmUrl],
    note: "Este código es para verificar tu correo en el sitio — no es el código de acceso a la sala. Si no pediste este cambio, ignora este correo: tu cuenta sigue segura.",
  });
  const text = `Confirma tu nuevo correo en FOTF Studios con este código: ${v.token} (vence en una hora). O con un clic: ${v.confirmUrl}. Si no pediste este cambio, ignora este correo.`;
  return { template: "authEmailChange", subject: `Confirma tu nuevo correo en FOTF Studios: ${v.token}`, html, text };
}

/** Código de verificación genérico (reautenticación u otros tipos con token). */
export function authVerificationCode(v: { token: string }): EmailContent {
  const html = authShell({
    preheader: "Vence en una hora y sirve una sola vez.",
    title: "Tu código de verificación",
    lead: "Usa este código para confirmar que eres tú. Vence en una hora y sirve una sola vez.",
    token: v.token,
    note: "Es un código de verificación del sitio — no es el código de acceso a la sala. Si no lo pediste, ignora este correo.",
  });
  const text = `Tu código de verificación en FOTF Studios: ${v.token} (vence en una hora). Si no lo pediste, ignora este correo.`;
  return { template: "authVerificationCode", subject: `Tu código de verificación en FOTF Studios: ${v.token}`, html, text };
}

/** Email al dueño: aviso de nueva reserva pagada. */
export function ownerNotification(
  v: BookingView & { email: string | null; method?: string | null; trial?: boolean; adminUrl?: string },
): EmailContent {
  const paidBy = v.method ? ` · pagó por ${v.method}` : "";
  // Una prueba del curso es guiada: no hay PIN que cargar.
  const what = v.trial ? "Nueva prueba del curso pagada" : "Nueva reserva pagada";
  const todo = v.trial ? "Es guiada: sin PIN. Recuerda emitir la boleta." : "Recuerda cargar el PIN en la cerradura y emitir la boleta.";
  const html = dsShell({
    preheader: v.trial ? "Es guiada: sin PIN. Emitir la boleta." : "Cargar el PIN en la cerradura y emitir la boleta.",
    status: ["Pagada", "ok"],
    eyebrow: "Para el estudio",
    title: what,
    body: `${gap(8)}${ticket([
      { label: "Sesión", value: esc(v.when) },
      { label: "Cliente", value: esc(v.name ?? "Cliente") },
      { label: "Contacto", value: contact(v.email) },
      ...(v.method ? [{ label: "Pago", value: `pagó por ${esc(v.method)}` }] : []),
    ])}
${gap(12)}${receipt(v.lines.map((l) => ({ description: esc(l.description), amount: esc(l.amount) })), esc(v.total))}
${gap(28)}${steps(
      "Por hacer",
      v.trial
        ? [["Es guiada: sin PIN", "La recibes en la puerta."], ["Recuerda emitir la boleta", null]]
        : [["Recuerda cargar el PIN en la cerradura", "Cerradura → Por cargar"], ["Emitir la boleta", null]],
    )}
${v.adminUrl ? `${gap(4)}${cta("Abrir la reserva", v.adminUrl)}` : ""}`,
    footer: "owner",
  });
  const text = `${what}: ${v.when}. ${v.name ?? ""} ${v.email ?? ""}. Total ${v.total}${paidBy}. ${todo}${v.adminUrl ? ` ${v.adminUrl}` : ""}`;
  return {
    template: "ownerNotification",
    subject: `${v.trial ? "Nueva prueba del curso" : "Nueva reserva"} · ${v.when} · ${v.name ?? v.email ?? "Cliente"} · ${v.total}`,
    html,
    text,
  };
}

/**
 * Email al dueño: una hora de práctica cambió de horario. Lo accionable es el PIN: si ya
 * estaba cargado, la cerradura no se toca (la Yale no tiene ventana horaria); si no, queda
 * por cargar como siempre. Registro, no urgencia (sin Sirena).
 */
export function ownerPracticeMoved(v: {
  name: string | null;
  email: string | null;
  phone: string | null;
  before: string;
  after: string;
  accessLoaded: boolean;
  adminUrl: string;
}): EmailContent {
  const contact = [v.email ?? "sin email", v.phone].filter(Boolean).join(" · ");
  const pin = v.accessLoaded
    ? "El PIN sigue cargado en la cerradura: no hay que tocarla. Se le vuelve a mandar 10 minutos antes del nuevo horario."
    : "El PIN todavía no está cargado: cárgalo antes del nuevo horario (Cerradura → Por cargar).";
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Práctica del curso movida</h1>
     <p style="color:${T.boneQuiet};margin:0 0 4px;text-decoration:line-through">${esc(v.before)}</p>
     <p style="margin:0 0 16px"><strong>${esc(v.after)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(v.name ?? "Alumno")} · ${esc(contact)}</p>
     <p style="color:${T.gold};margin:0 0 16px">${pin}</p>
     <p style="margin:0"><a href="${esc(v.adminUrl)}" style="color:${T.gold};font-weight:bold">Ver la reserva</a></p>`,
    `${v.name ?? "Alumno"}: ${v.before} → ${v.after}`,
  );
  const text = `Práctica del curso movida. Antes: ${v.before}. Ahora: ${v.after}. ${v.name ?? "Alumno"} · ${contact}. ${pin} Ver la reserva: ${v.adminUrl}`;
  return { template: "ownerPracticeMoved", subject: `Práctica del curso movida — ${v.after}`, html, text };
}

/** Email al dueño: una prueba del curso cambió de hora. Registro, no urgencia (sin Sirena). */
export function ownerTrialRescheduled(v: {
  name: string | null;
  email: string | null;
  phone: string | null;
  before: string;
  after: string;
  adminUrl: string;
}): EmailContent {
  const contact = [v.email ?? "sin email", v.phone].filter(Boolean).join(" · ");
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Prueba del curso movida</h1>
     <p style="color:${T.boneQuiet};margin:0 0 4px;text-decoration:line-through">${esc(v.before)}</p>
     <p style="margin:0 0 16px"><strong>${esc(v.after)}</strong></p>
     <p style="color:${T.boneDim};margin:0 0 16px">${esc(v.name ?? "Cliente")} · ${esc(contact)}</p>
     <p style="color:${T.boneDim};margin:0 0 16px">Es guiada: sin PIN.</p>
     <p style="margin:0"><a href="${esc(v.adminUrl)}" style="color:${T.gold};font-weight:bold">Ver la reserva</a></p>`,
    `${v.name ?? "Cliente"}: ${v.before} → ${v.after}`,
  );
  const text = `Prueba del curso movida. Antes: ${v.before}. Ahora: ${v.after}. ${v.name ?? "Cliente"} · ${contact}. Ver la reserva: ${v.adminUrl}`;
  return { template: "ownerTrialRescheduled", subject: `Prueba del curso movida — ${v.after}`, html, text };
}
