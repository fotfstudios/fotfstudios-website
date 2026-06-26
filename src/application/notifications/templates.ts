import type { EmailContent } from "@/src/application/ports/mailer";

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
