/**
 * Memoria del checkout en ESTE navegador (sessionStorage), para que /reserva/estado sepa si la
 * compra empezó aquí (y con qué ítems / camino de pago) y no repita `purchase` al recargar.
 * Todo en try/catch: sin sessionStorage (ventana privada, bloqueado) simplemente no hay memoria.
 */
import type { GaItem, PaymentType } from "./analytics";

export interface StartedCheckout {
  paymentType: PaymentType;
  items: GaItem[];
}

const startedKey = (orderId: string) => `fotf_checkout_${orderId}`;
const purchasedKey = (orderId: string) => `fotf_purchase_${orderId}`;

export function rememberCheckout(orderId: string, data: StartedCheckout): void {
  try {
    sessionStorage.setItem(startedKey(orderId), JSON.stringify(data));
  } catch {
    // sin almacenamiento: /reserva/estado igual cuenta la transición observada
  }
}

export function startedCheckout(orderId: string): StartedCheckout | null {
  try {
    const raw = sessionStorage.getItem(startedKey(orderId));
    return raw ? (JSON.parse(raw) as StartedCheckout) : null;
  } catch {
    return null;
  }
}

export function purchaseTracked(orderId: string): boolean {
  try {
    return sessionStorage.getItem(purchasedKey(orderId)) === "1";
  } catch {
    return false;
  }
}

export function markPurchaseTracked(orderId: string): void {
  try {
    sessionStorage.setItem(purchasedKey(orderId), "1");
  } catch {
    // GA4 igual dedupa por transaction_id
  }
}
