/**
 * Cómo se pagó un pedido (`orders.payment_method`). Eje propio, separado del ESTADO del
 * pago (`orders.status`) y del TIPO de cobro (ensayo, cortesía…). Antes vivía como
 * prefijo `offline:<método>` dentro de `orders.mp_payment_id`.
 *
 * `puntos` es el método solo cuando los Puntos FOTF cubren el 100 %; un canje parcial
 * lleva el método del resto y el canje se muestra aparte (`points_redeemed_clp`).
 */
export const PAYMENT_METHODS = ["mercadopago", "transferencia", "efectivo", "puntos"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Los que el staff registra a mano (el de MP lo pone el webhook; puntos, el canje). */
export const OFFLINE_METHODS = ["transferencia", "efectivo"] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  mercadopago: "Mercado Pago",
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  puntos: "Puntos FOTF",
};

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}

export function isOfflineMethod(v: unknown): v is OfflineMethod {
  return typeof v === "string" && (OFFLINE_METHODS as readonly string[]).includes(v);
}

/** Etiqueta para mostrar; null/desconocido → null (la UI decide el fallback). */
export function paymentMethodLabel(v: string | null | undefined): string | null {
  return isPaymentMethod(v) ? PAYMENT_METHOD_LABEL[v] : null;
}
