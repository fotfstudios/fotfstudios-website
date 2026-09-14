/**
 * Promo "20% en tu primera reserva" — parámetros puros, sin I/O.
 *
 * La promo NO es un mecanismo nuevo: es el descuento manual del admin
 * (`applyManualDiscount`) con parámetros fijos. Así hereda todo lo que ya sabe la
 * plataforma de un descuento — línea negativa que va a la boleta, neto/IVA
 * prorrateados, puntos ganados sobre el efectivo, arrastre en pesos al
 * reagendar — sin tocar ni una línea de esa matemática.
 *
 * `target: room` a propósito: el 20% corre sobre la sala ANTES del descuento por
 * volumen, así los porcentajes se SUMAN (4h = 20% volumen + 20% promo = 40% de la
 * sala) y los add-ons (grabación, guía) se cobran completos.
 *
 * Quién es "primera reserva" lo decide la DB (`first_booking_promo_used`); dónde
 * se aplica lo decide `CheckoutService` (solo el checkout público). Este archivo
 * es el ÚNICO interruptor: `enabled: false` apaga la promo, sus avisos y su copy.
 */
import type { ManualDiscountInput } from "./manual-discount";

export const FIRST_BOOKING_PROMO = {
  enabled: true,
  pct: 20,
  reason: "primera reserva",
} as const;

/** La promo expresada como intención de descuento manual (la base la resuelve el quote del servidor). */
export type FirstBookingPromoConfig = { enabled: boolean; pct: number; reason: string };

export function firstBookingDiscountInput(promo: FirstBookingPromoConfig = FIRST_BOOKING_PROMO): ManualDiscountInput {
  return {
    target: { kind: "room" },
    mode: "pct",
    value: promo.pct,
    reason: promo.reason,
  };
}
