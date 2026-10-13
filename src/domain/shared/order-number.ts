/**
 * Número corto del pedido: los 8 primeros caracteres del id. Es el MISMO número que
 * muestran /reserva/estado, el admin y la descripción del cobro en Mercado Pago, así que
 * el cliente puede citarlo por WhatsApp y el dueño lo encuentra.
 */
export function orderShort(orderId: string): string {
  return orderId.slice(0, 8);
}
