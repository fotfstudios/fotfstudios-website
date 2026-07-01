/** Minutos del día → "HH:MM". */
export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Nombre visible de cada franja tarifaria (clave del price book → etiqueta es-CL). */
const TIER_LABELS: Record<string, string> = {
  valle: "Valle",
  puntaSemana: "Punta semana",
  puntaFinde: "Punta finde",
};

/** Etiqueta de la franja; cae a la clave si es una desconocida. */
export const tierLabel = (key: string) => TIER_LABELS[key] ?? key;
