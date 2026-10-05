-- Método de pago como columna propia + guardia de pago duplicado.
--
-- Hasta acá el método de pago no tenía columna: vivía metido en orders.mp_payment_id
-- como literal (`offline:efectivo`, `offline:transferencia`, `offline:puntos`) al lado
-- de los ids reales de Mercado Pago, y cada lector lo parseaba con startsWith("offline:").
-- Desde esta migración:
--   · orders.payment_method dice CÓMO se pagó (mercadopago | transferencia | efectivo |
--     puntos — puntos solo cuando cubren el 100 %; un canje parcial lleva el método del
--     resto y el canje vive en points_redeemed_clp).
--   · orders.mp_payment_id sigue llevando el prefijo `offline:<método>` en los pagos
--     manuales SOLO por compatibilidad: el código en producción todavía lo lee mientras
--     se aprueba este push. Cuando el código nuevo (que lee payment_method) esté vivo, la
--     migración de la prueba del curso lo limpia y mp_payment_id queda solo para MP.
--   · confirm_payment tiene una forma de 3 argumentos (p_order, p_payment_id, p_method) y
--     una GUARDIA: un pago que llega sobre una orden YA pagada con OTRO id (p. ej. el
--     cliente paga el link de MP después de que el dueño la marcó pagada en efectivo) ya
--     no se traga en silencio: devuelve 'already_paid' sin tocar nada, y la app lo
--     registra (log_duplicate_payment) y avisa al dueño para devolverlo.
--
-- Despliegue: esta migración va SOLA (sin código). La forma vieja de 2 argumentos queda
-- como envoltorio que traduce el prefijo, así el código en producción sigue andando
-- mientras se aprueba el push; se elimina en la migración de la prueba del curso.
-- Fuera de alcance: mp_refund_id sigue usando `offline:manual|reschedule` (son
-- referencias de reembolso, no métodos de pago).

-- ── 1. Columna ──────────────────────────────────────────────────────────────
alter table orders add column payment_method text
  check (payment_method in ('mercadopago', 'transferencia', 'efectivo', 'puntos'));

comment on column orders.payment_method is
  'Cómo se pagó (null hasta pagar). puntos = canje del 100 %; un canje parcial lleva el método del resto.';

-- ── 2. Backfill ─────────────────────────────────────────────────────────────
-- (a) El prefijo offline: es la fuente de verdad de lo manual (salas y cursos).
update orders set payment_method = substr(mp_payment_id, 9)
  where mp_payment_id like 'offline:%'
    and substr(mp_payment_id, 9) in ('transferencia', 'efectivo', 'puntos');

-- (b) Cursos sin prefijo: el método que guardó la inscripción.
update orders o set payment_method = e.paid_method
  from course_enrollments e
  where e.order_id = o.id and o.kind = 'course' and o.payment_method is null
    and e.paid_method is not null;

-- (c) Todo lo demás pagado con un id de pago es Mercado Pago.
update orders set payment_method = 'mercadopago'
  where payment_method is null and mp_payment_id is not null
    and mp_payment_id not like 'offline:%'
    and status in ('paid', 'fulfilled', 'refunded');

-- El prefijo offline: de mp_payment_id NO se borra acá (ver encabezado).

do $$
declare v_left int;
begin
  select count(*) into v_left from orders
    where status in ('paid', 'fulfilled', 'refunded') and payment_method is null;
  raise notice 'orders pagadas sin payment_method tras el backfill: %', v_left;
end $$;

-- ── 3. Evento nuevo: duplicate_payment (constraint + categoría van juntos) ──
alter table booking_events drop constraint booking_events_type_check;
alter table booking_events add constraint booking_events_type_check
  check (type in ('created','payment_confirmed','courtesy_confirmed','access_sent',
    'reschedule_moved','reschedule_charge_pending','reschedule_charge_paid',
    'reschedule_refund','reschedule_failed_slot_taken','reschedule_expired','reschedule_cancelled',
    'boleta_issued','boleta_emitted','nota_credito_issued','nota_credito_emitted',
    'points_earned','points_revoked','points_restored','cancelled','refunded',
    'curso_session_scheduled','curso_session_moved','curso_session_cancelled','customer_changed',
    'duplicate_payment'));

create or replace function booking_event_category(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_type in ('created', 'courtesy_confirmed', 'reschedule_moved', 'cancelled',
                    'curso_session_scheduled', 'curso_session_moved',
                    'curso_session_cancelled', 'customer_changed') then 'Reservas'
    when p_type in ('payment_confirmed', 'reschedule_charge_pending', 'reschedule_charge_paid',
                    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
                    'reschedule_cancelled', 'refunded', 'duplicate_payment') then 'Pagos'
    when p_type in ('points_earned', 'points_revoked', 'points_restored') then 'Puntos'
    when p_type in ('boleta_issued', 'boleta_emitted', 'nota_credito_issued',
                    'nota_credito_emitted') then 'Documentos tributarios'
    when p_type = 'access_sent' then 'Notificaciones'
  end
$$;

-- ── 4. confirm_payment de 3 argumentos ──────────────────────────────────────
-- Mismo cuerpo que 20260914120000 (pago tardío re-toma el cupo), más:
--   · la guardia de pago duplicado (arriba de todo, con la orden bloqueada);
--   · escribe payment_method; mp_payment_id solo con un id real de MP;
--   · las referencias (evento, canje tardío) usan el método cuando no hay id.
-- Sin defaults a propósito: PostgREST elige la función por el CONJUNTO de nombres de
-- parámetros, así que {p_order, p_payment_id} sigue yendo a la de 2 y {…, p_method} a esta.
create function confirm_payment(p_order uuid, p_payment_id text, p_method text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_held int; v_customer uuid; v_amount int; v_points int; v_earn int;
  v_reservation uuid; v_paid_rows int; v_bol uuid; v_reacquired boolean := false;
  v_status order_status; v_prev_pid text; v_ref text;
begin
  if p_method is null or p_method not in ('mercadopago', 'transferencia', 'efectivo', 'puntos') then
    raise exception 'payment_method_invalid';
  end if;
  if p_method = 'mercadopago' and p_payment_id is null then
    raise exception 'payment_id_required';
  end if;
  v_ref := coalesce(p_payment_id, p_method);

  -- GUARDIA: la orden ya está pagada y este pago NO es una re-entrega del mismo id de MP
  -- (un pago offline siempre es "otro"). No se toca nada: lo registra y avisa la app.
  select status, mp_payment_id into v_status, v_prev_pid from orders where id = p_order for update;
  if v_status in ('paid', 'fulfilled', 'refunded')
     and (p_payment_id is null or p_payment_id is distinct from v_prev_pid) then
    return 'already_paid';
  end if;

  -- mp_payment_id: el id real de MP o, por compatibilidad (ver encabezado), el prefijo viejo.
  update orders set status = 'paid', mp_payment_id = coalesce(p_payment_id, 'offline:' || p_method),
                    payment_method = p_method, paid_at = now()
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

  update payment_intents set payment_id = coalesce(p_payment_id, payment_id), status = 'approved'
    where order_id = p_order;

  select id into v_reservation from reservations where order_id = p_order and kind = 'booking' limit 1;
  select c.id, o.amount_clp, o.points_redeemed_clp into v_customer, v_amount, v_points
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = p_order;

  -- Solo en la transición real a 'paid' (idempotente ante re-entregas del webhook).
  if v_paid_rows > 0 and v_reservation is not null then
    perform log_booking_event(v_reservation, 'payment_confirmed', p_order => p_order, p_amount => v_amount,
      p_payment_ref => v_ref,
      p_detail => case when v_reacquired then '{"reacquired": true}'::jsonb end);
  end if;

  if v_customer is not null then
    if v_points > 0 and exists (select 1 from points_ledger where order_id = p_order and kind = 'redeem_release') then
      perform apply_points(v_customer, p_order, 'redeem', -v_points, 'late:' || v_ref);
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

-- ── 5. La forma de 2 argumentos pasa a ser un envoltorio ────────────────────
-- Traduce el prefijo viejo para el código que sigue en producción mientras se aprueba
-- el push (y para create_checkout, que todavía llama con 'offline:puntos'). Se elimina en
-- la migración de la prueba del curso, junto con la reescritura de create_checkout.
create or replace function confirm_payment(p_order uuid, p_payment_id text)
returns text language plpgsql set search_path = public, pg_temp as $$
begin
  if p_payment_id like 'offline:%' then
    return confirm_payment(p_order, null::text, substr(p_payment_id, 9));
  end if;
  return confirm_payment(p_order, p_payment_id, 'mercadopago');
end;
$$;

-- ── 6. confirm_course_payment: misma firma, escribe el método y trae la guardia ──
-- Acepta todavía el prefijo offline: (código viejo en producción) y lo normaliza.
create or replace function confirm_course_payment(
  p_order      uuid,
  p_payment_id text,
  p_method     text default null
) returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_kind text; v_seats int; v_amount int; v_status order_status; v_prev_pid text;
  v_pid text := p_payment_id; v_method text := p_method;
begin
  if v_pid like 'offline:%' then
    v_method := coalesce(v_method, substr(v_pid, 9));
    v_pid := null;
  end if;
  v_method := coalesce(v_method, case when v_pid is not null then 'mercadopago' end);
  if v_method is null or v_method not in ('mercadopago', 'transferencia', 'efectivo') then
    raise exception 'payment_method_invalid';
  end if;

  select kind, amount_clp, status, mp_payment_id into v_kind, v_amount, v_status, v_prev_pid
    from orders where id = p_order for update;
  if v_kind is null then raise exception 'curso_order_missing'; end if;
  if v_kind <> 'course' then raise exception 'curso_order_wrong_kind'; end if;

  -- GUARDIA: igual que confirm_payment. Una re-entrega del MISMO id de MP sigue el camino
  -- idempotente de siempre; cualquier otro pago sobre un pedido ya pagado no toca nada.
  if v_status in ('paid', 'fulfilled', 'refunded')
     and (v_pid is null or v_pid is distinct from v_prev_pid) then
    return 'already_paid';
  end if;

  update orders set status = 'paid', mp_payment_id = coalesce(v_pid, 'offline:' || v_method),
                    payment_method = v_method, paid_at = now()
    where id = p_order and status <> 'paid';

  update course_enrollments
     set status = 'pagada', paid_at = now(), expires_at = null,
         paid_method = coalesce(v_method, paid_method)
   where order_id = p_order and status = 'reservada';
  get diagnostics v_seats = row_count;

  if v_seats = 0 and not exists (
       select 1 from course_enrollments where order_id = p_order and status = 'pagada') then
    return 'noop';
  end if;

  insert into tax_documents (order_id, kind, neto, iva, total)
    select o.id, 'boleta', o.net_clp, o.tax_clp, o.amount_clp
      from orders o
     where o.id = p_order and o.amount_clp > 0
       and not exists (select 1 from tax_documents t where t.order_id = p_order and t.kind = 'boleta');

  return 'confirmed';
end;
$$;

-- ── 7. log_duplicate_payment: rastro del pago que la guardia rechazó ────────
-- No mueve plata ni estados: deja el evento en la línea de tiempo de la reserva para que
-- el dueño vea qué devolver. Sin reserva (pedido de curso) no hay timeline: no hace nada.
create function log_duplicate_payment(p_order uuid, p_payment_id text, p_amount int)
returns void language plpgsql set search_path = public, pg_temp as $$
declare v_res uuid; v_pid text; v_method text;
begin
  v_res := reservation_for_order(p_order);
  if v_res is null then return; end if;
  select mp_payment_id, payment_method into v_pid, v_method from orders where id = p_order;
  perform log_booking_event(v_res, 'duplicate_payment', p_order => p_order, p_amount => p_amount,
    p_payment_ref => p_payment_id,
    p_detail => jsonb_build_object('stored_payment_id', v_pid, 'stored_method', v_method));
end;
$$;

-- ── 8. apply_reschedule_charge: misma firma; el cobro del delta solo llega por MP ──
-- Cuerpo idéntico a 20260915120000; único cambio: marca payment_method = 'mercadopago'.
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
  update orders set status = 'paid', mp_payment_id = p_payment_id, payment_method = 'mercadopago', paid_at = now()
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
