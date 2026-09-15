-- Cobro de reagendamiento pendiente: el cupo destino queda RESERVADO mientras el cliente
-- paga, y el link de pago queda persistido (seguimiento de la auditoría 2026-09-14, H3/H4).
--
-- Antes, un reagendamiento a un horario más caro solo creaba la orden delta y el link: la
-- reserva se movía al pagar "si el horario seguía libre", así que cualquier otro cliente podía
-- tomar el cupo en las horas que el primero tardaba en pagar (y el pago terminaba en
-- reembolso automático). Ahora `create_reschedule_charge` inserta una reserva `held` SIN
-- orden sobre el cupo nuevo (`reservations.reschedule_id` la marca) que vence con el link
-- (24 h; el barrido de holds la expira sola); `apply_reschedule_charge` la borra justo antes
-- de mover la reserva; anular o expirar el cobro también la borran.
--
-- `payment_intents.init_point`: el link de MP se mostraba solo en el diálogo del admin; ahora
-- se persiste al crear la preference para que la ficha lo muestre y se pueda reenviar.

-- ── 1. Columnas ──
alter table payment_intents add column init_point text;
alter table reservations
  add column reschedule_id uuid references reschedules (id) on delete set null;
create index reservations_reschedule_hold_idx on reservations (reschedule_id) where reschedule_id is not null;

-- ── 2. create_reschedule_charge: + hold en el cupo nuevo ──
create or replace function create_reschedule_charge(p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb, p_delta int, p_delta_net int, p_delta_tax int, p_created_by uuid default null)
returns table(reschedule_id uuid, delta_order_id uuid)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_live int; v_resource uuid;
  v_name text; v_email text; v_phone text; v_currency text; v_cust uuid;
  v_delta_order uuid; v_resched uuid; v_hold uuid;
begin
  select r.order_id, r.starts_at, r.ends_at, r.resource_id into v_order, v_old_start, v_old_end, v_resource
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

  -- Hold del cupo NUEVO, sin orden (el dinero vive en la orden delta): la exclusion
  -- constraint lo defiende de otro checkout; si el cupo ya estaba tomado, el insert falla
  -- por GiST y toda la transacción (orden delta + fila) se revierte. Vence con el link (24 h):
  -- expire_stale_holds lo pasa a 'expired' y el cupo se libera solo.
  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at,
                            customer_name, customer_email, customer_phone, customer_id, reschedule_id, notes)
    select r.resource_id, 'booking', 'held', p_starts, p_ends, now() + interval '24 hours',
           r.customer_name, r.customer_email, r.customer_phone, r.customer_id, v_resched,
           'Cupo reservado para un reagendamiento pendiente de pago'
    from reservations r where r.id = p_reservation
    returning id into v_hold;

  perform log_booking_event(p_reservation, 'reschedule_charge_pending', p_order => v_delta_order,
    p_reschedule => v_resched, p_amount => p_delta, p_created_by => p_created_by,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', p_starts, 'hold_reservation_id', v_hold));

  return query select v_resched, v_delta_order;
end;
$$;

-- ── 3. Helper: soltar el hold de una fila (idempotente) ──
create or replace function release_reschedule_hold(p_reschedule uuid)
returns void language sql set search_path = public, pg_temp as $$
  delete from reservations where reschedule_id = p_reschedule and order_id is null and status in ('held', 'expired');
$$;

-- ── 4. apply_reschedule_charge: suelta el hold ANTES de mover (si no, chocaría consigo mismo) ──
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

  -- El pago del delta ES la marca de idempotencia: una re-entrega del webhook (o un pago
  -- tardío repetido sobre un cobro anulado) no vuelve a emitir boleta ni eventos.
  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_delta_order and status not in ('paid', 'fulfilled');
  get diagnostics v_paid_rows = row_count;
  if v_paid_rows = 0 then return 'noop'; end if;

  perform log_booking_event(v_reservation, 'reschedule_charge_paid', p_order => p_delta_order,
    p_reschedule => v_resched, p_amount => v_delta, p_payment_ref => p_payment_id);

  if v_status = 'pending_charge' then
    -- Primero suelta el hold del cupo (mismo rango): si siguiera vivo, el update de abajo
    -- chocaría con él por la exclusion constraint.
    perform release_reschedule_hold(v_resched);
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

  -- Slot libre, ADITIVO: sube el total de la orden original + boleta delta NUEVA
  -- (la original sigue viva), financiada por el pago de la orden de delta.
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

-- ── 5. cancel_reschedule_row: anular un cobro suelta el hold ──
create or replace function cancel_reschedule_row(p_reschedule uuid, p_created_by uuid default null)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare r record;
begin
  select id, reservation_id, status, kind, original_order_id, delta_order_id, delta_clp, old_starts_at, new_starts_at, mp_refund_id
    into r from reschedules where id = p_reschedule for update;
  if r.id is null or r.status not in ('pending_charge', 'pending_refund') then return false; end if;
  if r.status = 'pending_charge' then
    update orders set status = 'cancelled' where id = r.delta_order_id and status = 'pending_payment';
    perform release_reschedule_hold(r.id);
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

-- ── 6. expire_abandoned_reschedules: el barrido también suelta el hold (ya expirado) ──
create or replace function expire_abandoned_reschedules(p_older_than interval default '72:00:00'::interval)
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_count int := 0; r record;
begin
  for r in
    select id, delta_order_id, reservation_id, old_starts_at, new_starts_at from reschedules
      where status = 'pending_charge' and created_at < now() - p_older_than
  loop
    update orders set status = 'cancelled' where id = r.delta_order_id and status = 'pending_payment';
    perform release_reschedule_hold(r.id);
    update reschedules set status = 'expired' where id = r.id;
    perform log_booking_event(r.reservation_id, 'reschedule_expired', p_order => r.delta_order_id,
      p_reschedule => r.id, p_detail => jsonb_build_object('old_starts_at', r.old_starts_at, 'new_starts_at', r.new_starts_at));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
