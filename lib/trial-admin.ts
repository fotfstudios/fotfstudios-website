/**
 * Errores de mover la prueba del curso (RPC `move_trial_reservation`) → mensaje del admin.
 * El RPC lanza uno de estos códigos:
 *   trial_slot_taken   la hora nueva choca con otra reserva o bloqueo
 *   trial_in_past      la hora nueva ya pasó
 *   trial_same_slot    la hora nueva es la misma de ahora
 *   trial_bad_range    no dura 1 h (no debería pasar: la acción arma el rango)
 *   trial_not_movable  no es una prueba vigente (cancelada, o ya no es 'prueba')
 * Cualquier otro texto (red, Postgres) cae en un mensaje genérico: nunca se muestra crudo.
 */
export function trialMoveError(raw: string): string {
  if (/trial_slot_taken/.test(raw)) return "Ese horario choca con otra reserva o bloqueo.";
  if (/trial_in_past/.test(raw)) return "Ese horario ya pasó.";
  if (/trial_same_slot/.test(raw)) return "La prueba ya está en ese horario.";
  if (/trial_not_movable/.test(raw)) return "Esta prueba ya no se puede mover (está cancelada).";
  return "No se pudo mover la prueba.";
}
