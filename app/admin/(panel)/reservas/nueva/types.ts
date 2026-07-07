/**
 * Tipos compartidos de la consola de reserva manual (módulo plano: actions.ts
 * es "use server" y solo puede exportar funciones async).
 */
import type { DayAvailability } from "@/src/application/availability/availability-service";

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
  customer: { name?: string; email?: string; phone?: string };
  notes: string;
  /** Atestación del staff: el dueño confirma que el cliente aceptó los T&C (registra terms_source='staff'). */
  termsAccepted?: boolean;
}

export interface ManualBookingResult {
  /** Id de la reserva creada (null solo si la resolución post-pago falló). */
  reservationId: string | null;
  /** null = cortesía (sin orden). */
  orderId: string | null;
  /** Total cobrado según el servidor; null = cortesía. */
  amount: number | null;
}
