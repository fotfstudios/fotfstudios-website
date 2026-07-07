import type { Quote } from "@/src/domain/pricing/types";

export interface Customer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface CheckoutLine {
  line_type: "room_time" | "flat_service" | "discount";
  addon_key?: string;
  description: string;
  quantity: number;
  unit_price_clp: number;
  subtotal_clp: number;
}

export interface CreateCheckoutParams {
  resourceId: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  amount: number; // efectivo a cobrar (total − puntos canjeados)
  net: number;
  tax: number;
  currency: string;
  customer: Customer;
  snapshot: Quote;
  lines: CheckoutLine[];
  customerId?: string; // cuenta del cliente (canje de puntos)
  pointsRedeemed?: number;
  /** Consentimiento T&C: 'customer' (clic en /reservar) | 'staff' (atestiguado por el dueño). NULL = sin registro. */
  termsSource?: "customer" | "staff";
  /** Versión de los T&C aceptada — la fija el server (TERMS_VERSION), no el cliente. */
  termsVersion?: string;
}

export interface CheckoutRepository {
  /** Crea hold + pedido + líneas atómicamente. Lanza si el horario se traslapa. */
  createCheckout(params: CreateCheckoutParams): Promise<string>; // orderId
}
