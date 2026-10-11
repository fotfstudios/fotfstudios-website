/**
 * Avisos por WhatsApp: una preferencia por CLIENTE, no por reserva.
 *
 * - `whatsappDecided`: la ficha ya eligió (alguna vez se dio de alta o de baja). El checkout
 *   con sesión no vuelve a preguntar; se cambia en /cuenta.
 * - `applyCheckoutWhatsAppChoice`: ¿la casilla del checkout puede escribir la preferencia?
 *   Con sesión, sí (es el dueño). Un invitado solo la fija si la ficha de ese correo aún no
 *   decidió: escribir el correo de otro no le cambia sus avisos.
 */
type Consent = { optInAt: string | null; optOutAt: string | null };

export function whatsappDecided(consent: Consent): boolean {
  return consent.optInAt !== null || consent.optOutAt !== null;
}

export function applyCheckoutWhatsAppChoice(o: { authenticated: boolean; consent: Consent | null }): boolean {
  if (o.authenticated) return true;
  return o.consent === null || !whatsappDecided(o.consent);
}
