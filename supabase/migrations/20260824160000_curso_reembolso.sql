-- Reembolso del curso: liberar el cupo cuando se devuelve la plata.
--
-- Va DENTRO de mark_refunded y no en la capa de aplicación por una razón concreta:
-- el webhook de Mercado Pago llama a mark_refunded directo cuando el reembolso se
-- inicia desde el panel de MP. Si la liberación del cupo viviera en el servicio,
-- ese camino devolvería el dinero y dejaría el asiento ocupado para siempre.
-- Mismo criterio que puso la boleta dentro de confirm_course_payment.
--
-- Solo libera en reembolso TOTAL. Un asiento no es divisible: un reembolso parcial
-- de buena voluntad (cortesía, ajuste) no debería expulsar al alumno del curso.
--
-- Para pedidos de sala no cambia NADA: course_enrollments no tiene filas suyas.
create or replace function mark_refunded(p_order uuid, p_refund_id text default null, p_refund_amount int default null)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_total int; v_prev int; v_boleta int; v_refund int; v_reservation uuid;
  v_customer uuid; v_points int; v_ref text; v_earn_net int; v_revoke int; v_restored int; v_restore int;
  v_ids uuid[]; v_amts int[]; v_setts uuid[]; i int; v_to_reverse int; v_retained int; v_remaining int;
  v_nc uuid; v_bol uuid;
begin
  select amount_clp, refunded_amount_clp into v_total, v_prev
    from orders where id = p_order and status in ('paid', 'refunded');
  if v_total is null then return; end if;               -- orden no pagada → ignora

  v_boleta := v_total - v_prev;                          -- saldo vivo (== Σ boletas vivas)
  if v_boleta <= 0 then return; end if;
  v_refund := least(coalesce(p_refund_amount, v_boleta), v_boleta);
  v_reservation := reservation_for_order(p_order);

  update reservations set status = 'cancelled', cancelled_at = now()
    where order_id = p_order and status in ('held', 'confirmed');

  -- CURSO: el cupo vuelve al inventario solo si se devolvió todo el saldo vivo.
  if v_prev + v_refund >= v_total then
    update course_enrollments
       set status = 'anulada', cancelled_at = now()
     where order_id = p_order and status in ('reservada', 'pagada');
  end if;

  update orders
    set status = 'refunded',
        mp_refund_id = coalesce(p_refund_id, mp_refund_id),
        refunded_at = now(),
        refunded_amount_clp = v_prev + v_refund
    where id = p_order;

  if v_reservation is not null then
    perform log_booking_event(v_reservation, 'refunded', p_order => p_order, p_amount => v_refund, p_payment_ref => p_refund_id);
    perform log_booking_event(v_reservation, 'cancelled', p_order => p_order);
  end if;

  -- Puntos: truing por estado objetivo (sin deriva en parciales).
  select c.id, o.points_redeemed_clp into v_customer, v_points
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = p_order;
  if v_customer is not null then
    v_ref := coalesce(p_refund_id, 'manual');
    select coalesce(sum(amount), 0) into v_earn_net from points_ledger
      where order_id = p_order and kind in ('earn', 'earn_revoke');
    v_revoke := greatest(0, v_earn_net - floor(0.05 * (v_total - v_prev - v_refund))::int);
    if v_revoke > 0 and apply_points(v_customer, p_order, 'earn_revoke', -v_revoke, v_ref) then
      if v_reservation is not null then perform log_booking_event(v_reservation, 'points_revoked', p_order => p_order, p_amount => v_revoke); end if;
    end if;
    if v_points > 0 then
      select coalesce(sum(amount), 0) into v_restored from points_ledger
        where order_id = p_order and kind = 'redeem_restore';
      v_restore := floor(v_points::numeric * (v_prev + v_refund) / v_total)::int - v_restored;
      if v_restore > 0 then perform apply_points(v_customer, p_order, 'redeem_restore', v_restore, v_ref); end if;
    end if;
  end if;

  -- SII: anular boletas vivas más-antigua-primero hasta v_refund; saldo reemitido por-pago.
  select array_agg(id order by created_at, id),
         array_agg(total - reversed_clp order by created_at, id),
         array_agg(settlement_order_id order by created_at, id)
    into v_ids, v_amts, v_setts
    from tax_documents where order_id = p_order and kind = 'boleta' and reversed_clp < total;
  v_remaining := v_refund;
  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    exit when v_remaining <= 0;
    v_to_reverse := least(v_remaining, v_amts[i]);
    v_nc := create_nota_credito_amount(p_order, v_ids[i], v_amts[i]);
    if v_reservation is not null then perform log_booking_event(v_reservation, 'nota_credito_issued', p_order => p_order, p_tax_doc => v_nc, p_amount => v_amts[i]); end if;
    v_retained := v_amts[i] - v_to_reverse;
    if v_retained > 0 then
      v_bol := create_boleta_amount(p_order, v_retained, v_setts[i]);
      if v_reservation is not null then perform log_booking_event(v_reservation, 'boleta_issued', p_order => p_order, p_tax_doc => v_bol, p_amount => v_retained); end if;
    end if;
    v_remaining := v_remaining - v_to_reverse;
  end loop;
end;
$$;
