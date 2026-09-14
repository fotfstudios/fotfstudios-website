/**
 * Bitácora de envíos de correo (auditoría 2026-09-14, H5). Antes, todo `notify*`
 * terminaba en `.catch(console.error)` y una caída del proveedor (API key inválida,
 * 2026-07-10) pasaba días sin que nadie la viera. Cada intento queda registrado —
 * ok o con el error del proveedor — y el admin muestra los fallos recientes.
 */
export interface NotificationLogEntry {
  /** Nombre de la plantilla (`customerConfirmation`, `ownerNeedsReview`, …). */
  template: string;
  recipient: string;
  subject: string;
  ok: boolean;
  /** Mensaje del proveedor cuando `ok` es false. */
  error: string | null;
}

export interface NotificationFailure extends NotificationLogEntry {
  id: string;
  createdAt: string;
}

export interface NotificationLogRepository {
  record(entry: NotificationLogEntry): Promise<void>;
  /** Fallos de las últimas `hours` horas, más reciente primero. */
  recentFailures(hours: number, limit?: number): Promise<NotificationFailure[]>;
}
