/**
 * Reglas de reserva configurables — fuente única.
 * Cambia estos valores para ajustar el comportamiento del flujo de reserva.
 */

/**
 * Anticipación mínima para reservar un horario, en minutos. Un horario que empieza
 * dentro de esta ventana (o ya pasó) no se puede reservar. Cambia este número para
 * ajustar la regla (p. ej. 60 = una hora de anticipación).
 */
export const MIN_LEAD_MINUTES = 30;

/**
 * Hasta cuántos días hacia adelante se puede reservar en línea, contando hoy
 * (90 = de hoy a hoy + 89). La tira de días de /reservar muestra 14 y extiende hasta aquí.
 */
export const BOOKING_HORIZON_DAYS = 90;
