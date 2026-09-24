import { PRECIOS } from "@/lib/curso-content";
import { formatCLP, RATES } from "@/lib/pricing";

/**
 * Un precio del sitio, dentro de la prosa.
 *
 * Existe para que un artículo NUNCA escriba una cifra a mano. La página que promete
 * "precios publicados, sin 'desde'" es justo la que peor envejece si el número se congela
 * en el texto: cambia la tarifa y el artículo empieza a mentir sin que nada falle.
 */
const VALORES = {
  duo: PRECIOS.duo,
  individual: PRECIOS.individual,
  prueba: PRECIOS.prueba,
  valle: RATES.valle,
  puntaSemana: RATES.puntaSemana,
  puntaFinde: RATES.puntaFinde,
} as const;

export type PrecioTier = keyof typeof VALORES;

export function Precio({ tier }: { tier: PrecioTier }) {
  return <>{formatCLP(VALORES[tier])}</>;
}
