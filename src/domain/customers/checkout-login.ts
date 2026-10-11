/**
 * ¿Ofrecerle a un invitado del checkout que entre con su correo? Solo cuando la ficha de
 * ese correo tiene Beatcoins: es lo único que la sesión le suma a una reserva (el resto
 * de los datos los escribe igual). Responder solo esto —y no "tiene cuenta"— acota lo
 * que la consulta revela de un correo ajeno.
 */
export function suggestsCheckoutLogin(profile: { pointsBalance: number } | null): boolean {
  return !!profile && profile.pointsBalance > 0;
}
