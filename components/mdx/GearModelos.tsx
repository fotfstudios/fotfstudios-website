import { GEAR } from "@/lib/site";

/**
 * Los modelos de la sala separados por coma, para usarlos DENTRO de una frase.
 *
 * `<Gear />` renderiza la tabla completa (cantidad, modelo, rol) y no sirve en prosa
 * corrida. Los dos leen lib/site.ts por el mismo motivo: los modelos exactos son regla de
 * marca, y repetirlos a mano deja un XDJ fantasma en un texto de hace un año.
 */
export function GearModelos() {
  return <>{GEAR.map((g) => g.model).join(", ")}</>;
}
