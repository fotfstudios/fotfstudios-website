-- Hora liberada: avisar al cliente (auditoría 2026-09-14, H6).
--
-- `expire_abandoned_manual_holds` devolvía solo el conteo, así que el cliente que
-- recibió "Tu hora está tomada — falta el pago" no se enteraba de que el horario se
-- liberó. La variante `_ids` devuelve los pedidos que barrió (para mandar el correo);
-- la original queda como envoltorio que cuenta, misma firma, para el resto de callers.

create or replace function expire_abandoned_manual_holds_ids(p_older_than interval default '72 hours')
returns setof uuid language plpgsql set search_path = public, pg_temp as $$
declare r record;
begin
  for r in
    select o.id from orders o
      where o.status = 'pending_payment'
        and greatest(
              o.created_at,
              coalesce((select max(pi.created_at) from payment_intents pi where pi.order_id = o.id), o.created_at)
            ) < now() - p_older_than
        and exists (
          select 1 from reservations res
          where res.order_id = o.id and res.status = 'held' and res.expires_at is null
        )
  loop
    perform cancel_unpaid_order(r.id);
    return next r.id;
  end loop;
end;
$$;

create or replace function expire_abandoned_manual_holds(p_older_than interval default '72 hours')
returns int language sql set search_path = public, pg_temp as $$
  select count(*)::int from expire_abandoned_manual_holds_ids(p_older_than);
$$;

grant execute on function expire_abandoned_manual_holds_ids(interval) to service_role;
