/**
 * Piezas de correo del design system de reservas (Claude Design → "Email Templates").
 * Email-safe: tablas + estilos en línea, sin CSS vars ni flex. Los colores salen de
 * EMAIL_DS (atados a components/ds/ds.css) y las fuentes de EMAIL_FONTS.
 *
 * Contrato de escape: cada pieza recibe HTML YA SEGURO. Quien arma el correo pasa todo
 * dato del cliente o del catálogo por `esc()` antes de entregarlo; las etiquetas fijas
 * (copy de la plantilla) van tal cual.
 */
import { EMAIL_ASSET_BASE as A, EMAIL_DS as C, EMAIL_FONTS as F } from "./email-tokens";

/** Escapa texto para incrustar en HTML (datos del cliente/catálogo). */
export const esc = (s: string | null | undefined): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Tono de estado → color. ok verde, pending Gold (una tarea, no una emergencia),
 * danger rojo (plata del cliente en juego), accent naranja (el acceso activo).
 */
export type Tone = "ok" | "pending" | "neutral" | "danger" | "accent";
const TONE: Record<Tone, string> = { ok: C.ok, pending: C.gold, neutral: C.text2, danger: C.danger, accent: C.orange };

const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;

export const pill = (label: string, tone: Tone): string => {
  const c = TONE[tone];
  return `<span style="display:inline-block;padding:5px 12px;border:1px solid ${c};border-radius:999px;font-family:${F.mono};font-size:10px;font-weight:700;line-height:1.4;letter-spacing:.1em;text-transform:uppercase;color:${c};white-space:nowrap"><span style="display:inline-block;width:6px;height:6px;border-radius:6px;background:${c};vertical-align:middle;margin:-2px 7px 0 0"></span>${label}</span>`;
};

/** El motivo de faders del logo, en el color del estado. Solo correos al cliente. */
const faders = (c: string): string =>
  `<div style="margin:0 0 24px">${[1, 0.45, 0.65, 0.33]
    .map((w) => `<div style="width:${Math.round(64 * w)}px;height:6px;background:${c};border-radius:1px;margin:0 0 4px;font-size:0;line-height:0">&nbsp;</div>`)
    .join("")}</div>`;

export const eyebrow = (t: string, c: string = C.small): string =>
  `<p style="margin:0 0 12px;font-family:${F.body};font-weight:300;font-size:12px;line-height:1.4;letter-spacing:.28em;text-transform:uppercase;color:${c}">${t}</p>`;

const h1 = (t: string, size: number): string =>
  `<h1 class="h1" style="margin:0 0 16px;font-family:${F.display};font-weight:400;font-size:${size}px;line-height:.95;letter-spacing:.01em;text-transform:uppercase;color:${C.text}">${t}</h1>`;

/** Párrafo de cuerpo. `m` es el margen CSS (por defecto 0 0 16px). */
export const p = (html: string, m = "0 0 16px"): string =>
  `<p style="margin:${m};font-family:${F.body};font-size:16px;line-height:1.55;color:${C.text2}">${html}</p>`;

/** Énfasis dentro del cuerpo. */
export const b = (t: string): string => `<strong style="color:${C.text};font-weight:500">${t}</strong>`;

export const mono = (t: string, c: string = C.text): string => `<span style="font-family:${F.mono};color:${c}">${t}</span>`;

/** Link en línea. `href` se escapa acá: llega crudo desde la config o el servicio. */
export const a = (t: string, href: string, c: string = C.orange): string =>
  `<a href="${esc(href)}" style="color:${c};text-decoration:underline;text-underline-offset:3px">${t}</a>`;

export const gap = (h: number): string => `<div style="height:${h}px;line-height:${h}px;font-size:0">&nbsp;</div>`;

/** Texto secundario en línea (la duración junto a la hora, "· medio de pago original"). */
export const quiet = (t: string): string => `<span style="color:${C.small}">${t}</span>`;

/** Valor resaltado en un color de estado (el plazo de pago en Gold, el monto a devolver en rojo). */
export const toned = (t: string, tone: Tone, big = false): string =>
  `<span style="color:${TONE[tone]}${big ? ";font-size:20px;font-weight:700" : ""}">${t}</span>`;

export interface TicketRow {
  label: string;
  value: string;
  /** Tachado: el horario que ya no es (cancelado, liberado, reemplazado). */
  strike?: boolean;
  /** La etiqueta toma el color de este estado ("Ahora" en verde, "Paga antes" en Gold). */
  accent?: Tone;
}

/** La ficha: la sesión de un vistazo, etiqueta a la izquierda y dato en mono. */
export const ticket = (rows: TicketRow[]): string =>
  `<table ${TABLE} style="background:${C.card};border:1px solid ${C.line};border-radius:10px;border-collapse:separate">
${rows
  .map((r, i) => {
    const sep = i < rows.length - 1 ? `border-bottom:1px solid ${C.line};` : "";
    return `<tr><td style="padding:14px 20px;${sep}width:96px;vertical-align:top;font-family:${F.body};font-weight:300;font-size:11px;line-height:1.9;letter-spacing:.28em;text-transform:uppercase;color:${r.accent ? TONE[r.accent] : C.small}">${r.label}</td><td style="padding:14px 20px 14px 0;${sep}font-family:${F.mono};font-size:15px;line-height:1.5;color:${r.strike ? C.small : C.text};${r.strike ? "text-decoration:line-through;" : ""}">${r.value}</td></tr>`;
  })
  .join("")}
</table>`;

/** Recibo: líneas del pedido, separador punteado y total grande. */
export const receipt = (lines: { description: string; amount: string }[], total: string, note = "IVA incluido"): string =>
  `<table ${TABLE} style="background:${C.card};border:1px solid ${C.line};border-radius:10px;border-collapse:separate">
${lines
  .map(
    (l) =>
      `<tr><td style="padding:14px 20px 0;font-family:${F.body};font-size:15px;color:${C.text2}">${l.description}</td><td align="right" style="padding:14px 20px 0;font-family:${F.mono};font-size:15px;color:${C.text};white-space:nowrap">${l.amount}</td></tr>`,
  )
  .join("")}
<tr><td colspan="2" style="padding:14px 20px 0"><div style="border-top:1px dashed ${C.strong};height:1px;line-height:1px;font-size:0">&nbsp;</div></td></tr>
<tr><td style="padding:12px 20px 16px;font-family:${F.body};font-weight:300;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${C.small}">Total<br><span style="letter-spacing:.04em;text-transform:none;font-size:12px">${note}</span></td><td align="right" style="padding:12px 20px 16px;font-family:${F.mono};font-size:26px;font-weight:700;color:${C.text};white-space:nowrap">${total}</td></tr>
</table>`;

/** Recuadro de aviso con etiqueta (el acceso, "no es tu PIN de la sala"). */
export const callout = (label: string, html: string, tone: Tone = "accent"): string =>
  `<table ${TABLE}><tr><td style="background:${C.input};border:1px solid ${C.line};border-radius:10px;padding:18px 20px">
<p style="margin:0 0 6px;font-family:${F.mono};font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${TONE[tone]}">${label}</p>
<p style="margin:0;font-family:${F.body};font-size:15px;line-height:1.55;color:${C.text2}">${html}</p></td></tr></table>`;

/** Pasos numerados: "Qué sigue" al cliente, "Por hacer" al dueño. */
export const steps = (title: string, items: [string, string | null][]): string =>
  `${eyebrow(title)}<table ${TABLE}>
${items
  .map(
    ([t, d], i) =>
      `<tr><td width="44" style="padding:0 0 16px;vertical-align:top;font-family:${F.mono};font-size:13px;font-weight:700;line-height:1.6;color:${C.orange}">${String(i + 1).padStart(2, "0")}</td><td style="padding:0 0 16px;vertical-align:top"><p style="margin:0;font-family:${F.body};font-size:15px;font-weight:500;line-height:1.5;color:${C.text}">${t}</p>${d ? `<p style="margin:2px 0 0;font-family:${F.body};font-size:14px;line-height:1.5;color:${C.text2}">${d}</p>` : ""}</td></tr>`,
  )
  .join("")}
</table>`;

/** EL botón: naranja, a todo el ancho, ~50 px de alto (táctil). Uno por correo. */
export const cta = (label: string, href: string): string =>
  `<table ${TABLE}><tr><td align="center" bgcolor="${C.orange}" style="background:${C.orange};border-radius:6px"><a href="${esc(href)}" style="display:block;padding:18px 24px;font-family:${F.body};font-size:14px;font-weight:500;line-height:1;letter-spacing:.08em;text-transform:uppercase;color:${C.page};text-decoration:none">${label}</a></td></tr></table>`;

/** Acciones secundarias: botones fantasma lado a lado. */
export const ghosts = (items: [string, string][]): string =>
  `<table ${TABLE} style="margin-top:12px"><tr>
${items
  .map(
    ([l, h], i) =>
      `${i ? `<td width="12" style="font-size:0">&nbsp;</td>` : ""}<td align="center" width="${Math.floor(100 / items.length)}%" style="border:1px solid ${C.strong};border-radius:6px"><a href="${esc(h)}" style="display:block;padding:14px 12px;font-family:${F.body};font-size:12px;font-weight:500;line-height:1.2;letter-spacing:.08em;text-transform:uppercase;color:${C.text};text-decoration:none">${l}</a></td>`,
  )
  .join("")}
</tr></table>`;

/** Letra chica al pie del cuerpo (T&C, "el abono puede tardar"). */
export const fine = (html: string): string =>
  `<p style="margin:20px 0 0;font-family:${F.body};font-size:13px;line-height:1.55;color:${C.small}">${html}</p>`;

/** Código grande centrado: el PIN de la puerta o el código para iniciar sesión. */
export const codeBox = (label: string, code: string, opts: { size: number; note?: string; labelColor?: string }): string =>
  `<table ${TABLE}><tr><td align="center" style="background:${C.card};border:1px solid ${C.strong};border-radius:10px;padding:30px 16px">
<p style="margin:0 0 10px;font-family:${F.body};font-weight:300;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${opts.labelColor ?? C.small}">${label}</p>
<p style="margin:0;font-family:${F.mono};font-size:${opts.size}px;font-weight:700;letter-spacing:.16em;line-height:1.1;color:${C.text};word-break:break-all">${code}</p>
${opts.note ? `<p style="margin:14px 0 0;font-family:${F.body};font-size:13px;color:${C.small}">${opts.note}</p>` : ""}</td></tr></table>`;

/** Recuadro mono para copiar y pegar (datos de transferencia): UN elemento con <br>. */
export const copyBlock = (lines: string[]): string =>
  `<table ${TABLE}><tr><td style="background:${C.input};border:1px solid ${C.line};border-radius:10px;padding:18px 20px;font-family:${F.mono};font-size:14px;line-height:1.8;color:${C.text}">${lines.join("<br>")}</td></tr></table>`;

/** Fila etiqueta / monto grande (el "Monto a transferir" bajo los datos de la cuenta). */
export const amountRow = (label: string, amount: string): string =>
  `<table ${TABLE} style="margin-top:12px"><tr><td style="font-family:${F.body};font-weight:300;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${C.small}">${label}</td><td align="right" style="font-family:${F.mono};font-size:22px;font-weight:700;color:${C.text};white-space:nowrap">${amount}</td></tr></table>`;

/**
 * Pie del correo al cliente. Cada link es opcional: un correo de auth no conoce la
 * dirección ni la cuenta, y el pie se arma con lo que haya.
 */
export interface FooterCtx {
  address?: string;
  mapsUrl?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  accountUrl?: string;
  /** "Recibes este correo porque…" */
  reason: string;
}

const footer = (f: FooterCtx | "owner"): string => {
  if (f === "owner") {
    return `<p style="margin:0;font-family:${F.mono};font-size:11px;line-height:1.6;letter-spacing:.06em;color:${C.small}">AVISO INTERNO · SOLO EQUIPO FOTF<br>Este correo no se reenvía al cliente.</p>`;
  }
  const where = f.address ? `<br>${f.mapsUrl ? a(esc(f.address), f.mapsUrl, C.text2) : esc(f.address)}` : "";
  const links = [
    f.whatsappUrl ? a("WhatsApp", f.whatsappUrl, C.text2) : "",
    f.instagramUrl ? a("Instagram", f.instagramUrl, C.text2) : "",
    f.accountUrl ? a("Tu cuenta", f.accountUrl, C.text2) : "",
  ].filter(Boolean);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:top;padding:2px 14px 0 0"><img src="${A}/fotf-icon-grey.png" width="22" height="22" alt="" style="display:block;border:0"></td><td style="vertical-align:top">
<p style="margin:0 0 6px;font-family:${F.body};font-size:13px;line-height:1.55;color:${C.text2}">FOTF Studios · Sala de ensayo DJ${where}</p>
${links.length ? `<p style="margin:0 0 14px;font-family:${F.body};font-size:13px;line-height:1.55;color:${C.small}">${links.join(" &nbsp;·&nbsp; ")}</p>` : ""}
<p style="margin:0;font-family:${F.body};font-size:12px;line-height:1.55;color:${C.small}">${f.reason}</p></td></tr></table>`;
};

const FONT_FACES = [
  ["Anton", 400, "anton-400"],
  ["Space Grotesk", "300 500", "space-grotesk-300-500"],
  ["Space Mono", 400, "space-mono-400"],
  ["Space Mono", 700, "space-mono-700"],
]
  .map(([family, weight, file]) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${A}/fonts/${file}.woff2) format('woff2')}`)
  .join("\n");

export interface DsShell {
  /** Snippet que Gmail muestra junto al asunto (texto plano: se escapa acá). */
  preheader: string;
  status: [label: string, tone: Tone];
  /** HTML seguro. */
  eyebrow: string;
  /** HTML seguro. */
  title: string;
  /** HTML seguro: el cuerpo armado con las piezas de arriba. */
  body: string;
  /** Pie del cliente, o "owner" para el aviso interno (sin faders, eyebrow en Gold). */
  footer: FooterCtx | "owner";
}

/**
 * Envoltorio de todos los correos. Hereda lo que el envoltorio anterior ya
 * resolvía: documento completo, `lang="es"`, `color-scheme: dark` (los clientes con
 * modo oscuro no invierten un correo que ya es oscuro), tabla contenedora con `bgcolor`
 * (Outlook ignora el fondo de un <div>) y preheader oculto.
 */
export const dsShell = (o: DsShell): string => {
  const owner = o.footer === "owner";
  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>FOTF Studios</title>
<style>
${FONT_FACES}
:root{color-scheme:dark;supported-color-schemes:dark}
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
@media (max-width:520px){.wrap{padding:28px 18px!important}.h1{font-size:38px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${C.page}" bgcolor="${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(o.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table ${TABLE} bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" class="wrap" style="padding:40px 24px">
<table ${TABLE} style="max-width:560px">
<tr><td style="padding:0 0 48px"><table ${TABLE}><tr>
<td style="vertical-align:middle"><img src="${A}/fotf-mini-cream.png" width="40" height="40" alt="FOTF Studios" style="display:block;border:0;color:${C.text};font-family:${F.body};font-size:12px"></td>
<td align="right" style="vertical-align:middle">${pill(...o.status)}</td></tr></table></td></tr>
<tr><td style="font-family:${F.body};color:${C.text}">${owner ? "" : faders(TONE[o.status[1]])}${eyebrow(o.eyebrow, owner ? C.gold : C.small)}${h1(o.title, owner ? 36 : 48)}${o.body}</td></tr>
<tr><td style="padding:48px 0 0"><div style="border-top:1px solid ${C.line};padding-top:24px">${footer(o.footer)}</div></td></tr>
</table>
</td></tr></table>
</body>
</html>`;
};
