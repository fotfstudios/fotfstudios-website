-- Promo "20% en tu primera reserva": predicado de elegibilidad.
--
-- `first_booking_promo_used(email)` responde si un correo YA tiene una reserva de
-- sala pagada. Es la única definición de "primera reserva" — la leen el checkout
-- público (aplica la línea de descuento) y el endpoint de previsualización.
--
-- Reglas y por qué:
--  · Compara `lower(customer_email)`: los pedidos nuevos ya guardan el email en
--    minúsculas, pero las filas anteriores a la migración del directorio pueden
--    traer mayúsculas. Mismo criterio que award_retro_points.
--  · `status in ('paid','fulfilled','refunded')`: lo que alguna vez se pagó cuenta.
--    Un reembolso PARCIAL (reagendar a menos horas) deja el pedido en 'refunded'
--    aunque la sesión ocurrió; si no contara, esa persona volvería a ser "primera".
--    Un reembolso total también la consume — el staff puede regalar el 20% a mano
--    desde la consola si el reembolso fue culpa del estudio.
--  · `kind = 'booking'`: pedidos del curso no son reservas de sala. Los pedidos
--    delta de reagendamiento también son 'booking' pero solo existen junto a un
--    original pagado, así que incluirlos es inocuo.
--  · No mira `reservations`: una cortesía (reserva confirmada sin pedido) no
--    consume la promo — nunca hubo un pago.
--  · `pending_payment` NO cuenta: un checkout abandonado o con la tarjeta
--    rechazada no puede quemar la promo. Carrera aceptada: dos checkouts
--    simultáneos del mismo correo la reciben ambos.
--
-- Seguridad: `security invoker` (RLS de orders sin políticas) y además se revoca
-- para anon/authenticated — la anon key es pública y la función sería un oráculo
-- de "¿este correo reservó aquí?". Solo el servidor (service_role) la llama.

create index if not exists orders_customer_email_lower_idx
  on orders (lower(customer_email)) where customer_email is not null;

create or replace function first_booking_promo_used(p_email text)
returns boolean language sql stable
set search_path = public, pg_temp as $$
  select exists (
    select 1 from orders o
     where o.customer_email is not null
       and lower(o.customer_email) = lower(trim(p_email))
       and o.kind = 'booking'
       and o.status in ('paid', 'fulfilled', 'refunded')
  );
$$;

revoke execute on function first_booking_promo_used(text) from public, anon, authenticated;
grant  execute on function first_booking_promo_used(text) to service_role;
