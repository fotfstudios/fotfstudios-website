import type { WhatsAppTemplate } from "@/src/application/ports/whatsapp";

/**
 * Catálogo de plantillas de WhatsApp: evento → nombre aprobado en Meta + parámetros con nombre +
 * tipo de botón. El TEXTO vive en Meta y su copia de referencia en `docs/whatsapp-templates.md`;
 * `templates.test.ts` compara ese archivo con este catálogo. Cambiar una plantilla = cambiarla en
 * Meta (nueva aprobación), en el doc y acá.
 *
 * Botones de URL dinámica (Meta solo acepta `{{1}}` al final de la URL):
 *   - `estado`: https://www.fotfstudios.cl/reserva/estado?b={orderId}
 *   - `admin`:  https://www.fotfstudios.cl/admin/reservas/{reservationId}
 */
export type WaButton = "estado" | "admin" | null;

interface WaTemplateDef {
  name: string;
  params: readonly string[];
  button: WaButton;
}

export const WA_TEMPLATES = {
  booking_confirmed: { name: "fotf_reserva_confirmada", params: ["nombre", "fecha", "total"], button: "estado" },
  session_reminder: { name: "fotf_recordatorio_sesion", params: ["nombre", "fecha", "direccion"], button: null },
  access_pin: { name: "fotf_pin_acceso", params: ["nombre", "hora", "pin"], button: null },
  payment_pending: { name: "fotf_pago_pendiente", params: ["nombre", "fecha", "total", "plazo"], button: "estado" },
  payment_reminder: { name: "fotf_recordatorio_pago", params: ["nombre", "fecha", "total", "plazo"], button: "estado" },
  trial_rescheduled: { name: "fotf_prueba_curso_movida", params: ["nombre", "antes", "ahora"], button: "estado" },
  owner_new_booking: { name: "fotf_admin_nueva_reserva", params: ["cliente", "fecha", "total"], button: "admin" },
  owner_payment_pending: { name: "fotf_admin_pago_pendiente", params: ["cliente", "fecha", "total", "plazo"], button: "admin" },
  owner_cancellation: { name: "fotf_admin_cancelacion", params: ["cliente", "fecha", "reembolso"], button: "admin" },
  owner_new_lead: { name: "fotf_admin_nuevo_lead", params: ["origen", "nombre", "contacto"], button: null },
  owner_trial_rescheduled: { name: "fotf_admin_prueba_curso_movida", params: ["cliente", "antes", "ahora"], button: "admin" },
  test_ping: { name: "fotf_prueba", params: ["fecha"], button: null },
} as const satisfies Record<string, WaTemplateDef>;

export type WaEvent = keyof typeof WA_TEMPLATES;
export type WaParams<E extends WaEvent> = Record<(typeof WA_TEMPLATES)[E]["params"][number], string>;

/** Tope por parámetro: holgado para una dirección o un "Nombre Apellido", corto para no inflar el mensaje. */
export const WA_PARAM_MAX = 120;

/**
 * Valor de parámetro apto para Meta: sin saltos de línea, tabs ni más de 4 espacios seguidos
 * (error 132018) y nunca vacío (Meta rechaza un parámetro vacío). Un dato que falta sale como "—".
 */
export function waParam(value: string | null | undefined): string {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "—";
  return clean.length > WA_PARAM_MAX ? `${clean.slice(0, WA_PARAM_MAX - 1)}…` : clean;
}

/**
 * Arma el mensaje de un evento. Exige el sufijo del botón cuando la plantilla tiene botón (y lo
 * rechaza cuando no): un mensaje sin el componente que Meta espera falla con 132000 recién al
 * mandarlo, minutos después y lejos de quien lo armó.
 */
export function waTemplate<E extends WaEvent>(event: E, params: WaParams<E>, buttonSuffix?: string): WhatsAppTemplate {
  const def: WaTemplateDef = WA_TEMPLATES[event];
  if (def.button && !buttonSuffix) throw new Error(`waTemplate(${event}): falta el sufijo del botón`);
  if (!def.button && buttonSuffix) throw new Error(`waTemplate(${event}): la plantilla no tiene botón`);
  const values = params as Record<string, string>;
  const out: Record<string, string> = {};
  for (const p of def.params) out[p] = waParam(values[p]);
  return {
    name: def.name,
    language: "es",
    params: out,
    ...(buttonSuffix ? { buttonSuffix: encodeURIComponent(buttonSuffix) } : {}),
  };
}
