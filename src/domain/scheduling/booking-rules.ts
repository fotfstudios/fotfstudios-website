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
