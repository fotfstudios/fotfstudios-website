/**
 * Etiquetas de los tramos (rate_tiers.key → texto para el cliente). Fuente única para UI y
 * glosas: el checkout, las líneas del pedido (boleta, correos, /reserva/estado) y el admin.
 * "Valle" / "Punta" eran jerga interna; un cliente chileno entiende "tarifa" + cuándo aplica
 * (decisión del dueño, 2026-10-11). Las líneas de pedidos anteriores conservan su texto.
 */
export const TIER_LABELS: Record<string, string> = {
  valle: "Tarifa diurna",
  puntaSemana: "Tarifa nocturna",
  puntaFinde: "Tarifa fin de semana",
};

export const tierLabel = (key: string): string => TIER_LABELS[key] ?? key;
