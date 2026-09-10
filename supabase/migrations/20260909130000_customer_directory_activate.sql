-- Directorio de clientes (PR3, activación). Ver docs/superpowers/specs/2026-09-09-directorio-clientes-design.md.
--
-- PR1 dejó el esquema y las funciones DEFINIDAS pero sin ejecutar; PR2 cortó la suposición
-- customers.id = auth.users.id en el código. Acá se ACTIVA el vínculo: se corre el backfill
-- histórico, se otorgan los puntos retroactivos y create_checkout / create_reschedule_charge
-- pasan a escribir customer_id (misma firma; create or replace, nunca drop → expand/contract).
--
-- INVARIANTE (spec §"Invariante central"): quien escribe customer_id reescribe también
-- customer_name/customer_email/customer_phone DESDE la ficha, así el FK y la join por email
-- (c.email = lower(o.customer_email), que usan las ocho funciones de puntos) nunca discrepan.
--
-- Regex: UNA barra invertida (standard_conforming_strings = on).

-- ── 1. PRECONDICIÓN: customer_sync_snapshots deja de ser destructivo ──
-- El email de la ficha SIGUE mandando (las funciones de puntos resuelven por ahí y un snapshot
-- con el email viejo haría que mark_refunded / reschedule_* revoquen a nadie — o al cliente
-- equivocado si otra ficha tomara esa dirección). Nombre y teléfono, en cambio, se COALESCEAN
-- contra lo que ya tenía el pedido/reserva: la ficha suele ser la fuente MÁS POBRE (en prod las
-- tres fichas tienen name y phone en NULL mientras 13 reservas llevan nombre y 5 llevan
-- teléfono), y copiar esos NULL encima borraba el contacto de reservas pagadas y confirmadas.
-- Tiene que ir ANTES del backfill y antes de que cualquier escritor nuevo llame al helper.
create or replace function customer_sync_snapshots(p_customer uuid, p_old_email text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  c customers%rowtype;
begin
  select * into c from customers where id = p_customer;
  if c.id is null then raise exception 'customer_not_found'; end if;

  update orders o
     set customer_id    = c.id,
         customer_name  = coalesce(c.name,  o.customer_name),
         customer_email = c.email,
         customer_phone = coalesce(c.phone, o.customer_phone)
   where o.customer_id = c.id
      or (o.customer_id is null and o.customer_email is not null
          and lower(o.customer_email) in (lower(p_old_email), c.email));

  update reservations r
     set customer_id    = c.id,
         customer_name  = coalesce(c.name,  r.customer_name),
         customer_email = c.email,
         customer_phone = coalesce(c.phone, r.customer_phone)
   where r.customer_id = c.id
      or (r.customer_id is null and r.customer_email is not null
          and lower(r.customer_email) in (lower(p_old_email), c.email));
end;
$$;
