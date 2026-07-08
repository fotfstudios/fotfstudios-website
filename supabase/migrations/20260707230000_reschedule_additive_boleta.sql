-- Reescritura de las RPC de reagendamiento/reembolso al modelo multi-boleta (I1')
-- e instrumentación del log booking_events (fila por movimiento, atómica con el cambio).
--
--   • Encarecer: boleta DELTA aditiva (la original sigue viva) en vez de consolidar
--     (reemplaza 20260707170000). La boleta delta la financia el pago de la orden de
--     delta (settlement_order_id) → reembolsos por-pago quedan ruteables.
--   • Abaratar / reembolsar: anular boletas vivas MÁS-ANTIGUA-PRIMERO hasta cubrir el
--     monto, reemitiendo el saldo de la boleta parcial financiado por SU pago. Cada NC
--     enlazada a su boleta (reverses_document_id).
--   • FOR UPDATE en reschedule_move / reschedule_down (como apply_reschedule_charge).
--   • Earn: truing hacia floor(0.05 · live) en todos los caminos.
--
-- Invariante I1': Σ(boletas vivas) = amount_clp − refunded_amount_clp.

-- ── create_boleta_amount gana settlement (qué pago financia la boleta) ───────
drop function if exists create_boleta_amount(uuid, int);
create function create_boleta_amount(p_order uuid, p_total int, p_settlement uuid default null)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_net int;
begin
  if p_total is null or p_total <= 0 then return null; end if;   -- guard $0
  select round(p_total::numeric * net_clp / amount_clp)::int into v_net from orders where id = p_order;
  insert into tax_documents (order_id, kind, neto, iva, total, settlement_order_id)
    values (p_order, 'boleta', v_net, p_total - v_net, p_total, coalesce(p_settlement, p_order))
    returning id into v_id;
  return v_id;
end;
$$;

-- ── reschedule_move (mismo precio) — + FOR UPDATE + evento ──────────────────
create or replace function reschedule_move(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb, p_note text default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_live int; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  select amount_clp - refunded_amount_clp into v_live
    from orders where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0
    for update;
  if v_live is null then raise exception 'reschedule_not_eligible'; end if;

  update reservations set starts_at = p_starts, ends_at = p_ends where id = p_reservation;  -- GiST

  delete from order_lines where order_id = v_order;
  insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
    select v_order, l.line_type, case when l.line_type = 'room_time' then p_reservation end,
           l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
    from jsonb_to_recordset(p_lines)
      as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);
  update orders set pricing_snapshot = coalesce(p_snapshot, pricing_snapshot) where id = v_order;

  if p_note is not null and p_note <> '' then
    update reservations set notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || p_note) where id = p_reservation;
  end if;

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp, new_snapshot, new_lines, applied_at)
    values (p_reservation, v_order, 'equal', 'applied',
      v_old_start, v_old_end, p_starts, p_ends, v_live, v_live, 0, p_snapshot, p_lines, now())
    returning id into v_resched;

  perform log_booking_event(p_reservation, 'reschedule_moved', p_order => v_order, p_reschedule => v_resched,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', p_starts));
  return v_resched;
end;
$$;

-- ── reschedule_down (más barato) — multi-boleta + FOR UPDATE + eventos ──────
create or replace function reschedule_down(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb, p_refund_id text, p_refund_amount int, p_note text default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz;
  v_live_total int; v_new_total int; v_dummy int;
  v_customer uuid; v_earn_net int; v_revoke int; v_resched uuid; v_nc uuid; v_bol uuid;
  v_ids uuid[]; v_amts int[]; v_setts uuid[]; i int; v_to_reverse int; v_retained int; v_remaining int;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  select 1 into v_dummy
    from orders where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0
    for update;
  if v_dummy is null then raise exception 'reschedule_not_eligible'; end if;

  v_resched := gen_random_uuid();  -- pre-generado → ref único de puntos por evento

  select coalesce(sum(total - reversed_clp), 0) into v_live_total
    from tax_documents where order_id = v_order and kind = 'boleta' and reversed_clp < total;
  if p_refund_amount < 1 or p_refund_amount > v_live_total then raise exception 'reschedule_bad_delta'; end if;
  v_new_total := v_live_total - p_refund_amount;

  -- La fila de auditoría se inserta ANTES de los eventos (que la referencian por FK).
  -- Si el asiento aborta luego (GiST), la tx entera revierte incluyendo esta fila.
  insert into reschedules (id, reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp, new_snapshot, new_lines, applied_at)
    values (v_resched, p_reservation, v_order, 'refund', 'applied',
      v_old_start, v_old_end, p_starts, p_ends, v_live_total, v_new_total, p_refund_amount, p_snapshot, p_lines, now());

  update reservations set starts_at = p_starts, ends_at = p_ends where id = p_reservation;  -- GiST

  update orders
    set refunded_amount_clp = refunded_amount_clp + p_refund_amount,
        mp_refund_id = coalesce(p_refund_id, mp_refund_id),
        pricing_snapshot = coalesce(p_snapshot, pricing_snapshot)
    where id = v_order;

  delete from order_lines where order_id = v_order;
  insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
    select v_order, l.line_type, case when l.line_type = 'room_time' then p_reservation end,
           l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
    from jsonb_to_recordset(p_lines)
      as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);

  perform log_booking_event(p_reservation, 'reschedule_refund', p_order => v_order, p_reschedule => v_resched,
    p_amount => p_refund_amount, p_payment_ref => p_refund_id);

  -- Earn: truing hacia floor(0.05 · nuevo total). Ref único por evento (reschedule.id).
  select c.id into v_customer
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = v_order;
  if v_customer is not null then
    select coalesce(sum(amount), 0) into v_earn_net from points_ledger
      where order_id = v_order and kind in ('earn', 'earn_revoke');
    v_revoke := greatest(0, v_earn_net - floor(0.05 * v_new_total)::int);
    if v_revoke > 0 and apply_points(v_customer, v_order, 'earn_revoke', -v_revoke, 'reschedule:' || v_resched) then
      perform log_booking_event(p_reservation, 'points_revoked', p_order => v_order, p_reschedule => v_resched, p_amount => v_revoke);
    end if;
  end if;

  -- SII: snapshot de boletas vivas (evita re-scan), anular más-antigua-primero hasta el
  -- refund; el saldo de la boleta parcial se reemite financiado por SU pago.
  select array_agg(id order by created_at, id),
         array_agg(total - reversed_clp order by created_at, id),
         array_agg(settlement_order_id order by created_at, id)
    into v_ids, v_amts, v_setts
    from tax_documents where order_id = v_order and kind = 'boleta' and reversed_clp < total;
  v_remaining := p_refund_amount;
  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    exit when v_remaining <= 0;
    v_to_reverse := least(v_remaining, v_amts[i]);
    v_nc := create_nota_credito_amount(v_order, v_ids[i], v_amts[i]);
    perform log_booking_event(p_reservation, 'nota_credito_issued', p_order => v_order, p_tax_doc => v_nc, p_amount => v_amts[i]);
    v_retained := v_amts[i] - v_to_reverse;
    if v_retained > 0 then
      v_bol := create_boleta_amount(v_order, v_retained, v_setts[i]);
      perform log_booking_event(p_reservation, 'boleta_issued', p_order => v_order, p_tax_doc => v_bol, p_amount => v_retained);
    end if;
    v_remaining := v_remaining - v_to_reverse;
  end loop;

  if p_note is not null and p_note <> '' then
    update reservations set notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || p_note) where id = p_reservation;
  end if;

  perform log_booking_event(p_reservation, 'reschedule_moved', p_order => v_order, p_reschedule => v_resched,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', p_starts));

  return v_resched;
end;
$$;

-- ── apply_reschedule_charge (más caro) — boleta delta ADITIVA + earn truing + eventos ─
create or replace function apply_reschedule_charge(p_delta_order uuid, p_payment_id text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_resched uuid; v_reservation uuid; v_order uuid;
  v_starts timestamptz; v_ends timestamptz; v_delta int; v_snapshot jsonb; v_lines jsonb;
  v_old_start timestamptz; v_delta_net int; v_delta_tax int; v_customer uuid;
  v_new_live int; v_earn_net int; v_target int; v_earn_add int; v_bol uuid;
begin
  select id, reservation_id, original_order_id, old_starts_at, new_starts_at, new_ends_at, delta_clp, new_snapshot, new_lines
    into v_resched, v_reservation, v_order, v_old_start, v_starts, v_ends, v_delta, v_snapshot, v_lines
    from reschedules where delta_order_id = p_delta_order and status = 'pending_charge'
    for update;
  if v_resched is null then return 'noop'; end if;

  select net_clp, tax_clp into v_delta_net, v_delta_tax from orders where id = p_delta_order;

  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_delta_order and status not in ('paid', 'fulfilled');
  perform log_booking_event(v_reservation, 'reschedule_charge_paid', p_order => p_delta_order,
    p_reschedule => v_resched, p_amount => v_delta, p_payment_ref => p_payment_id);

  begin
    update reservations set starts_at = v_starts, ends_at = v_ends
      where id = v_reservation and status = 'confirmed';
  exception when exclusion_violation then
    -- Slot tomado: la reserva NO se movió → la boleta del delta cobrado vive en la
    -- orden de delta (financiada por su propio pago); el caller reembolsa el excedente.
    insert into tax_documents (order_id, kind, neto, iva, total, settlement_order_id)
      values (p_delta_order, 'boleta', v_delta_net, v_delta_tax, v_delta, p_delta_order) returning id into v_bol;
    perform log_booking_event(v_reservation, 'boleta_issued', p_order => p_delta_order, p_tax_doc => v_bol, p_amount => v_delta);
    perform log_booking_event(v_reservation, 'reschedule_failed_slot_taken', p_order => p_delta_order,
      p_reschedule => v_resched, p_amount => v_delta,
      p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', v_starts));
    update reschedules set status = 'failed_slot_taken' where id = v_resched;
    return 'slot_taken';
  end;

  -- Slot libre, ADITIVO: sube el total de la orden original + boleta delta NUEVA
  -- (la original sigue viva), financiada por el pago de la orden de delta.
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

  v_bol := create_boleta_amount(v_order, v_delta, p_delta_order);  -- boleta delta, financiada por la orden de delta
  perform log_booking_event(v_reservation, 'boleta_issued', p_order => v_order, p_tax_doc => v_bol, p_amount => v_delta);
  perform log_booking_event(v_reservation, 'reschedule_moved', p_order => v_order, p_reschedule => v_resched,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', v_starts));

  -- Earn: truing hacia floor(0.05 · live). Ref único por evento (reschedule.id).
  select c.id into v_customer
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = v_order;
  if v_customer is not null then
    select amount_clp - refunded_amount_clp into v_new_live from orders where id = v_order;
    select coalesce(sum(amount), 0) into v_earn_net from points_ledger
      where order_id = v_order and kind in ('earn', 'earn_revoke');
    v_earn_add := floor(0.05 * v_new_live)::int - v_earn_net;
    if v_earn_add > 0 and apply_points(v_customer, v_order, 'earn', v_earn_add, 'reschedule:' || v_resched) then
      perform log_booking_event(v_reservation, 'points_earned', p_order => v_order, p_reschedule => v_resched, p_amount => v_earn_add);
    end if;
  end if;

  update orders set status = 'fulfilled' where id = p_delta_order;
  update reschedules set status = 'applied', applied_at = now() where id = v_resched;
  return 'applied';
end;
$$;

-- ── mark_refunded — anular boletas vivas más-antigua-primero (NC por boleta) + eventos ─
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
