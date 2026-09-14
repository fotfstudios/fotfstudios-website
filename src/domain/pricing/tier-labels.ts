/** Etiquetas de los tramos (rate_tiers.key → texto para el cliente). Fuente única para UI y glosas. */
export const TIER_LABELS: Record<string, string> = {
  valle: "Valle",
  puntaSemana: "Punta semana",
  puntaFinde: "Punta finde",
};

export const tierLabel = (key: string): string => TIER_LABELS[key] ?? key;
