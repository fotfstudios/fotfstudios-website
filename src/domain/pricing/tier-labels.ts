/** Etiquetas de los tramos (rate_tiers.key → texto para el cliente). Fuente única para UI y glosas. */
export const TIER_LABELS: Record<string, string> = {
  valle: "Valle",
  puntaSemana: "Punta semana",
  puntaFinde: "Punta finde",
};

export const tierLabel = (key: string): string => TIER_LABELS[key] ?? key;

/**
 * Nombres de tramo para el checkout público (/reservar): "Valle" / "Punta" son jerga
 * interna; un cliente chileno entiende "tarifa" + cuándo aplica. Las glosas de boleta,
 * los correos y el admin siguen con TIER_LABELS.
 */
export const CHECKOUT_TIER_LABELS: Record<string, string> = {
  valle: "Tarifa diurna",
  puntaSemana: "Tarifa nocturna",
  puntaFinde: "Tarifa fin de semana",
};

export const checkoutTierLabel = (key: string): string => CHECKOUT_TIER_LABELS[key] ?? tierLabel(key);
