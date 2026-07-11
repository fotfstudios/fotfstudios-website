-- B1: barre reservas manuales pendientes abandonadas (hold firme, expires_at NULL) tras
-- p_older_than sin pagar → cancel_unpaid_order (reserva 'expired' + orden 'cancelled').
-- Discriminador: orden pending_payment con reserva held y expires_at IS NULL. No toca los
-- holds del cliente (expiración de 10 min, no NULL) ni cortesías (confirmed, sin orden).
create function expire_abandoned_manual_holds(p_older_than interval default '72 hours')
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_count int := 0; r record;
begin
  for r in
    select o.id from orders o
      where o.status = 'pending_payment'
        and o.created_at < now() - p_older_than
        and exists (
          select 1 from reservations res
          where res.order_id = o.id and res.status = 'held' and res.expires_at is null
        )
  loop
    perform cancel_unpaid_order(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
