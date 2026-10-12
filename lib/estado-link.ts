/**
 * URL limpia de /reserva/estado (auditoría de seguridad 2026-10-12, hallazgo 5).
 *
 * El id del pedido es la llave del recibo: con él se ve la reserva y se aprieta "Ya
 * transferí" (que estira el cupo y le escribe al dueño). Viajaba en `?b=`, y el Pixel de
 * Meta reporta `document.location` completo en PageView y Purchase — Meta guardaba un
 * link vivo a cada recibo. GA4 ya lo limpiaba en GTM; el pixel no se deja.
 *
 * Arreglo: el middleware recibe `/reserva/estado?b=<id>` (retorno de MP, correos, .ics,
 * /cuenta), guarda el id en una cookie httpOnly y redirige a `/reserva/estado` antes de que
 * corra cualquier script. Los links de los correos siguen funcionando (cada uno la
 * vuelve a fijar) y copiar la barra de direcciones ya no le da el recibo a otro.
 * Puro y sin Next: lo testea vitest y lo usa el middleware.
 */

export const ESTADO_PATH = "/reserva/estado";
export const ESTADO_COOKIE = "fotf_estado";
/** Lo que dura el recibo en este navegador sin volver a abrir un link con `?b=`. */
export const ESTADO_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;

// Los order id son `gen_random_uuid()`. Un valor con otra forma no se guarda ni se usa.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderId(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

/**
 * Prefetch del router de Next (un `<Link>` de /cuenta visible en pantalla): no se fija la
 * cookie ni se redirige. Con varias reservas listadas, la cookie quedaría apuntando a la
 * última precargada y no a la que se abrió.
 */
export function isPrefetchRequest(headers: { get(name: string): string | null }): boolean {
  return (
    headers.get("next-router-prefetch") === "1" ||
    headers.get("purpose") === "prefetch" ||
    (headers.get("sec-purpose") ?? "").includes("prefetch")
  );
}

/**
 * ¿Hay que limpiar esta URL? Devuelve a dónde redirigir y el id a guardar, o null si no
 * corresponde (otra ruta, sin `?b=` válido, o prefetch). Solo sobrevive la PISTA de pago de
 * MP (`status=approved`), que no identifica a nadie; el resto de los parámetros de retorno
 * de MP (payment_id, preference_id, external_reference = el id otra vez…) se descarta.
 */
export function estadoRedirect(url: URL, isPrefetch: boolean): { location: string; orderId: string } | null {
  if (url.pathname !== ESTADO_PATH || isPrefetch) return null;
  const b = url.searchParams.get("b");
  if (!isOrderId(b)) return null;
  const approved =
    url.searchParams.get("status") === "approved" || url.searchParams.get("collection_status") === "approved";
  const clean = new URL(url.toString());
  clean.search = approved ? "?status=approved" : "";
  clean.hash = "";
  return { location: clean.toString(), orderId: b.toLowerCase() };
}
