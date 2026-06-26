export interface OrderEmailData {
  id: string;
  email: string | null;
  name: string | null;
  amount: number;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  notifiedAt: string | null;
  lines: { description: string; subtotal: number }[];
}

export interface NotificationRepository {
  getOrderForEmail(orderId: string): Promise<OrderEmailData | null>;
  pendingPaidOrderIds(limit?: number): Promise<string[]>;
  markNotified(orderId: string): Promise<void>;
}
