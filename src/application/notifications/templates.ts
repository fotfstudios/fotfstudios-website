import type { EmailContent } from "@/src/application/ports/mailer";
import { SESSION_FORMAT_LABELS, type SessionFormat } from "@/src/domain/applications/application";
import { EXPERIENCE_LABELS, LEAD_PLAN_LABELS } from "@/src/domain/course/course";
import type { CourseLeadInput } from "@/src/domain/course/lead";

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
        `<tr><td style="padding:4px 0;color:#b9b5ab">${esc(l.description)}</td><td style="padding:4px 0;text-align:right;color:#f5f2ec">${esc(l.amount)}</td></tr>`,
    )
    .join("");

const shell = (inner: string) =>
  `<div style="background:#0a0a0a;color:#f5f2ec;font-family:Arial,sans-serif;padding:32px">
     <div style="max-width:520px;margin:0 auto">
       <p style="color:#e8c94a;letter-spacing:.15em;font-size:12px;margin:0 0 16px">FOTF STUDIOS</p>
       ${inner}
     </div>
   </div>`;

/** Email al cliente: confirmación de reserva + cómo se coordina el acceso. */
export function customerConfirmation(
  v: BookingView,
  ctx: { address: string; whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">¡Reserva confirmada!</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión quedó reservada.</p>
     <p style="margin:0 0 4px"><strong>${esc(v.when)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 16px">${esc(ctx.address)}</p>
     <table style="width:100%;border-top:1px solid #1e1d1a;border-bottom:1px solid #1e1d1a;margin:8px 0">${rows(v.lines)}</table>
     <p style="font-size:20px;margin:12px 0"><strong>Total: ${v.total}</strong> <span style="color:#6f6c64;font-size:12px">IVA incluido</span></p>
     <p style="color:#b9b5ab;margin:16px 0">Coordinaremos tu <strong style="color:#f5f2ec">acceso por WhatsApp</strong> antes de tu sesión.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `¡Reserva confirmada! ${v.when}. ${ctx.address}. Total ${v.total} (IVA incl.). Coordinaremos tu acceso por WhatsApp: ${ctx.whatsappUrl}`;
  return { subject: "Tu reserva en FOTF Studios está confirmada", html, text };
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
      ? `<p style="color:#b9b5ab;margin:0 0 16px">Incluye: ${esc(v.addonNames.join(", "))}</p>`
      : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">¡Reserva confirmada!</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión quedó reservada.</p>
     <p style="margin:0 0 4px"><strong>${esc(v.when)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 16px">${esc(ctx.address)}</p>
     <p style="margin:8px 0 16px;border-top:1px solid #1e1d1a;border-bottom:1px solid #1e1d1a;padding:8px 0"><strong>Cortesía:</strong> sesión sin cobro.</p>
     ${addonsLine}
     <p style="color:#b9b5ab;margin:16px 0">Coordinaremos tu <strong style="color:#f5f2ec">acceso por WhatsApp</strong> antes de tu sesión.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>
     <p style="color:#6f6c64;font-size:12px;margin:24px 0 0">Al reservar aceptas nuestros <a href="${ctx.termsUrl}" style="color:#6f6c64">términos</a> y <a href="${ctx.privacyUrl}" style="color:#6f6c64">política de privacidad</a>.</p>`,
  );
  const text = `¡Reserva confirmada! ${v.when}. ${ctx.address}. Cortesía: sesión sin cobro.${v.addonNames.length > 0 ? ` Incluye: ${v.addonNames.join(", ")}.` : ""} Coordinaremos tu acceso por WhatsApp: ${ctx.whatsappUrl}. Al reservar aceptas nuestros términos y política de privacidad: ${ctx.termsUrl} · ${ctx.privacyUrl}`;
  return { subject: "Tu sesión de cortesía en FOTF Studios está confirmada", html, text };
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
     <p style="color:#b9b5ab;margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}aquí tienes el acceso para tu sesión del <strong style="color:#f5f2ec">${esc(v.when)}</strong>.</p>
     <p style="background:#1e1d1a;color:#e8c94a;font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.08em;padding:14px 18px;margin:0 0 16px">${esc(v.code)}</p>
     <p style="color:#b9b5ab;margin:0 0 16px">${esc(ctx.address)}</p>
     <p style="color:#b9b5ab;margin:16px 0">Llegas, conectas tu música y a darle.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
  );
  const text = `Tu acceso para el ${v.when}: ${v.code}. ${ctx.address}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { subject: "Tu código de acceso — FOTF Studios", html, text };
}

/** Email al cliente: su reserva fue cancelada (con o sin reembolso). */
export function customerCancellation(
  v: { name: string | null; when: string; refunded: string | null },
  ctx: { whatsappUrl: string },
): EmailContent {
  const refundLine = v.refunded
    ? `<p style="color:#b9b5ab;margin:0 0 16px">Te reembolsamos <strong style="color:#f5f2ec">${esc(v.refunded)}</strong> al medio de pago original. Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.</p>`
    : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Reserva cancelada</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión del <strong style="color:#f5f2ec">${esc(v.when)}</strong> fue cancelada.</p>
     ${refundLine}
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
  );
  const text = `Tu reserva del ${v.when} fue cancelada.${v.refunded ? ` Te reembolsamos ${v.refunded} al medio de pago original.` : ""} ¿Dudas? ${ctx.whatsappUrl}`;
  return { subject: "Tu reserva en FOTF Studios fue cancelada", html, text };
}

export function customerReschedule(
  v: { name: string | null; when: string; refunded: string | null },
  ctx: { whatsappUrl: string; address: string },
): EmailContent {
  const refundLine = v.refunded
    ? `<p style="color:#b9b5ab;margin:0 0 16px">Como el nuevo horario cuesta menos, te reembolsamos <strong style="color:#f5f2ec">${esc(v.refunded)}</strong> al medio de pago original. Si pagaste con tarjeta, el abono puede tardar unos días en reflejarse.</p>`
    : "";
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Reserva reagendada</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}tu sesión quedó reagendada para el <strong style="color:#f5f2ec">${esc(v.when)}</strong>.</p>
     ${refundLine}
     <p style="color:#b9b5ab;margin:0 0 20px">Te esperamos en ${esc(ctx.address)}.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">¿Dudas? Escríbenos por WhatsApp</a>`,
  );
  const text = `Tu reserva quedó reagendada para el ${v.when}.${v.refunded ? ` Te reembolsamos ${v.refunded} al medio de pago original.` : ""} Te esperamos en ${ctx.address}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { subject: "Tu reserva en FOTF Studios cambió de horario", html, text };
}

export function customerRescheduleFailed(
  v: { name: string | null; when: string; refunded: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">No pudimos cambiar tu horario</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">${v.name ? `Hola ${esc(v.name)}, ` : ""}el horario que pediste ya estaba tomado cuando se procesó el pago. Mantuvimos tu reserva original del <strong style="color:#f5f2ec">${esc(v.when)}</strong> y te devolvimos <strong style="color:#f5f2ec">${esc(v.refunded)}</strong> al medio de pago.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">Escríbenos para elegir otro horario</a>`,
  );
  const text = `No pudimos moverte de horario (ya estaba tomado). Mantuvimos tu reserva del ${v.when} y te devolvimos ${v.refunded}. Escríbenos: ${ctx.whatsappUrl}`;
  return { subject: "No pudimos cambiar tu horario en FOTF Studios", html, text };
}

/**
 * Email al dueño: un pago se aprobó pero el horario ya no estaba reservado (el hold
 * venció antes de que llegara el pago). Requiere acción manual: refund o reasignar.
 * Sirena (#ff4d1d) es legítima aquí: es urgencia real, no decoración.
 */
export function ownerNeedsReview(
  v: { when: string; total: string; email: string | null; paymentId: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px;color:#ff4d1d">Pago sin reserva — revisar</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">Se aprobó un pago pero el horario ya no estaba reservado (el hold venció antes del pago). Hay que <strong style="color:#f5f2ec">devolver o reasignar</strong>.</p>
     <p style="margin:0 0 4px">Horario solicitado: <strong>${esc(v.when)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 4px">Cliente: ${esc(v.email ?? "sin email")}</p>
     <p style="color:#b9b5ab;margin:0 0 16px">Pago: ${esc(v.paymentId)} · Total ${esc(v.total)}</p>`,
  );
  const text = `PAGO SIN RESERVA — revisar. Horario ${v.when}. Cliente ${v.email ?? "?"}. Pago ${v.paymentId}, total ${v.total}. Devolver o reasignar.`;
  return { subject: "⚠️ Pago sin reserva — acción requerida", html, text };
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
    `<p style="color:#b9b5ab;margin:0 0 4px">${label}: <strong style="color:#f5f2ec">${esc(value)}</strong></p>`;
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Nueva postulación de DJ</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.name)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 4px">Email: <a href="mailto:${esc(v.email)}" style="color:#e8c94a">${esc(v.email)}</a></p>
     <p style="color:#b9b5ab;margin:0 0 16px">WhatsApp: <a href="https://wa.me/${esc(waDigits)}" style="color:#e8c94a">${esc(v.phone)}</a></p>
     ${optional("Puede hacer", formatLabel)}
     ${optional("Disponibilidad", v.availability)}
     <p style="margin:12px 0 12px">Set: <a href="${esc(v.mixUrl)}" style="color:#e8c94a">${esc(v.mixUrl)}</a></p>
     ${v.instagram ? optional("Instagram", v.instagram) : ""}
     ${v.genres ? optional("Géneros", v.genres) : ""}
     <p style="color:#b9b5ab;margin:16px 0 4px">Experiencia:</p>
     <p style="border-left:2px solid #1e1d1a;padding:4px 0 4px 12px;margin:0;color:#f5f2ec;white-space:pre-wrap">${esc(v.pitch)}</p>`,
  );
  const igText = v.instagram ? ` IG: ${v.instagram}.` : "";
  const genresText = v.genres ? ` Géneros: ${v.genres}.` : "";
  const text = `Nueva postulación de DJ: ${v.name}. Puede hacer: ${formatLabel}. Disponibilidad: ${v.availability}. Email ${v.email}. WhatsApp https://wa.me/${waDigits}. Set: ${v.mixUrl}.${igText}${genresText}\n\n${v.pitch}`;
  return { subject: `Nueva postulación de DJ — ${v.name}`, html, text };
}

/** Email al postulante: confirmación de que recibimos su postulación. Sin plazos prometidos. */
export function applicantConfirmation(
  v: { name: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Recibimos tu postulación</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">Gracias por querer sumarte al equipo, ${esc(v.name)}. Vamos a escuchar tu set y revisar tu experiencia; si calza, te escribimos por WhatsApp para coordinar clases o sesiones 1:1.</p>
     <p style="color:#b9b5ab;margin:0 0 20px">Mientras tanto, síguenos y mándanos lo que estés preparando.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Recibimos tu postulación al equipo, ${v.name}. Vamos a escuchar tu set y revisar tu experiencia; si calza, te escribimos por WhatsApp para coordinar clases o sesiones 1:1: ${ctx.whatsappUrl}`;
  return { subject: "Recibimos tu postulación — FOTF Studios", html, text };
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
    ? `<p style="color:#e8c94a;margin:16px 0 0">${gen.code}: quedan ${gen.seatsLeft} ${gen.seatsLeft === 1 ? "cupo" : "cupos"}.</p>`
    : `<p style="color:#b9b5ab;margin:16px 0 0">No hay generación abierta.</p>`;
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Nueva solicitud del curso</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.name)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 4px">Email: <a href="mailto:${esc(v.email)}" style="color:#e8c94a">${esc(v.email)}</a></p>
     <p style="color:#b9b5ab;margin:0 0 16px">WhatsApp: <a href="https://wa.me/${esc(waDigits)}" style="color:#e8c94a">${esc(v.phone)}</a></p>
     <p style="color:#b9b5ab;margin:0 0 4px">Le interesa: <strong style="color:#f5f2ec">${esc(plan)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 4px">Parte desde: <strong style="color:#f5f2ec">${esc(nivel)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 4px">Disponibilidad: <strong style="color:#f5f2ec">${esc(v.availability)}</strong></p>
     ${v.message ? `<p style="color:#b9b5ab;margin:16px 0 4px">Mensaje:</p><p style="border-left:2px solid #1e1d1a;padding:4px 0 4px 12px;margin:0;color:#f5f2ec;white-space:pre-wrap">${esc(v.message)}</p>` : ""}
     ${cupos}`,
  );
  const cuposText = gen ? ` ${gen.code}: quedan ${gen.seatsLeft} cupos.` : " Sin generación abierta.";
  const msgText = v.message ? `\n\n${v.message}` : "";
  const text = `Nueva solicitud del curso: ${v.name}. Le interesa: ${plan}. Parte desde: ${nivel}. Disponibilidad: ${v.availability}. Email ${v.email}. WhatsApp https://wa.me/${waDigits}.${cuposText}${msgText}`;
  return { subject: `Nueva solicitud del curso — ${v.name}`, html, text };
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
     <p style="color:#b9b5ab;margin:0 0 16px">Gracias, ${esc(v.name)}. Revisamos cada solicitud a mano y te escribimos por WhatsApp para cerrar tu cupo y coordinar las fechas.</p>
     <p style="color:#b9b5ab;margin:0 0 20px">Si prefieres adelantarlo, escríbenos directo y lo vemos al tiro.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Recibimos tu solicitud del Curso de Iniciación DJ, ${v.name}. Revisamos cada una a mano y te escribimos por WhatsApp para cerrar tu cupo y coordinar las fechas. Si prefieres adelantarlo: ${ctx.whatsappUrl}`;
  return { subject: "Recibimos tu solicitud — Curso de DJ", html, text };
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
    ? `<ul style="margin:0 0 20px;padding-left:18px;color:#f5f2ec">${v.sessions
        .map((d) => `<li style="margin:0 0 6px">${esc(d)}</li>`)
        .join("")}</ul>`
    : `<p style="color:#b9b5ab;margin:0 0 20px">Te confirmamos las fechas por WhatsApp.</p>`;
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu cupo está confirmado</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">Listo, ${esc(v.name)}. Quedaste en la generación ${esc(v.generation)} del Curso de Iniciación DJ.</p>
     <p style="color:#b9b5ab;margin:0 0 8px">Tus sesiones:</p>
     ${lista}
     <p style="color:#b9b5ab;margin:0 0 4px">Dónde: <strong style="color:#f5f2ec">${esc(ctx.address)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 20px">Qué traer: tus audífonos y un USB con tu música.</p>
     <p style="margin:0 0 20px"><strong>Total pagado: ${esc(v.total)}</strong></p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Tu cupo está confirmado, ${v.name}. Generación ${v.generation} del Curso de Iniciación DJ.${v.sessions.length ? " Sesiones: " + v.sessions.join(" · ") + "." : " Te confirmamos las fechas por WhatsApp."} Dónde: ${ctx.address}. Qué traer: audífonos y un USB con tu música. Total pagado: ${v.total}. WhatsApp: ${ctx.whatsappUrl}`;
  return { subject: "Tu cupo está confirmado — Curso de DJ", html, text };
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
     <p style="color:#b9b5ab;margin:0 0 16px">${esc(v.name)}: reservamos tu cupo en la generación ${esc(v.generation)} del Curso de Iniciación DJ. Queda confirmado al pagar.</p>
     <p style="font-size:22px;margin:0 0 20px"><strong>${esc(v.total)}</strong></p>
     <a href="${esc(v.initPoint)}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">Pagar ahora</a>
     <p style="color:#b9b5ab;margin:20px 0 0">El link vence en ${v.expiresInHours} horas. Si se te pasa, escríbenos y te mandamos otro.</p>
     <p style="color:#b9b5ab;margin:16px 0 0;font-size:13px">Al pagar aceptas los <a href="${ctx.termsUrl}" style="color:#e8c94a">términos y condiciones</a>.</p>`,
  );
  const text = `${v.name}: reservamos tu cupo en la generación ${v.generation} del Curso de Iniciación DJ. Total ${v.total}. Paga acá: ${v.initPoint} (el link vence en ${v.expiresInHours} horas). Al pagar aceptas los términos: ${ctx.termsUrl}. ¿Dudas? ${ctx.whatsappUrl}`;
  return { subject: `Tu cupo en el Curso de DJ — falta el pago`, html, text };
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
     <p style="color:#b9b5ab;margin:0 0 16px">Pagó por ${esc(v.method)}.</p>
     <p style="font-size:20px;margin:12px 0"><strong>Total: ${esc(v.total)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 4px">Quedan ${v.seatsLeft} ${v.seatsLeft === 1 ? "cupo" : "cupos"} en la generación.</p>
     <p style="color:#e8c94a;margin:16px 0">Recuerda emitir la boleta.</p>`,
  );
  const text = `Inscripción pagada: ${v.name} (${v.generation}). Pagó por ${v.method}. Total ${v.total}. Quedan ${v.seatsLeft} cupos. Recuerda emitir la boleta.`;
  return { subject: `Inscripción pagada — ${v.name} (${v.generation})`, html, text };
}

/** Email al alumno: su inscripción quedó anulada (impaga). Sin dinero de por medio. */
export function courseEnrollmentCancelled(
  v: { name: string; generation: string },
  ctx: { whatsappUrl: string },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:24px;margin:0 0 8px">Tu inscripción quedó anulada</h1>
     <p style="color:#b9b5ab;margin:0 0 16px">Hola ${esc(v.name)}: liberamos tu cupo en la generación ${esc(v.generation)}. No se hizo ningún cobro.</p>
     <p style="color:#b9b5ab;margin:0 0 20px">Si fue un error o quieres entrar a la siguiente, escríbenos y lo arreglamos.</p>
     <a href="${ctx.whatsappUrl}" style="display:inline-block;background:#e8c94a;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>`,
  );
  const text = `Tu inscripción en la generación ${v.generation} quedó anulada y liberamos tu cupo. No se hizo ningún cobro. Si fue un error o quieres entrar a la siguiente: ${ctx.whatsappUrl}`;
  return { subject: "Tu inscripción quedó anulada — Curso de DJ", html, text };
}

/** Email al dueño: aviso de nueva reserva pagada. */
export function ownerNotification(
  v: BookingView & { email: string | null },
): EmailContent {
  const html = shell(
    `<h1 style="font-size:22px;margin:0 0 8px">Nueva reserva pagada</h1>
     <p style="margin:0 0 4px"><strong>${esc(v.when)}</strong></p>
     <p style="color:#b9b5ab;margin:0 0 16px">${esc(v.name ?? "Cliente")} · ${esc(v.email ?? "sin email")}</p>
     <table style="width:100%;border-top:1px solid #1e1d1a;border-bottom:1px solid #1e1d1a;margin:8px 0">${rows(v.lines)}</table>
     <p style="font-size:20px;margin:12px 0"><strong>Total: ${v.total}</strong></p>
     <p style="color:#e8c94a;margin:16px 0">Recuerda enviar el código de acceso y emitir la boleta.</p>`,
  );
  const text = `Nueva reserva pagada: ${v.when}. ${v.name ?? ""} ${v.email ?? ""}. Total ${v.total}. Enviar acceso + emitir boleta.`;
  return { subject: `Nueva reserva — ${v.when}`, html, text };
}
