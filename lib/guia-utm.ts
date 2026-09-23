/**
 * Los UTM y el referente de la sesión, leídos en el navegador.
 *
 * Se leen AL ENVIAR y no al montar: una landing a la que se llegó navegando dentro del
 * sitio no tiene UTM, y eso es correcto — pertenecen a la sesión con la que la persona
 * llegó, no a la página. Leerlos al montar además abriría una diferencia entre el HTML del
 * servidor y el del cliente.
 *
 * Del referente se toma SOLO el host: la URL completa puede llevar datos en la query.
 */
export interface GuiaUtmPayload {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerHost?: string;
}

export function readUtm(loc: { search: string }, referrer: string): GuiaUtmPayload {
  const q = new URLSearchParams(loc.search);
  const out: GuiaUtmPayload = {};
  const put = (key: keyof GuiaUtmPayload, param: string) => {
    const v = q.get(param)?.trim();
    if (v) out[key] = v;
  };
  put("utmSource", "utm_source");
  put("utmMedium", "utm_medium");
  put("utmCampaign", "utm_campaign");
  put("utmContent", "utm_content");
  put("utmTerm", "utm_term");
  try {
    const host = referrer ? new URL(referrer).hostname : "";
    if (host) out.referrerHost = host;
  } catch {
    // Un referente ilegible no es motivo para no entregar la guía.
  }
  return out;
}
