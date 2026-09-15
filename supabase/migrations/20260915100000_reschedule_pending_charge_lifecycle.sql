-- Ciclo de vida del cobro de reagendamiento pendiente + eventos faltantes
-- (auditoría 2026-09-14, H2/H3/H5). Un cobro pendiente (a) muere con la reserva,
-- (b) es único por reserva, (c) si se paga tarde se devuelve, y (d) cancelar sin
-- reembolso / orden 100 % puntos / cortesía dejan rastro en booking_events.

-- ── 1. Tipos de evento nuevos (constraint + categoría van juntos) ──
alter table booking_events drop constraint booking_events_type_check;
alter table booking_events add constraint booking_events_type_check
  check (type in ('created','payment_confirmed','courtesy_confirmed','access_sent',
    'reschedule_moved','reschedule_charge_pending','reschedule_charge_paid',
    'reschedule_refund','reschedule_failed_slot_taken','reschedule_expired','reschedule_cancelled',
    'boleta_issued','boleta_emitted','nota_credito_issued','nota_credito_emitted',
    'points_earned','points_revoked','points_restored','cancelled','refunded',
    'curso_session_scheduled','curso_session_moved','curso_session_cancelled','customer_changed'));

create or replace function booking_event_category(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_type in ('created', 'courtesy_confirmed', 'reschedule_moved', 'cancelled',
                    'curso_session_scheduled', 'curso_session_moved',
                    'curso_session_cancelled', 'customer_changed') then 'Reservas'
    when p_type in ('payment_confirmed', 'reschedule_charge_pending', 'reschedule_charge_paid',
                    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
                    'reschedule_cancelled', 'refunded') then 'Pagos'
    when p_type in ('points_earned', 'points_revoked', 'points_restored') then 'Puntos'
    when p_type in ('boleta_issued', 'boleta_emitted', 'nota_credito_issued',
                    'nota_credito_emitted') then 'Documentos tributarios'
    when p_type = 'access_sent' then 'Notificaciones'
  end
$$;

-- ── 2. Helper interno: cancela UNA fila pendiente (charge hoy; refund en la migración B) ──
create or replace function cancel_reschedule_row(p_reschedule uuid, p_created_by uuid default null)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare r record;
begin
  select id, reservation_id, status, kind, delta_order_id, delta_clp, old_starts_at, new_starts_at
    into r from reschedules where id = p_reschedule for update;
  if r.id is null or r.status not in ('pending_charge', 'pending_refund') then return false; end if;
  if r.status = 'pending_charge' then
    update orders set status = 'cancelled' where id = r.delta_order_id and status = 'pending_payment';
  end if;
  update reschedules set status = 'cancelled' where id = r.id;
  perform log_booking_event(r.reservation_id, 'reschedule_cancelled', p_order => r.delta_order_id,
    p_reschedule => r.id, p_amount => r.delta_clp, p_created_by => p_created_by,
    p_detail => jsonb_build_object('kind', r.kind, 'old_starts_at', r.old_starts_at, 'new_starts_at', r.new_starts_at));
  return true;
end;
$$;

create or replace function cancel_pending_reschedules(p_reservation uuid, p_created_by uuid default null)
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_n int := 0; r record;
begin
  for r in select id from reschedules where reservation_id = p_reservation
             and status in ('pending_charge', 'pending_refund') loop
    if cancel_reschedule_row(r.id, p_created_by) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;

-- Acción manual del admin ("Anular cobro"): solo cobros pendientes.
create or replace function cancel_reschedule_charge(p_reschedule uuid, p_created_by uuid default null)
returns boolean language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from reschedules where id = p_reschedule and status = 'pending_charge') then
    return false;
  end if;
  return cancel_reschedule_row(p_reschedule, p_created_by);
end;
$$;

-- ── 3. Backfill: si una reserva tiene más de un cobro pendiente, se conserva el más nuevo ──
do $$
declare r record;
begin
  for r in
    select id from (
      select id, row_number() over (partition by reservation_id order by created_at desc, id desc) as rn
      from reschedules where status = 'pending_charge') s where rn > 1
  loop perform cancel_reschedule_row(r.id); end loop;
end $$;

-- ── 4. A lo más UNA fila pendiente por reserva (cobro hoy, reembolso desde la migración B) ──
create unique index reschedules_one_pending_idx
  on reschedules (reservation_id) where status in ('pending_charge', 'pending_refund');

-- ── 5. cancel_booking: cierra cobros pendientes + evento 'cancelled' ──
--    (cuerpo de 20260704113000_customers_points.sql:261, más las dos líneas marcadas)
create or replace function cancel_booking(p_reservation uuid, p_refund_id text default null)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_order  uuid;
  v_status order_status;
  v_rows   int;
begin
  select order_id into v_order from reservations where id = p_reservation;

  update reservations set status = 'cancelled', cancelled_at = now()
    where id = p_reservation and status <> 'cancelled';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then                                            -- NUEVO (H2 + H5)
    perform cancel_pending_reschedules(p_reservation);
    perform log_booking_event(p_reservation, 'cancelled', p_order => v_order);
  end if;

  if v_order is not null then
    select status into v_status from orders where id = v_order;
    if v_status = 'paid' then
      if p_refund_id is not null then
        update orders
          set status = 'refunded', mp_refund_id = p_refund_id, refunded_at = now()
          where id = v_order;
        perform create_nota_credito(v_order);
      end if;
    else
      update orders set status = 'cancelled' where id = v_order;
      perform release_order_redemption(v_order);
    end if;
  end if;
end;
$$;

-- ── 6. refund_points_order: eventos 'cancelled' + 'points_restored' ──
--    (cuerpo de 20260704113000_customers_points.sql, más lo marcado)
create or replace function refund_points_order(p_order uuid, p_restore int, p_ref text default 'points:manual')
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_status order_status; v_amount int; v_points int; v_customer uuid; v_reservation uuid; v_rows int; v_restore int;
begin
  select status, amount_clp, points_redeemed_clp into v_status, v_amount, v_points from orders where id = p_order;
  if v_status is null or v_status not in ('paid', 'fulfilled') or v_amount <> 0 or v_points <= 0 then return; end if;

  v_reservation := reservation_for_order(p_order);
  update reservations set status = 'cancelled', cancelled_at = now()
    where order_id = p_order and status in ('held', 'confirmed');
  get diagnostics v_rows = row_count;
  update orders set status = 'refunded', refunded_at = now() where id = p_order;

  if v_rows > 0 and v_reservation is not null then                -- NUEVO (H5)
    perform cancel_pending_reschedules(v_reservation);
    perform log_booking_event(v_reservation, 'cancelled', p_order => p_order);
  end if;

  select customer_id into v_customer from points_ledger where order_id = p_order and kind = 'redeem' limit 1;
  v_restore := least(coalesce(p_restore, 0), v_points);
  if v_customer is not null and v_restore > 0
     and apply_points(v_customer, p_order, 'redeem_restore', v_restore, p_ref) then
    if v_reservation is not null then                             -- NUEVO (H5): monto = puntos
      perform log_booking_event(v_reservation, 'points_restored', p_order => p_order, p_amount => v_restore);
    end if;
  end if;
end;
$$;

-- ── 7. mark_refunded: cierra pendientes SOLO si esta llamada canceló la reserva ──
--    Cuerpo copiado de la definición viva (20260824160000_curso_reembolso.sql, mergeada con
--    redefiniciones posteriores) más: (a) `v_rows int;`, (b) `get diagnostics v_rows = row_count;`
--    tras cancelar la reserva, (c) el 'cancelled' + cierre de pendientes solo si v_rows > 0.
--    (Un reembolso de la orden DELTA resuelve la reserva viva vía reservation_for_order pero no
--    la cancela → v_rows = 0 → no toca los pendientes nuevos.)
create or replace function mark_refunded(p_order uuid, p_refund_id text default null, p_refund_amount int default null)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_total int; v_prev int; v_boleta int; v_refund int; v_reservation uuid;
  v_customer uuid; v_points int; v_ref text; v_earn_net int; v_revoke int; v_restored int; v_restore int;
  v_ids uuid[]; v_amts int[]; v_setts uuid[]; i int; v_to_reverse int; v_retained int; v_remaining int;
  v_nc uuid; v_bol uuid; v_rows int;
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
  get diagnostics v_rows = row_count;

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
    if v_rows > 0 then
      perform cancel_pending_reschedules(v_reservation);
      perform log_booking_event(v_reservation, 'cancelled', p_order => p_order);
    end if;
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

-- ── 8. Guardas 'reschedule_pending_exists' en los RPC que escriben movimientos ──
--    reschedule_move, create_reschedule_charge y reschedule_courtesy: cuerpo copiado de la
--    definición viva más, justo después del primer chequeo `reschedule_not_active`, la guarda:
--      if exists (select 1 from reschedules where reservation_id = p_reservation
--                   and status in ('pending_charge', 'pending_refund')) then
--        raise exception 'reschedule_pending_exists';
--      end if;
create or replace function reschedule_move(p_reservation uuid, p_starts timestamptz, p_ends timestamptz, p_snapshot jsonb, p_lines jsonb, p_note text default null)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_live int; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  if exists (select 1 from reschedules where reservation_id = p_reservation
               and status in ('pending_charge', 'pending_refund')) then
    raise exception 'reschedule_pending_exists';
  end if;

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

create or replace function create_reschedule_charge(p_reservation uuid, p_starts timestamptz, p_ends timestamptz, p_snapshot jsonb, p_lines jsonb, p_delta int, p_delta_net int, p_delta_tax int, p_created_by uuid default null)
returns table(reschedule_id uuid, delta_order_id uuid) language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_live int;
  v_name text; v_email text; v_phone text; v_currency text; v_cust uuid;
  v_delta_order uuid; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  if exists (select 1 from reschedules where reservation_id = p_reservation
               and status in ('pending_charge', 'pending_refund')) then
    raise exception 'reschedule_pending_exists';
  end if;

  select amount_clp - refunded_amount_clp, customer_name, customer_email, customer_phone, currency, customer_id
    into v_live, v_name, v_email, v_phone, v_currency, v_cust
    from orders where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0;
  if v_live is null then raise exception 'reschedule_not_eligible'; end if;
  if p_delta < 1 then raise exception 'reschedule_bad_delta'; end if;

  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, customer_id)
    values ('pending_payment', v_currency, p_delta, p_delta_net, p_delta_tax,
            v_name, v_email, v_phone, v_cust)
    returning id into v_delta_order;

  insert into reschedules (reservation_id, original_order_id, delta_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp,
      new_snapshot, new_lines, created_by)
    values (p_reservation, v_order, v_delta_order, 'charge', 'pending_charge',
      v_old_start, v_old_end, p_starts, p_ends, v_live, v_live + p_delta, p_delta, p_snapshot, p_lines, p_created_by)
    returning id into v_resched;

  perform log_booking_event(p_reservation, 'reschedule_charge_pending', p_order => v_delta_order,
    p_reschedule => v_resched, p_amount => p_delta, p_created_by => p_created_by,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', p_starts));

  return query select v_resched, v_delta_order;
end;
$$;

create or replace function reschedule_courtesy(p_reservation uuid, p_starts timestamptz, p_ends timestamptz, p_note text default null)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_old_start timestamptz; v_old_end timestamptz; v_resched uuid;
begin
  select r.starts_at, r.ends_at into v_old_start, v_old_end
    from reservations r
    where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking' and r.order_id is null;
  if v_old_start is null then raise exception 'reschedule_not_active'; end if;

  if exists (select 1 from reschedules where reservation_id = p_reservation
               and status in ('pending_charge', 'pending_refund')) then
    raise exception 'reschedule_pending_exists';
  end if;

  update reservations set starts_at = p_starts, ends_at = p_ends where id = p_reservation;

  if p_note is not null and p_note <> '' then
    update reservations set notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || p_note) where id = p_reservation;
  end if;

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp, applied_at)
    values (p_reservation, null, 'equal', 'applied', v_old_start, v_old_end, p_starts, p_ends, 0, 0, 0, now())
    returning id into v_resched;

  perform log_booking_event(p_reservation, 'reschedule_moved', p_reschedule => v_resched,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', p_starts));
  return v_resched;
end;
$$;

-- ── 9. apply_reschedule_charge: filas afectadas + cobro anulado/expirado pagado tarde ──
create or replace function apply_reschedule_charge(p_delta_order uuid, p_payment_id text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_resched uuid; v_reservation uuid; v_order uuid; v_status text;
  v_starts timestamptz; v_ends timestamptz; v_delta int; v_snapshot jsonb; v_lines jsonb;
  v_old_start timestamptz; v_delta_net int; v_delta_tax int; v_customer uuid;
  v_new_live int; v_earn_net int; v_earn_add int; v_bol uuid; v_rows int; v_reason text; v_paid_rows int;
begin
  select id, reservation_id, original_order_id, status, old_starts_at, new_starts_at, new_ends_at, delta_clp, new_snapshot, new_lines
    into v_resched, v_reservation, v_order, v_status, v_old_start, v_starts, v_ends, v_delta, v_snapshot, v_lines
    from reschedules where delta_order_id = p_delta_order for update;
  if v_resched is null or v_status not in ('pending_charge', 'cancelled', 'expired') then return 'noop'; end if;

  select net_clp, tax_clp into v_delta_net, v_delta_tax from orders where id = p_delta_order;

  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_delta_order and status not in ('paid', 'fulfilled');
  -- El pago del delta ES la marca de idempotencia: si esta llamada no lo transicionó
  -- (ya estaba paid/fulfilled de una llamada anterior), no repetir el resto (boleta,
  -- eventos, earn) — evita boletas/eventos duplicados en reintentos/reentregas.
  get diagnostics v_paid_rows = row_count;
  if v_paid_rows = 0 then return 'noop'; end if;

  perform log_booking_event(v_reservation, 'reschedule_charge_paid', p_order => p_delta_order,
    p_reschedule => v_resched, p_amount => v_delta, p_payment_ref => p_payment_id);

  if v_status = 'pending_charge' then
    begin
      update reservations set starts_at = v_starts, ends_at = v_ends
        where id = v_reservation and status = 'confirmed';
      get diagnostics v_rows = row_count;
    exception when exclusion_violation then
      v_rows := -1;
    end;
    v_reason := case when v_rows = -1 then 'slot_taken' when v_rows = 0 then 'reservation_gone' end;
  else
    v_reason := 'charge_void';                                   -- link anulado/expirado, pagado tarde
  end if;

  if v_reason is not null then
    -- La reserva NO se movió → la boleta del delta cobrado vive en la orden de delta
    -- (financiada por su propio pago); el caller reembolsa el excedente.
    insert into tax_documents (order_id, kind, neto, iva, total, settlement_order_id)
      values (p_delta_order, 'boleta', v_delta_net, v_delta_tax, v_delta, p_delta_order) returning id into v_bol;
    perform log_booking_event(v_reservation, 'boleta_issued', p_order => p_delta_order, p_tax_doc => v_bol, p_amount => v_delta);
    perform log_booking_event(v_reservation, 'reschedule_failed_slot_taken', p_order => p_delta_order,
      p_reschedule => v_resched, p_amount => v_delta,
      p_detail => jsonb_build_object('reason', v_reason, 'old_starts_at', v_old_start, 'new_starts_at', v_starts));
    if v_status = 'pending_charge' then
      update reschedules set status = 'failed_slot_taken' where id = v_resched;
    end if;
    return v_reason;
  end if;

  -- Slot libre, ADITIVO (idéntico a 20260707230000_reschedule_additive_boleta.sql:170+):
  update orders
    set amount_clp = amount_clp + v_delta, net_clp = net_clp + v_delta_net, tax_clp = tax_clp + v_delta_tax,
        pricing_snapshot = coalesce(v_snapshot, pricing_snapshot)
    where id = v_order;
  delete from order_lines where order_id = v_order;
  insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
    select v_order, l.line_type, case when l.line_type = 'room_time' then v_reservation end,
           l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
    from jsonb_to_recordset(v_lines)
      as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);
  v_bol := create_boleta_amount(v_order, v_delta, p_delta_order);
  perform log_booking_event(v_reservation, 'boleta_issued', p_order => v_order, p_tax_doc => v_bol, p_amount => v_delta);
  perform log_booking_event(v_reservation, 'reschedule_moved', p_order => v_order, p_reschedule => v_resched,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', v_starts));
  select c.id into v_customer from orders o left join customers c on c.email = lower(o.customer_email) where o.id = v_order;
  if v_customer is not null then
    select amount_clp - refunded_amount_clp into v_new_live from orders where id = v_order;
    select coalesce(sum(amount), 0) into v_earn_net from points_ledger where order_id = v_order and kind in ('earn', 'earn_revoke');
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
