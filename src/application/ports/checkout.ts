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
  amount: number;
  net: number;
  tax: number;
  currency: string;
  customer: Customer;
  snapshot: Quote;
  lines: CheckoutLine[];
}

export interface CheckoutRepository {
  /** Crea hold + pedido + líneas atómicamente. Lanza si el horario se traslapa. */
  createCheckout(params: CreateCheckoutParams): Promise<string>; // orderId
}
