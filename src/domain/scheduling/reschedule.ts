/**
 * Reagendamiento: clasificación pura del delta de precio. Compara la boleta viva
 * actual (`oldLive` = total − ya reembolsado) contra el total re-cotizado del
 * nuevo horario. El monto es siempre positivo; el signo lo lleva el `kind`.
 *
 * - `equal`  → sin movimiento de plata (se mueve el horario y ya).
 * - `refund` → nuevo más barato: se devuelve `amount` al cliente.
 * - `charge` → nuevo más caro: se cobra `amount` extra al cliente.
 */
export type RescheduleDelta =
  | { kind: "equal" }
  | { kind: "refund"; amount: number }
  | { kind: "charge"; amount: number };

export function classifyReschedule(oldLive: number, newTotal: number): RescheduleDelta {
  const delta = newTotal - oldLive;
  if (delta === 0) return { kind: "equal" };
  if (delta < 0) return { kind: "refund", amount: -delta };
  return { kind: "charge", amount: delta };
}
