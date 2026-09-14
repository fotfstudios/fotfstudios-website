-- Seguimientos de la auditoría 2026-09-13 (tras #152–#154).
--
-- 1. confirm_payment: un pago tardío (webhook, reconcile o "marcar pagado" del admin) que llega
--    cuando el barrido ya expiró el hold RE-TOMA el cupo si sigue libre y la sesión aún no
--    empieza. Antes caía SIEMPRE en 'paid_no_hold' (revisión del dueño, sin boleta, cliente en
--    silencio) — con el barrido por minuto (#152) eso pasaba a ser el desenlace normal de
--    cualquier aprobación que entrara segundos después del vencimiento. La exclusion
--    constraint decide: si otro ya tomó el cupo, el update revienta con 23P01 y se sigue por
--    'paid_no_hold'. Una reserva 'cancelled' es una decisión (cliente/admin), no un barrido:
--    nunca se re-toma. Misma firma → create or replace, sin cambios en database.types.
create or replace function confirm_payment(p_order uuid, p_payment_id text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_held int; v_customer uuid; v_amount int; v_points int; v_earn int;
  v_reservation uuid; v_paid_rows int; v_bol uuid; v_reacquired boolean := false;
begin
  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_order and status <> 'paid';
  get diagnostics v_paid_rows = row_count;

  update reservations set status = 'confirmed', expires_at = null
    where order_id = p_order and status = 'held';
  get diagnostics v_held = row_count;

  -- Pago tardío sobre un hold que el barrido ya expiró: re-tomar si el cupo sigue libre
  -- (la exclusion constraint reservations_no_overlap lo decide) y la sesión no empezó.
  if v_held = 0 then
    begin
      update reservations set status = 'confirmed', expires_at = null
        where order_id = p_order and status = 'expired' and kind = 'booking' and starts_at > now();
      get diagnostics v_held = row_count;
      v_reacquired := v_held > 0;
    exception when exclusion_violation then
      v_held := 0; -- otro cliente tiene el cupo → paid_no_hold, como hasta ahora
    end;
  end if;

  update payment_intents set payment_id = p_payment_id, status = 'approved' where order_id = p_order;

  select id into v_reservation from reservations where order_id = p_order and kind = 'booking' limit 1;
  select c.id, o.amount_clp, o.points_redeemed_clp into v_customer, v_amount, v_points
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = p_order;

  -- Solo en la transición real a 'paid' (idempotente ante re-entregas del webhook).
  if v_paid_rows > 0 and v_reservation is not null then
    perform log_booking_event(v_reservation, 'payment_confirmed', p_order => p_order, p_amount => v_amount,
      p_payment_ref => p_payment_id,
      p_detail => case when v_reacquired then '{"reacquired": true}'::jsonb end);
  end if;

  if v_customer is not null then
    if v_points > 0 and exists (select 1 from points_ledger where order_id = p_order and kind = 'redeem_release') then
      perform apply_points(v_customer, p_order, 'redeem', -v_points, 'late:' || p_payment_id);
    end if;
    v_earn := floor(0.05 * v_amount)::int;
    if v_earn > 0 and apply_points(v_customer, p_order, 'earn', v_earn, '') then
      if v_reservation is not null then perform log_booking_event(v_reservation, 'points_earned', p_order => p_order, p_amount => v_earn); end if;
    end if;
  end if;

  if v_held > 0 then
    insert into tax_documents (order_id, kind, neto, iva, total)
      select o.id, 'boleta', o.net_clp, o.tax_clp, o.amount_clp from orders o
      where o.id = p_order and o.amount_clp > 0
        and not exists (select 1 from tax_documents t where t.order_id = p_order and t.kind = 'boleta')
      returning id into v_bol;
    if v_bol is not null and v_reservation is not null then
      perform log_booking_event(v_reservation, 'boleta_issued', p_order => p_order, p_tax_doc => v_bol, p_amount => v_amount);
    end if;
    return 'confirmed';
  end if;

  if exists (select 1 from reservations where order_id = p_order and status = 'confirmed') then
    return 'confirmed';
  end if;

  update orders set notified_at = now() where id = p_order and notified_at is null;
  return 'paid_no_hold';
end;
$$;

-- 2. expire_abandoned_manual_holds: el reloj de 72 h corre desde el ÚLTIMO link de pago
--    (payment_intents.created_at), no solo desde la creación de la orden. Un link regenerado
--    el día 2 vale 72 h y el hold firme debe vivir lo mismo; también alinea el hold de cliente
--    afirmado por "Generar link" (#153) con la vida exacta de su link.
create or replace function expire_abandoned_manual_holds(p_older_than interval default '72 hours')
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_count int := 0; r record;
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
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
