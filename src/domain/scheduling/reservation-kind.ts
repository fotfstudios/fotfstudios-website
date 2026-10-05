/**
 * Qué significa cada `kind` de `reservations`. Punto único: antes esta semántica
 * vivía repartida en ~29 literales `"block"` / `"booking"`, en dos idiomas
 * incompatibles — lista negra (`kind !== "block"`) y lista blanca
 * (`kind === "booking"`) — así que un kind nuevo caía del lado equivocado de
 * ambas y corrompía métricas en silencio.
 *
 * Las tres kinds ocupan la cabina por igual: el EXCLUDE gist y el motor de
 * disponibilidad filtran por `status`, nunca por `kind`. Lo que las distingue es
 * si la hora se VENDIÓ:
 *
 *   booking → un cliente pagó (o va a pagar) esa hora. Genera ingreso y boleta.
 *   block   → mantención, cierre, uso interno. No se vende, no factura.
 *   curso   → una sesión del Curso de DJ. Tampoco se vende por hora (el alumno
 *             paga el programa completo), pero la sala SÍ está trabajando —
 *             por eso cuenta en ocupación aunque no cuente en ingresos.
 */

export const RESERVATION_KINDS = ["booking", "block", "curso"] as const;
export type ReservationKind = (typeof RESERVATION_KINDS)[number];

export function isReservationKind(k: string): k is ReservationKind {
  return (RESERVATION_KINDS as readonly string[]).includes(k);
}

/**
 * ¿Es una hora vendida a un cliente? Único predicado que debe gobernar ingresos,
 * boletas y los KPI de "sesiones". (El PIN de la puerta lo decide `needsDoorAccess`
 * y el recordatorio `needsReminder`: este último también le llega al alumno de una
 * sesión guiada, que no es una venta.)
 */
export function isSellableSession(kind: string): boolean {
  return kind === "booking";
}

/**
 * ¿Ocupa la sala sin ser una venta? Gobierna la presentación: estas filas no
 * tienen cliente ni monto, así que la UI las rotula en vez de mostrar un nombre
 * vacío, y la agenda las pinta al fondo.
 */
export function isRoomBlock(kind: string): boolean {
  return kind === "block" || kind === "curso";
}

/**
 * ¿Alguien va a entrar SOLO a la sala y necesita el PIN de la puerta? Solo el
 * cliente que reservó (`booking`, incluida la práctica libre del curso). La sesión
 * guiada (`curso`) no: el dueño o el instructor recibe al alumno en la puerta.
 * `DOOR_ACCESS_KINDS` es la misma lista para los filtros de las consultas.
 */
export const DOOR_ACCESS_KINDS = ["booking"] as const satisfies readonly ReservationKind[];

export function needsDoorAccess(kind: string): boolean {
  return (DOOR_ACCESS_KINDS as readonly string[]).includes(kind);
}

/**
 * ¿Hay a quién recordarle la sesión? El cliente que reservó y el alumno de una
 * sesión guiada (su recordatorio es otro correo, sin PIN). Un bloqueo, a nadie.
 */
export const REMINDER_KINDS = ["booking", "curso"] as const satisfies readonly ReservationKind[];

export function needsReminder(kind: string): boolean {
  return (REMINDER_KINDS as readonly string[]).includes(kind);
}

/**
 * ¿La cabina está TRABAJANDO en esta hora? Es el predicado de ocupación: cuenta
 * la sala vendida y la sala dictando clase, y deja fuera solo el bloqueo de
 * mantención (ahí la sala está cerrada, no ocupada). Lista positiva a propósito:
 * el idioma `!== "block"` es justo el que hizo frágil al `kind` original.
 */
export function occupiesCabin(kind: string): boolean {
  return kind === "booking" || kind === "curso";
}
