/**
 * Tipos compartidos de la consola de reserva manual (módulo plano: actions.ts
 * es "use server" y solo puede exportar funciones async).
 */
import type { DayAvailability } from "@/src/application/availability/availability-service";
import type { ManualDiscountInput } from "@/src/domain/pricing/manual-discount";

/** Reserva/bloqueo existente del día, en minutos locales (para la cinta y la lista). */
export interface OccupancyEntry {
  id: string;
  start: number;
  end: number;
  name: string | null;
  kind: string;
  status: string;
}

/** Datos del día para la consola: horario + huecos anónimos + ocupación con nombres. */
export interface DayConsoleData {
  avail: DayAvailability;
  occupancy: OccupancyEntry[];
}

export interface ManualBookingInput {
  date: string;
  startMinute: number;
  durationHours: number;
  addonKeys: string[];
  method: string;
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
}
