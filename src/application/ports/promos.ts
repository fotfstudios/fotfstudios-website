/**
 * Lectura segregada para la promo de primera reserva (no ensancha el repo de
 * clientes ni el de checkout: sus fakes en tests quedarían obligados a crecer).
 */
export interface FirstBookingPromoReader {
  /** ¿Este correo (ya normalizado) tiene una reserva de sala pagada? rpc `first_booking_promo_used`. */
  used(email: string): Promise<boolean>;
}
