-- La promo de primera reserva ya no se repite con alias de Gmail (auditoría de seguridad
-- 2026-10-12, hallazgo 3).
--
-- first_booking_promo_used comparaba `lower(email)`, así que `ana+1@gmail.com`,
-- `a.na@gmail.com` y `ana@googlemail.com` eran tres "primeras reservas" de la misma casilla.
-- Gmail ignora los puntos y lo que va tras `+` en la parte local, y googlemail.com es el mismo
-- dominio: email_promo_key los reduce a una sola llave. Solo para Gmail — en otros dominios
-- el `+` y los puntos pueden ser buzones distintos de verdad.
--
-- Solo cambia la elegibilidad de la promo: el pedido sigue guardando el email tal como se
-- tipeó (en minúsculas), y los puntos/fichas siguen resolviendo por email exacto.

create or replace function email_promo_key(p_email text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
  select case
    when s.e is null then null
    when split_part(s.e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(s.e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else s.e
  end
  from (select nullif(lower(trim(p_email)), '') as e) s;
$$;

create index if not exists orders_customer_email_promo_key_idx
  on orders (email_promo_key(customer_email)) where customer_email is not null;

-- Mismo cuerpo que 20260914130000 salvo la comparación (ver ahí el porqué de cada regla).
create or replace function first_booking_promo_used(p_email text)
returns boolean language sql stable
set search_path = public, pg_temp as $$
  select exists (
    select 1 from orders o
     where o.customer_email is not null
       and email_promo_key(o.customer_email) = email_promo_key(p_email)
       and o.kind = 'booking'
       and o.status in ('paid', 'fulfilled', 'refunded')
  );
$$;

revoke execute on function email_promo_key(text) from public, anon, authenticated;
grant  execute on function email_promo_key(text) to service_role;
revoke execute on function first_booking_promo_used(text) from public, anon, authenticated;
grant  execute on function first_booking_promo_used(text) to service_role;
