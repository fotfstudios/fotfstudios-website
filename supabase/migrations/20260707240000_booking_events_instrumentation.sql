-- Instrumenta las RPC "shipped" que faltaban para el log booking_events (creación,
-- pago, cobro diferido, cortesía, expiración). Cuerpos idénticos a sus últimas
-- versiones salvo las llamadas atómicas a log_booking_event (mismo tx que el cambio).
-- Guardas de idempotencia: solo se registra el evento si la transición ocurrió de
-- verdad (get diagnostics / RETURNING null / apply_points devolvió true).

-- ── create_checkout: evento 'created' ───────────────────────────────────────
create or replace function create_checkout(
  p_resource uuid, p_starts timestamptz, p_ends timestamptz,
  p_amount int, p_net int, p_tax int, p_currency text,
  p_customer jsonb, p_snapshot jsonb, p_lines jsonb,
  p_ttl interval default interval '10 minutes',
  p_customer_id uuid default null, p_points int default 0,
  p_terms_version text default null, p_terms_source text default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_res uuid; v_order uuid; v_line jsonb; v_balance int;
begin
  perform expire_stale_holds(p_resource);

  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at,
                            customer_name, customer_email, customer_phone)
    values (p_resource, 'booking', 'held', p_starts, p_ends,
            case when p_ttl is null then null else now() + p_ttl end,
            p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone')
    returning id into v_res;

  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot,
                      terms_accepted_at, terms_version, terms_source)
    values ('pending_payment', p_currency, p_amount, p_net, p_tax,
            p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone', p_snapshot,
            case when p_terms_source is not null then now() end,
            case when p_terms_source is not null then p_terms_version end,
            p_terms_source)
    returning id into v_order;

  update reservations set order_id = v_order where id = v_res;

  if p_points > 0 then
    select points_balance into v_balance from customers where id = p_customer_id for update;
    if v_balance is null then raise exception 'points_without_customer'; end if;
    if v_balance < p_points then raise exception 'insufficient_points'; end if;
    perform apply_points(p_customer_id, v_order, 'redeem', -p_points, '');
    update orders set points_redeemed_clp = p_points where id = v_order;
  end if;

  for v_line in select jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, line_type, reservation_id, addon_key, description,
                             quantity, unit_price_clp, subtotal_clp)
      values (v_order, v_line ->> 'line_type',
              case when v_line ->> 'line_type' = 'room_time' then v_res else null end,
              v_line ->> 'addon_key', v_line ->> 'description',
              coalesce((v_line ->> 'quantity')::int, 1),
              (v_line ->> 'unit_price_clp')::int, (v_line ->> 'subtotal_clp')::int);
  end loop;

  perform log_booking_event(v_res, 'created', p_order => v_order);

  if p_points > 0 and p_amount = 0 then
    perform confirm_payment(v_order, 'offline:puntos');
  end if;

  return v_order;
end;
$$;

-- ── confirm_payment: eventos 'payment_confirmed', 'points_earned', 'boleta_issued' ─
create or replace function confirm_payment(p_order uuid, p_payment_id text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_held int; v_customer uuid; v_amount int; v_points int; v_earn int;
  v_reservation uuid; v_paid_rows int; v_bol uuid;
begin
  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_order and status <> 'paid';
  get diagnostics v_paid_rows = row_count;

  update reservations set status = 'confirmed', expires_at = null
    where order_id = p_order and status = 'held';
  get diagnostics v_held = row_count;

  update payment_intents set payment_id = p_payment_id, status = 'approved' where order_id = p_order;

  select id into v_reservation from reservations where order_id = p_order and kind = 'booking' limit 1;
  select c.id, o.amount_clp, o.points_redeemed_clp into v_customer, v_amount, v_points
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = p_order;

  -- Solo en la transición real a 'paid' (idempotente ante re-entregas del webhook).
  if v_paid_rows > 0 and v_reservation is not null then
    perform log_booking_event(v_reservation, 'payment_confirmed', p_order => p_order, p_amount => v_amount, p_payment_ref => p_payment_id);
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

-- ── create_reschedule_charge: evento 'reschedule_charge_pending' ─────────────
create or replace function create_reschedule_charge(
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

  insert into orders (status, currency, amount_clp, net_clp, tax_clp, customer_name, customer_email, customer_phone)
    values ('pending_payment', v_currency, p_delta, p_delta_net, p_delta_tax, v_name, v_email, v_phone)
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

-- ── reschedule_courtesy: evento 'reschedule_moved' ──────────────────────────
create or replace function reschedule_courtesy(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz, p_note text default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_old_start timestamptz; v_old_end timestamptz; v_resched uuid;
begin
  select r.starts_at, r.ends_at into v_old_start, v_old_end
    from reservations r
    where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking' and r.order_id is null;
  if v_old_start is null then raise exception 'reschedule_not_active'; end if;

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

-- ── expire_abandoned_reschedules: evento 'reschedule_expired' por fila barrida ─
create or replace function expire_abandoned_reschedules(p_older_than interval default '72 hours')
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_count int := 0; r record;
begin
  for r in
    select id, delta_order_id, reservation_id, old_starts_at, new_starts_at from reschedules
      where status = 'pending_charge' and created_at < now() - p_older_than
  loop
    update orders set status = 'cancelled' where id = r.delta_order_id and status = 'pending_payment';
    update reschedules set status = 'expired' where id = r.id;
    perform log_booking_event(r.reservation_id, 'reschedule_expired', p_order => r.delta_order_id,
      p_reschedule => r.id, p_detail => jsonb_build_object('old_starts_at', r.old_starts_at, 'new_starts_at', r.new_starts_at));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
