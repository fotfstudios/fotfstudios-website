-- Consentimiento de T&C por reserva (rastro de auditoría). Se registra en el pedido
-- al crearlo. `terms_source` distingue el origen del consentimiento:
--   'customer' → el cliente marcó el checkbox en /reservar (clic real).
--   'staff'    → reserva manual: el dueño atestigua que el cliente aceptó (walk-in/tel/WA).
--   NULL       → sin consentimiento en registro (p. ej. reservas viejas).
-- La marca de tiempo la pone el server (now()), nunca el cliente; la versión la fija
-- el server desde TERMS_VERSION. Columnas nullable → retrocompatible (expand/contract).

alter table orders add column terms_accepted_at timestamptz;
alter table orders add column terms_version     text;
alter table orders add column terms_source      text
  check (terms_source in ('customer', 'staff'));

-- create_checkout gana p_terms_version / p_terms_source. PostgREST no desambigua
-- overloads → drop + create (no `create or replace` con params extra). La firma
-- que se elimina es la vigente de 20260704113000_customers_points.sql.
drop function create_checkout(uuid, timestamptz, timestamptz, int, int, int, text, jsonb, jsonb, jsonb, interval, uuid, int);

create function create_checkout(
  p_resource      uuid,
  p_starts        timestamptz,
  p_ends          timestamptz,
  p_amount        int,
  p_net           int,
  p_tax           int,
  p_currency      text,
  p_customer      jsonb,
  p_snapshot      jsonb,
  p_lines         jsonb,
  p_ttl           interval default interval '10 minutes',
  p_customer_id   uuid default null,
  p_points        int default 0,
  p_terms_version text default null,
  p_terms_source  text default null
)
returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare
  v_res     uuid;
  v_order   uuid;
  v_line    jsonb;
  v_balance int;
begin
  perform expire_stale_holds(p_resource);

  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at,
                            customer_name, customer_email, customer_phone)
    values (p_resource, 'booking', 'held', p_starts, p_ends, now() + p_ttl,
            p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone')
    returning id into v_res;

  -- terms_*: el consentimiento se sella solo si viene un origen (p_terms_source);
  -- la marca de tiempo es del server (now()), no del cliente.
  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot,
                      terms_accepted_at, terms_version, terms_source)
    values ('pending_payment', p_currency, p_amount, p_net, p_tax,
            p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone', p_snapshot,
            case when p_terms_source is not null then now() end,
            case when p_terms_source is not null then p_terms_version end,
            p_terms_source)
    returning id into v_order;

  update reservations set order_id = v_order where id = v_res;

  -- Canje: el FOR UPDATE serializa "verificar saldo y descontar" — si dos
  -- checkouts compiten por el mismo saldo, el perdedor aborta y su transacción
  -- completa (hold + orden + líneas) se revierte.
  if p_points > 0 then
    select points_balance into v_balance from customers where id = p_customer_id for update;
    if v_balance is null then raise exception 'points_without_customer'; end if;
    if v_balance < p_points then raise exception 'insufficient_points'; end if;
    perform apply_points(p_customer_id, v_order, 'redeem', -p_points, '');
    update orders set points_redeemed_clp = p_points where id = v_order;
  end if;

  for v_line in select jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, line_type, reservation_id, addon_key, description,
                             quantity, unit_price_clp, subtotal_clp)
      values (v_order,
              v_line ->> 'line_type',
              case when v_line ->> 'line_type' = 'room_time' then v_res else null end,
              v_line ->> 'addon_key',
              v_line ->> 'description',
              coalesce((v_line ->> 'quantity')::int, 1),
              (v_line ->> 'unit_price_clp')::int,
              (v_line ->> 'subtotal_clp')::int);
  end loop;

  -- Orden 100% puntos: confirmar aquí mismo evita la ventana "creada pero no
  -- confirmada" de un round-trip extra. El prefijo 'offline:' ya significa
  -- "no es un pago real de MP" para RefundService y analytics.
  if p_points > 0 and p_amount = 0 then
    perform confirm_payment(v_order, 'offline:puntos');
  end if;

  return v_order;
end;
$$;
