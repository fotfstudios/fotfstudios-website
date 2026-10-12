/**
 * Ítems GA4 del checkout de la sala (puro, para los eventos begin_checkout / purchase): la sala
 * como un ítem con cantidad = horas y precio promedio por hora (las horas pueden tener tarifas
 * distintas), y cada extra aparte. Los descuentos no son ítems: el `value` del evento es lo que
 * se paga.
 */
import type { GaItem } from "./analytics";

export const ROOM_ITEM = { item_id: "sala-ensayo", item_name: "Sala de ensayo DJ" } as const;

export function checkoutItems({
  quote,
  duration,
}: {
  quote: { roomSubtotal: number; addonLines: { key: string; name: string; amount: number }[] } | null;
  duration: number;
}): GaItem[] {
  if (!quote) return [];
  return [
    { ...ROOM_ITEM, price: Math.round(quote.roomSubtotal / duration), quantity: duration },
    ...quote.addonLines.map((a) => ({ item_id: a.key, item_name: a.name, price: a.amount, quantity: 1 })),
  ];
}
