-- Reagendamiento a un horario MÁS CARO (cobro diferido). El cliente está ausente,
-- así que la reserva NO se mueve hasta que el extra esté pagado Y el slot siga libre.
--
-- Flujo: create_reschedule_charge crea una ORDEN DE DELTA (pending_payment, sin
-- reserva ni hold) + una fila reschedules 'pending_charge'. El cliente paga esa
-- orden por Checkout Pro; el webhook llama apply_reschedule_charge, que:
--   • slot libre  → mueve el rango, dobla el delta en la orden ORIGINAL, boleta
--                   incremental por el delta, earn del 5%, delta order 'fulfilled'.
--   • slot tomado → NO mueve; emite boleta por el delta cobrado y marca
--                   'failed_slot_taken' (el caller reembolsa el excedente en MP).
-- apply_reschedule_charge es idempotente (guard por status 'pending_charge').

-- ── RPC C: iniciar el cobro (no mueve nada) ─────────────────────────────────
create function create_reschedule_charge(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb,
  p_delta int, p_delta_net int, p_delta_tax int, p_created_by uuid default null
) returns table(reschedule_id uuid, delta_order_id uuid)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_live int;
  v_name text; v_email text; v_phone text; v_currency text;
  v_delta_order uuid; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  select amount_clp - refunded_amount_clp, customer_name, customer_email, customer_phone, currency
    into v_live, v_name, v_email, v_phone, v_currency
    from orders where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0;
  if v_live is null then raise exception 'reschedule_not_eligible'; end if;
  if p_delta < 1 then raise exception 'reschedule_bad_delta'; end if;

  -- Orden de delta: solo cobra el extra. Sin reserva ni hold (el cliente ausente
  -- puede pagar más tarde; la reserva original sigue intacta mientras tanto).
  insert into orders (status, currency, amount_clp, net_clp, tax_clp, customer_name, customer_email, customer_phone)
    values ('pending_payment', v_currency, p_delta, p_delta_net, p_delta_tax, v_name, v_email, v_phone)
    returning id into v_delta_order;

  insert into reschedules (reservation_id, original_order_id, delta_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp,
      new_snapshot, new_lines, created_by)
    values (p_reservation, v_order, v_delta_order, 'charge', 'pending_charge',
      v_old_start, v_old_end, p_starts, p_ends, v_live, v_live + p_delta, p_delta, p_snapshot, p_lines, p_created_by)
    returning id into v_resched;

  return query select v_resched, v_delta_order;
end;
$$;

-- ── RPC D: finalizar al pagarse el delta (mueve solo si el slot sigue libre) ──
create function apply_reschedule_charge(p_delta_order uuid, p_payment_id text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_resched uuid; v_reservation uuid; v_order uuid;
  v_starts timestamptz; v_ends timestamptz; v_delta int; v_snapshot jsonb; v_lines jsonb;
  v_delta_net int; v_delta_tax int; v_customer uuid; v_earn int;
begin
  select id, reservation_id, original_order_id, new_starts_at, new_ends_at, delta_clp, new_snapshot, new_lines
    into v_resched, v_reservation, v_order, v_starts, v_ends, v_delta, v_snapshot, v_lines
    from reschedules where delta_order_id = p_delta_order and status = 'pending_charge'
    for update;
  if v_resched is null then return 'noop'; end if;  -- ya aplicada/expirada/inexistente → idempotente

  select net_clp, tax_clp into v_delta_net, v_delta_tax from orders where id = p_delta_order;

  -- Marcar la orden de delta pagada (guard anti-doble).
  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_delta_order and status not in ('paid', 'fulfilled');

  -- Intentar mover el rango. Si otra reserva tomó el slot mientras el cliente
  -- pagaba, el GiST lanza exclusion_violation: NO se mueve y el caller reembolsa.
  begin
    update reservations set starts_at = v_starts, ends_at = v_ends
      where id = v_reservation and status = 'confirmed';
  exception when exclusion_violation then
    insert into tax_documents (order_id, kind, neto, iva, total)
      values (p_delta_order, 'boleta', v_delta_net, v_delta_tax, v_delta); -- boleta por el delta cobrado
    update reschedules set status = 'failed_slot_taken' where id = v_resched;
    return 'slot_taken';
  end;

  -- Slot libre: doblar el delta en la orden ORIGINAL + boleta incremental + earn.
  update orders
    set amount_clp = amount_clp + v_delta,
        net_clp = net_clp + v_delta_net,
        tax_clp = tax_clp + v_delta_tax,
        pricing_snapshot = coalesce(v_snapshot, pricing_snapshot)
    where id = v_order;

  delete from order_lines where order_id = v_order;
  insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
    select v_order, l.line_type, case when l.line_type = 'room_time' then v_reservation end,
           l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
    from jsonb_to_recordset(v_lines)
      as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);

  insert into tax_documents (order_id, kind, neto, iva, total)
    values (v_order, 'boleta', v_delta_net, v_delta_tax, v_delta); -- boleta incremental por el delta

  select c.id into v_customer
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = v_order;
  if v_customer is not null then
    v_earn := floor(0.05 * v_delta)::int;
    -- ref distinto ('reschedule:<delta>') para no chocar con el earn original (order,'earn','').
    if v_earn > 0 then perform apply_points(v_customer, v_order, 'earn', v_earn, 'reschedule:' || p_delta_order); end if;
  end if;

  update orders set status = 'fulfilled' where id = p_delta_order;  -- delta consumido en la orden original
  update reschedules set status = 'applied', applied_at = now() where id = v_resched;
  return 'applied';
end;
$$;

-- ── RPC E: barrer cobros de reagendamiento abandonados ──────────────────────
create function expire_abandoned_reschedules(p_older_than interval default '72 hours')
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_count int := 0; r record;
begin
  for r in
    select id, delta_order_id from reschedules
      where status = 'pending_charge' and created_at < now() - p_older_than
  loop
    update orders set status = 'cancelled' where id = r.delta_order_id and status = 'pending_payment';
    update reschedules set status = 'expired' where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
