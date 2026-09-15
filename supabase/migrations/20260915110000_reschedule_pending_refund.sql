-- Reembolso de reagendamiento pendiente (auditoría 2026-09-14, H1/H9): la baja de precio
-- se parte en MOVER (sin plata) → reembolso en MP → ASENTAR por reembolso aprobado. Así la
-- base nunca declara devuelto lo que MP no devolvió, y el loopback del webhook asienta en
-- vez de cancelar. reschedule_down desaparece: era el único RPC que mutaba plata sin este
-- modelo.

-- ── 1. Estado y columnas ──
alter table reschedules drop constraint reschedules_status_check;
alter table reschedules add constraint reschedules_status_check
  check (status in ('pending_charge', 'pending_refund', 'applied', 'failed_slot_taken', 'expired', 'cancelled'));
alter table reschedules
  add column settled_clp int not null default 0,
  add column offline_settled_clp int not null default 0,  -- parte de settled_clp devuelta en mano (offline:*), para mostrarla aparte
  add column mp_refund_id text,            -- reembolso en vuelo (in_process) o el que asentó
  add column mp_refund_payment_id text,    -- pago MP al que pertenece el reembolso en vuelo
  add column refund_attempt_at timestamptz; -- lease de 5 min: serializa emisores concurrentes del reembolso (admin/cron)

-- ── 2. cancel_reschedule_row: deja constancia del reembolso en vuelo al cancelar ──
create or replace function cancel_reschedule_row(p_reschedule uuid, p_created_by uuid default null)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare r record;
begin
  select id, reservation_id, status, kind, original_order_id, delta_order_id, delta_clp, old_starts_at, new_starts_at, mp_refund_id
    into r from reschedules where id = p_reschedule for update;
  if r.id is null or r.status not in ('pending_charge', 'pending_refund') then return false; end if;
  if r.status = 'pending_charge' then
    update orders set status = 'cancelled' where id = r.delta_order_id and status = 'pending_payment';
  end if;
  update reschedules set status = 'cancelled' where id = r.id;
  -- `pending_refund` no tiene delta_order_id (el reembolso vive en la orden original): el
  -- evento igual necesita colgar de una orden.
  perform log_booking_event(r.reservation_id, 'reschedule_cancelled', p_order => coalesce(r.delta_order_id, r.original_order_id),
    p_reschedule => r.id, p_amount => r.delta_clp, p_payment_ref => r.mp_refund_id, p_created_by => p_created_by,
    p_detail => jsonb_build_object('kind', r.kind, 'old_starts_at', r.old_starts_at, 'new_starts_at', r.new_starts_at));
  return true;
end;
$$;

-- ── 3. MOVER (sin plata) ──
create or replace function reschedule_down_move(p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb, p_refund_amount int, p_note text default null, p_created_by uuid default null)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_dummy int; v_live_total int; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;
  select 1 into v_dummy from orders
    where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0 for update;
  if v_dummy is null then raise exception 'reschedule_not_eligible'; end if;
  -- DESPUÉS del lock de la orden: dos movidas concurrentes de la misma reserva se serializan
  -- ahí y la segunda ve la fila pendiente de la primera (si no, ambas pasarían el check y
  -- la segunda moriría por el índice único con un 23505 que el admin no entiende).
  if exists (select 1 from reschedules where reservation_id = p_reservation
               and status in ('pending_charge', 'pending_refund')) then
    raise exception 'reschedule_pending_exists';
  end if;
  select coalesce(sum(total - reversed_clp), 0) into v_live_total
    from tax_documents where order_id = v_order and kind = 'boleta' and reversed_clp < total;
  if p_refund_amount < 1 or p_refund_amount > v_live_total then raise exception 'reschedule_bad_delta'; end if;

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp,
      new_snapshot, new_lines, created_by)
    values (p_reservation, v_order, 'refund', 'pending_refund',
      v_old_start, v_old_end, p_starts, p_ends, v_live_total, v_live_total - p_refund_amount, p_refund_amount,
      p_snapshot, p_lines, p_created_by)
    returning id into v_resched;

  update reservations set starts_at = p_starts, ends_at = p_ends where id = p_reservation;  -- GiST: aborta todo si el slot está tomado
  if p_note is not null and p_note <> '' then
    update reservations set notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || p_note) where id = p_reservation;
  end if;
  perform log_booking_event(p_reservation, 'reschedule_moved', p_order => v_order, p_reschedule => v_resched,
    p_created_by => p_created_by,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', p_starts, 'pending_refund_clp', p_refund_amount));
  return v_resched;
end;
$$;

-- ── 4. ASENTAR (por reembolso aprobado; idempotente por refund id; nunca cancela) ──
create or replace function reschedule_settle_refund(p_reschedule uuid, p_refund_id text, p_amount int default null)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  r record; v_amount int; v_live_total int; v_customer uuid; v_earn_net int; v_revoke int; v_new_live int;
  v_ids uuid[]; v_amts int[]; v_setts uuid[]; i int; v_to_reverse int; v_retained int; v_remaining int; v_nc uuid; v_bol uuid;
begin
  select * into r from reschedules where id = p_reschedule for update;
  if r.id is null then return 'noop'; end if;
  -- Un refund id NULL/vacío rompería la idempotencia por-refund de abajo y viola
  -- `points_ledger.ref not null` en el earn_revoke de más abajo.
  if p_refund_id is null or p_refund_id = '' then raise exception 'reschedule_bad_refund_id'; end if;
  -- `duplicate` ANTES que el estado: si el loopback del webhook asentó el ÚLTIMO split y la
  -- fila ya quedó `applied`, el segundo asiento del mismo refund id es un duplicado, no un
  -- `noop` (que para el admin significa "la reserva se canceló entre medio").
  if exists (select 1 from booking_events where reservation_id = r.reservation_id and reschedule_id = p_reschedule
               and type = 'reschedule_refund' and payment_ref = p_refund_id) then
    return 'duplicate';
  end if;
  -- `cancelled` se distingue de `noop`: la reserva se canceló con el reembolso en vuelo y la
  -- plata igual salió → el servicio la asienta sobre la orden cancelada (mark_refunded). Un
  -- `noop` (fila inexistente / applied con otro id / nada por asentar) NO autoriza eso.
  if r.status = 'cancelled' then return 'cancelled'; end if;
  if r.status <> 'pending_refund' then return 'noop'; end if;

  select coalesce(sum(total - reversed_clp), 0) into v_live_total
    from tax_documents where order_id = r.original_order_id and kind = 'boleta' and reversed_clp < total;
  v_amount := least(coalesce(p_amount, r.delta_clp - r.settled_clp), r.delta_clp - r.settled_clp, v_live_total);
  if v_amount <= 0 then return 'noop'; end if;

  update orders
    set refunded_amount_clp = refunded_amount_clp + v_amount,
        mp_refund_id = coalesce(p_refund_id, mp_refund_id)
    where id = r.original_order_id;
  perform log_booking_event(r.reservation_id, 'reschedule_refund', p_order => r.original_order_id,
    p_reschedule => r.id, p_amount => v_amount, p_payment_ref => p_refund_id);

  -- Puntos: truing hacia floor(0.05 · vivo). Ref único por (fila, reembolso).
  select c.id into v_customer
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = r.original_order_id;
  if v_customer is not null then
    select amount_clp - refunded_amount_clp into v_new_live from orders where id = r.original_order_id;
    select coalesce(sum(amount), 0) into v_earn_net from points_ledger
      where order_id = r.original_order_id and kind in ('earn', 'earn_revoke');
    v_revoke := greatest(0, v_earn_net - floor(0.05 * v_new_live)::int);
    if v_revoke > 0 and apply_points(v_customer, r.original_order_id, 'earn_revoke', -v_revoke,
                                     'reschedule:' || r.id || ':' || p_refund_id) then
      perform log_booking_event(r.reservation_id, 'points_revoked', p_order => r.original_order_id,
        p_reschedule => r.id, p_amount => v_revoke);
    end if;
  end if;

  -- SII: anular más-antigua-primero hasta v_amount; saldo reemitido financiado por SU pago.
  select array_agg(id order by created_at, id), array_agg(total - reversed_clp order by created_at, id),
         array_agg(settlement_order_id order by created_at, id)
    into v_ids, v_amts, v_setts
    from tax_documents where order_id = r.original_order_id and kind = 'boleta' and reversed_clp < total;
  v_remaining := v_amount;
  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    exit when v_remaining <= 0;
    v_to_reverse := least(v_remaining, v_amts[i]);
    v_nc := create_nota_credito_amount(r.original_order_id, v_ids[i], v_amts[i]);
    perform log_booking_event(r.reservation_id, 'nota_credito_issued', p_order => r.original_order_id, p_tax_doc => v_nc, p_amount => v_amts[i]);
    v_retained := v_amts[i] - v_to_reverse;
    if v_retained > 0 then
      v_bol := create_boleta_amount(r.original_order_id, v_retained, v_setts[i]);
      perform log_booking_event(r.reservation_id, 'boleta_issued', p_order => r.original_order_id, p_tax_doc => v_bol, p_amount => v_retained);
    end if;
    v_remaining := v_remaining - v_to_reverse;
  end loop;

  update reschedules
    set settled_clp = settled_clp + v_amount,
        -- Lo devuelto en mano se lleva aparte: la ficha lo muestra como "ya registrado" y el
        -- resto como lo que falta por MP (pedido mixto: original offline + delta por MP).
        offline_settled_clp = offline_settled_clp + case when p_refund_id like 'offline:%' then v_amount else 0 end,
        mp_refund_id = null, mp_refund_payment_id = null
    where id = r.id;

  if r.settled_clp + v_amount >= r.delta_clp then
    -- Recién ahora las líneas y el snapshot reflejan el precio nuevo (antes, amount − refunded
    -- todavía era el viejo y las líneas debían coincidir con él).
    update orders set pricing_snapshot = coalesce(r.new_snapshot, pricing_snapshot) where id = r.original_order_id;
    delete from order_lines where order_id = r.original_order_id;
    insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
      select r.original_order_id, l.line_type, case when l.line_type = 'room_time' then r.reservation_id end,
             l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
      from jsonb_to_recordset(r.new_lines)
        as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);
    update reschedules set status = 'applied', applied_at = now() where id = r.id;
    return 'applied';
  end if;
  return 'settled';
end;
$$;

-- ── 5. reschedule_down ya no existe ──
drop function if exists reschedule_down(uuid, timestamptz, timestamptz, jsonb, jsonb, text, int, text);

-- ── 6. Solo service_role toca plata (patrón 20260914130000_first_booking_promo.sql:44) ──
revoke execute on function reschedule_down_move(uuid, timestamptz, timestamptz, jsonb, jsonb, int, text, uuid) from public, anon, authenticated;
grant  execute on function reschedule_down_move(uuid, timestamptz, timestamptz, jsonb, jsonb, int, text, uuid) to service_role;
revoke execute on function reschedule_settle_refund(uuid, text, int) from public, anon, authenticated;
grant  execute on function reschedule_settle_refund(uuid, text, int) to service_role;
