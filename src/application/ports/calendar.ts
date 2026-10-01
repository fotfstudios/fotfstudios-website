import type { GoogleEventPayload, ReservationSnapshot } from "@/src/domain/calendar/google-event";

/**
 * Calendario externo al que se espeja la agenda (hoy Google). Unidireccional: la app escribe,
 * nunca lee. Ambas operaciones son idempotentes por id (lo exige el worker: un tick que muere a
 * mitad de camino se reintenta entero).
 */
export interface CalendarSync {
  /** Crea o actualiza el evento con ese id. Restaura uno que el dueño borró a mano. */
  upsertEvent(eventId: string, payload: GoogleEventPayload): Promise<void>;
  /** Borra el evento; si ya no existe, no es error. */
  deleteEvent(eventId: string): Promise<void>;
}

/**
 * Falla del calendario externo. `retryable` separa lo transitorio (cuota, 5xx, red) de lo que
 * no se arregla solo (calendario sin compartir, llave mala). El worker reintenta ambos con
 * backoff; la diferencia es para el mensaje que ve el dueño.
 */
export class CalendarSyncError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CalendarSyncError";
  }
}

/** Fila reclamada de `calendar_sync`: lo que el worker necesita para procesarla y cerrarla. */
export interface ClaimedSyncRow {
  reservationId: string;
  /** La versión reclamada: la escritura terminal la compara para no perder un cambio nuevo. */
  version: number;
  attempts: number;
  lastFingerprint: string | null;
}

export interface SyncFailure {
  reservationId: string;
  attempts: number;
  nextAttemptAt: string;
  lastError: string;
  op: "upsert" | "delete";
}

export interface SyncStats {
  pending: number;
  failing: number;
  lastSyncedAt: string | null;
}

export interface CalendarSyncRepository {
  /** Reclama hasta `limit` filas vencidas (SKIP LOCKED + lease de 5 min). */
  claimDue(limit: number): Promise<ClaimedSyncRow[]>;
  /** Foto de la reserva; null si ya no existe. */
  snapshot(reservationId: string): Promise<ReservationSnapshot | null>;
  /**
   * Cierra una fila procesada. Queda pendiente si la versión cambió mientras tanto. Con
   * `gone` (la reserva ya no existe) borra la fila, solo si la versión sigue siendo la misma.
   */
  markSynced(
    reservationId: string,
    version: number,
    result: { googleEventId: string | null; fingerprint: string | null; gone: boolean },
  ): Promise<void>;
  /**
   * Suelta la fila con el error y la próxima fecha de intento. Si la versión cambió (llegó un
   * cambio nuevo), el reintento es inmediato: es otra foto.
   */
  markFailed(reservationId: string, version: number, error: string, nextAttemptAt: Date): Promise<void>;
  /** Suelta una fila reclamada sin contar intento (se acabó el presupuesto del tick). */
  release(reservationId: string): Promise<void>;
  /** Re-encola todo lo vigente con el fingerprint limpio (fuerza el PATCH). */
  enqueueAll(): Promise<number>;
  /** Adelanta a "ahora" el próximo intento de todo lo pendiente (botón "Sincronizar ahora"). */
  forceDue(): Promise<number>;
  stats(): Promise<SyncStats>;
  failures(limit: number): Promise<SyncFailure[]>;
}
