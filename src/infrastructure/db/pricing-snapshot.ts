import type { Quote } from "@/src/domain/pricing/types";
import type { Json } from "./database.types";

/** Lo mínimo del snapshot que hace falta para ubicar la línea de descuento del motor. */
export type SnapshotShape = Pick<Quote, "tierLines" | "addonsTotal" | "total">;

/**
 * `orders.pricing_snapshot` es `jsonb` sin garantías de forma: pedidos viejos
 * pueden traer null o algo incompleto, y nadie valida al escribir. Se valida acá,
 * en un solo lugar, porque lo leen el reagendamiento y la ficha del admin y una
 * divergencia entre ambos haría que el diálogo proyecte un delta distinto del que
 * el servidor cobra.
 *
 * Ante cualquier duda devuelve null: sin snapshot la concesión queda en 0 y todo
 * se comporta como antes de existir esta función, que es el modo seguro de fallar.
 */
export function snapshotQuote(raw: Json | null): SnapshotShape | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.total !== "number" || typeof s.addonsTotal !== "number") return null;
  if (!Array.isArray(s.tierLines)) return null;

  const tierLines: SnapshotShape["tierLines"] = [];
  for (const t of s.tierLines) {
    if (!t || typeof t !== "object" || Array.isArray(t)) return null;
    const line = t as Record<string, unknown>;
    if (typeof line.subtotal !== "number") return null;
    tierLines.push(line as unknown as SnapshotShape["tierLines"][number]);
  }
  return { tierLines, addonsTotal: s.addonsTotal, total: s.total };
}
