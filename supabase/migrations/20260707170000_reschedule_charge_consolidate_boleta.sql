-- A2: el encarecimiento (apply_reschedule_charge, slot libre) consolida en vez de apilar.
-- Antes: sumaba el delta a amount_clp e insertaba una boleta incremental → 2 boletas vivas,
-- rompiendo el invariante "una sola boleta viva = amount − refunded" (I1). Ahora anula la
-- boleta viva anterior con una NC y re-emite una boleta por el nuevo total, igual que
-- reschedule_down. El resto de la función (slot tomado, earn, estados) queda idéntico.
create or replace function apply_reschedule_charge(p_delta_order uuid, p_payment_id text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_resched uuid; v_reservation uuid; v_order uuid;
  v_starts timestamptz; v_ends timestamptz; v_delta int; v_snapshot jsonb; v_lines jsonb;
  v_delta_net int; v_delta_tax int; v_customer uuid; v_earn int;
  v_old_live int;
begin
  select id, reservation_id, original_order_id, new_starts_at, new_ends_at, delta_clp, new_snapshot, new_lines
    into v_resched, v_reservation, v_order, v_starts, v_ends, v_delta, v_snapshot, v_lines
    from reschedules where delta_order_id = p_delta_order and status = 'pending_charge'
    for update;
  if v_resched is null then return 'noop'; end if;

  select net_clp, tax_clp into v_delta_net, v_delta_tax from orders where id = p_delta_order;

  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_delta_order and status not in ('paid', 'fulfilled');

  begin
    update reservations set starts_at = v_starts, ends_at = v_ends
      where id = v_reservation and status = 'confirmed';
  exception when exclusion_violation then
    insert into tax_documents (order_id, kind, neto, iva, total)
      values (p_delta_order, 'boleta', v_delta_net, v_delta_tax, v_delta);
    update reschedules set status = 'failed_slot_taken' where id = v_resched;
    return 'slot_taken';
  end;

  -- Slot libre. CONSOLIDAR (I1): NC por la boleta viva anterior ANTES de subir amount_clp
  -- (el ratio neto/IVA reversa exacto la boleta vieja), luego mover el total, luego boleta
  -- nueva por el total nuevo.
  select amount_clp - refunded_amount_clp into v_old_live from orders where id = v_order;
  perform create_nota_credito_amount(v_order, v_old_live);

  update orders
    set amount_clp = amount_clp + v_delta,
        net_clp = net_clp + v_delta_net,
        tax_clp = tax_clp + v_delta_tax,
        pricing_snapshot = coalesce(v_snapshot, pricing_snapshot)
    where id = v_order;

  perform create_boleta_amount(v_order, v_old_live + v_delta);  -- boleta por el nuevo total

  delete from order_lines where order_id = v_order;
  insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
    select v_order, l.line_type, case when l.line_type = 'room_time' then v_reservation end,
           l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
    from jsonb_to_recordset(v_lines)
      as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);

  select c.id into v_customer
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = v_order;
  if v_customer is not null then
    v_earn := floor(0.05 * v_delta)::int;
    if v_earn > 0 then perform apply_points(v_customer, v_order, 'earn', v_earn, 'reschedule:' || p_delta_order); end if;
  end if;

  update orders set status = 'fulfilled' where id = p_delta_order;
  update reschedules set status = 'applied', applied_at = now() where id = v_resched;
  return 'applied';
end;
$$;
