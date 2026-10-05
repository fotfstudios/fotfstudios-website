/**
 * Tipos compartidos de la consola de reserva manual (módulo plano: actions.ts
 * es "use server" y solo puede exportar funciones async).
 */
import type { ManualDiscountInput } from "@/src/domain/pricing/manual-discount";
import type { PaymentMethod } from "@/src/domain/money/payment-method";

/** La ocupación del día vive en components/admin/day-occupancy.ts (compartida con el curso). */
export type { DayConsoleData, OccupancyEntry } from "@/components/admin/day-occupancy";

export interface ManualBookingInput {
  date: string;
  startMinute: number;
  durationHours: number;
  addonKeys: string[];
  /** Tipo de reserva: "ensayo" | "cortesia" (lo valida lib/manual-booking). */
  type: string;
  /** ¿Ya pagó? false = pendiente. */
  paid: boolean;
  /** Con `paid`: "transferencia" | "efectivo"; null si lo cubren los puntos. */
  method: string | null;
  /**
   * Ficha elegida en el picker, o null para un walk-in solo-nombre. El cliente
   * NO manda nombre/email/teléfono: el servidor los lee de `customers`.
   */
  customerId: string | null;
  /** Nombre del walk-in sin ficha. Se ignora si hay `customerId`. */
  walkInName?: string;
  /**
   * Puntos a descontar. Solo con `customerId`: sin ficha no hay saldo de quién
   * descontar. El monto DEFINITIVO lo decide la DB bajo lock de fila — esto es
   * una intención, igual que el descuento manual.
   */
  pointsToRedeem?: number;
  notes: string;
  /** Descuento del staff — intención (objetivo/modo/valor), no pesos: los calcula el servidor. */
  discount?: ManualDiscountInput;
  /** Atestación del staff: el dueño confirma que el cliente aceptó los T&C (registra terms_source='staff'). */
  termsAccepted?: boolean;
  /** Solicitud del curso desde la que se agenda una prueba (?lead=): se enlaza al crearla. */
  leadId?: string | null;
}

export interface ManualBookingResult {
  /** Id de la reserva creada (null solo si la resolución post-pago falló). */
  reservationId: string | null;
  /** null = cortesía (sin orden). */
  orderId: string | null;
  /** Total según el servidor: cobrado (efectivo/transferencia) o a cobrar (pendiente); null = cortesía. */
  amount: number | null;
  /**
   * Cliente tal como quedó GUARDADO (de la ficha, no de lo que se tipeó): lo
   * usan el panel de éxito y el link de WhatsApp. Sin ficha, el nombre del
   * walk-in y teléfono null.
   */
  customer: { name: string | null; phone: string | null };
  /** Puntos efectivamente descontados (los capa el servidor contra el total y el saldo). */
  pointsApplied: number;
  /** Cómo quedó pagada (null = pendiente o cortesía). "puntos" si el canje cubrió todo. */
  paymentMethod: PaymentMethod | null;
}
