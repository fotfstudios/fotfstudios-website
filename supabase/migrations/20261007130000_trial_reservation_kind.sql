-- La sesión de prueba del Curso de DJ como reserva propia (kind = 'prueba').
--
-- Hasta acá una prueba se agendaba como un ensayo cualquiera (tarifa de sala, PIN de la
-- puerta, correos de "entras solo") y el crédito de $19.990 se emitía a mano después.
-- Una prueba es VENDIDA (boleta, ingreso) y GUIADA (el dueño o el instructor recibe al
-- alumno: sin PIN). Desde esta migración:
--   · reservations.kind admite 'prueba'; orders.kind = 'trial' (valor que ya existía y
--     nadie escribía). create_checkout recibe p_order_kind y crea las dos juntas.
--   · confirm_payment, al pagarse una prueba, emite el crédito por lo pagado, que vence
--     7 días después de la sesión (uno por reserva).
--   · mark_refunded anula el crédito de una prueba devuelta entera (voided_at).
--   · extend_course_credit: el dueño extiende un crédito (vencido o no) caso a caso.
--   · course_credits lleva los reclamos de los dos correos de seguimiento.
--   · course_leads.trial_reservation_id: la solicitud sabe qué prueba se agendó.
--   · create_course_enrollment cierra por email la solicitud abierta de quien se inscribe.
-- Además termina la migración del método de pago (20261007120000): los pagos offline ya
-- no escriben el prefijo `offline:<método>` en mp_payment_id, y se limpia el que quedó.
-- La forma de 2 argumentos de confirm_payment se conserva como envoltorio (traduce el
-- prefijo viejo): la usan los tests y scripts/mp-replay-refund.mjs.

-- ── 1. Tipo de reserva 'prueba' ─────────────────────────────────────────────
alter table reservations drop constraint reservations_kind_check;
alter table reservations add constraint reservations_kind_check
  check (kind in ('booking', 'block', 'curso', 'prueba'));

-- El barrido del recordatorio lee reservas de cliente, sesiones guiadas y pruebas.
drop index if exists reservations_reminder_due_idx;
create index reservations_reminder_due_idx
  on reservations (starts_at)
  where kind in ('booking', 'curso', 'prueba') and status = 'confirmed' and reminder_sent_at is null;

-- Los eventos (pago, boleta, reembolso) de una prueba cuelgan de su reserva igual que
-- los de un ensayo. mark_refunded resuelve la reserva por acá.
create or replace function reservation_for_order(p_order uuid)
returns uuid language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select id from reservations where order_id = p_order and kind in ('booking', 'prueba') limit 1),
    (select reservation_id from reschedules where delta_order_id = p_order limit 1))
$$;

-- ── 2. Créditos: anulación, seguimiento y extensión ─────────────────────────
alter table course_credits
  add column voided_at               timestamptz,
  add column followup_sent_at        timestamptz,
  add column expiry_reminder_sent_at timestamptz,
  add column extended_count          int not null default 0;

comment on column course_credits.voided_at is 'La prueba se devolvió entera: el crédito ya no vale.';
comment on column course_credits.followup_sent_at is 'Reclamo del correo "¿te animas?" del día siguiente a la prueba.';
comment on column course_credits.expiry_reminder_sent_at is 'Reclamo del aviso 2 días antes de vencer (se suelta al extender).';

create index course_credits_followup_due_idx on course_credits (source_reservation_id)
  where followup_sent_at is null and consumed_order_id is null and voided_at is null;
create index course_credits_expiry_due_idx on course_credits (expires_at)
  where expiry_reminder_sent_at is null and consumed_order_id is null and voided_at is null;

-- Extiende p_days desde el vencimiento (o desde hoy si ya venció). Solo un crédito vivo:
-- sin usar y sin anular. Suelta el reclamo del aviso de vencimiento para el plazo nuevo.
create function extend_course_credit(p_credit uuid, p_days int default 7)
returns timestamptz language plpgsql set search_path = public, pg_temp as $$
declare v_expires timestamptz;
begin
  if p_days < 1 or p_days > 60 then raise exception 'curso_credito_dias_invalidos'; end if;
  update course_credits
     set expires_at = greatest(expires_at, now()) + make_interval(days => p_days),
         extended_count = extended_count + 1,
         expiry_reminder_sent_at = null
   where id = p_credit and consumed_order_id is null and voided_at is null
  returning expires_at into v_expires;
  if v_expires is null then raise exception 'curso_credito_no_extensible'; end if;
  return v_expires;
end;
$$;

-- ── 3. La solicitud sabe qué prueba se agendó ───────────────────────────────
alter table course_leads add column trial_reservation_id uuid references reservations(id) on delete set null;

-- ── 4. create_checkout con p_order_kind ─────────────────────────────────────
-- Mismo cuerpo que 20260909130000; agrega p_order_kind ('booking' | 'trial'): una prueba
-- nace como reserva 'prueba' + pedido 'trial'. Hay que borrar la firma vieja: dos formas
-- con defaults serían ambiguas para PostgREST.
drop function create_checkout(uuid, timestamptz, timestamptz, int, int, int, text, jsonb, jsonb, jsonb, interval, uuid, int, text, text);

create function create_checkout(
  p_resource uuid, p_starts timestamptz, p_ends timestamptz,
  p_amount int, p_net int, p_tax int, p_currency text,
  p_customer jsonb, p_snapshot jsonb, p_lines jsonb,
  p_ttl interval default interval '10 minutes',
  p_customer_id uuid default null, p_points int default 0,
  p_terms_version text default null, p_terms_source text default null,
  p_order_kind text default 'booking'
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_res uuid; v_order uuid; v_line jsonb; v_balance int;
  v_cust  uuid := p_customer_id;
  v_name  text := nullif(left(trim(p_customer ->> 'name'), 80), '');
  v_email text := nullif(lower(trim(p_customer ->> 'email')), '');
  v_phone text := case when char_length(trim(p_customer ->> 'phone')) between 6 and 40
                       then trim(p_customer ->> 'phone') end;
begin
  if p_order_kind not in ('booking', 'trial') then raise exception 'order_kind_invalid'; end if;
  perform expire_stale_holds(p_resource);

  if v_cust is not null then
    -- FIX ROUND 2 (revisión final): lock COMPARTIDO, no un `exists` pelado. Un `exists` no
    -- toma ningún lock, así que un delete de la ficha entre el chequeo y el insert se cuela y
    -- aflora como un 23503 (foreign_key_violation) que el mapeo de errores de la app NO
    -- reconoce → texto crudo de Postgres en pantalla. Hoy nada borra clientes; /admin/clientes
    -- (PR6) sí. FOR KEY SHARE es EXACTAMENTE el mismo modo que los dos insert de abajo toman
    -- implícito para validar la FK: adquirirlo antes no agrega ningún conflicto nuevo ni
    -- cambia el análisis de deadlock del bloque de canje (FOR KEY SHARE no conflictúa con
    -- FOR NO KEY UPDATE), solo hace esperar al delete hasta el commit.
    perform 1 from customers where id = v_cust for key share;
    if not found then raise exception 'customer_not_found'; end if;
  else
    v_cust := upsert_guest_customer(v_name, v_email, v_phone);   -- null si el email no pasa la puerta
  end if;

  if v_cust is not null then
    select coalesce(c.name, v_name), c.email, coalesce(c.phone, v_phone)
      into v_name, v_email, v_phone
      from customers c where c.id = v_cust;
    -- Ficha SOLO-TELÉFONO (legal: customers_contact_required se conforma con el teléfono) en
    -- un pedido que COBRA: prohibido. El snapshot quedaría con customer_id puesto y
    -- customer_email vacío, y las ocho funciones de puntos resuelven al cliente por
    -- `c.email = lower(o.customer_email)`: esa reserva no ganaría NUNCA y un reembolso no
    -- revocaría nada — el FK y la join discrepando, justo lo que prohíbe el INVARIANTE de
    -- arriba. Espejo de customer_assign_needs_email (20260909120000_customer_directory.sql:365),
    -- que ya rechaza este mismo caso al reasignar. Un pedido de $0 (cortesía, canje 100 %
    -- puntos) no puede ganar nada — el earn es floor(0.05 · 0) = 0 —, así que sigue permitido.
    if v_email is null and p_amount > 0 then raise exception 'customer_checkout_needs_email'; end if;
  end if;

  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at,
                            customer_name, customer_email, customer_phone, customer_id)
    values (p_resource, case p_order_kind when 'trial' then 'prueba' else 'booking' end, 'held', p_starts, p_ends,
            case when p_ttl is null then null else now() + p_ttl end,
            v_name, v_email, v_phone, v_cust)
    returning id into v_res;

  insert into orders (kind, status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot,
                      terms_accepted_at, terms_version, terms_source, customer_id)
    values (p_order_kind, 'pending_payment', p_currency, p_amount, p_net, p_tax,
            v_name, v_email, v_phone, p_snapshot,
            case when p_terms_source is not null then now() end,
            case when p_terms_source is not null then p_terms_version end,
            p_terms_source, v_cust)
    returning id into v_order;

  update reservations set order_id = v_order where id = v_res;

  -- Bloque de canje: sigue usando p_customer_id, NO v_cust. Hoy son el mismo valor cuando
  -- p_points > 0: el canje exige sesión (checkout-service.ts:62) y esa rama siempre pasa
  -- p_customer_id, así que v_cust nunca se reasignó (la rama del invitado solo corre con
  -- p_customer_id null, y entonces p_points = 0). Si alguna vez un canje pudiera llegar sin
  -- p_customer_id, esta línea debe pasar a v_cust.
  --
  -- FIX ROUND 1 (deadlock): este bloque YA NO es byte-idéntico al de 20260707240000 — el lock
  -- bajó de FOR UPDATE a FOR NO KEY UPDATE. Motivo: las dos columnas customer_id de arriba
  -- (reservations/orders) hacen que un INSERT tome un lock FOR KEY SHARE sobre la fila del
  -- cliente (así es como Postgres valida una FK). Con FOR UPDATE, dos create_checkout
  -- concurrentes para EL MISMO cliente y AMBOS con p_points > 0 quedan cada uno sosteniendo
  -- el FOR KEY SHARE de su propio insert y pidiendo el FOR UPDATE del otro — ciclo, deadlock
  -- (medido con harness de dos conexiones, slots bien separados para no tocar la exclusion
  -- constraint de reservas: 40/40 pares deadlockearon, 80/80 intentos). FOR NO KEY UPDATE es
  -- la fuerza correcta para esta sección: solo toca points_balance, que no participa de
  -- ninguna key, y por diseño de Postgres NO conflictúa con FOR KEY SHARE — pero SÍ
  -- conflictúa con otro FOR NO KEY UPDATE, así que dos canjes concurrentes sobre el mismo
  -- cliente siguen serializando correctamente (uno espera, no hay ciclo) y el
  -- chequeo-y-descuento sigue atómico bajo lock. Medido tras el fix: 0 deadlocks en 100 pares
  -- (200 intentos, dos corridas del mismo harness). Ver task-3-report.md § Fix round 1.
  if p_points > 0 then
    select points_balance into v_balance from customers where id = p_customer_id for no key update;
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
    perform confirm_payment(v_order, null::text, 'puntos');
  end if;

  return v_order;
end;
$$;

-- ── 5. confirm_payment: prueba + crédito; sin prefijo offline ───────────────
create or replace function confirm_payment(p_order uuid, p_payment_id text, p_method text)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_held int; v_customer uuid; v_amount int; v_points int; v_earn int;
  v_reservation uuid; v_paid_rows int; v_bol uuid; v_reacquired boolean := false;
  v_status order_status; v_prev_pid text; v_ref text; v_order_kind text;
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
  select status, mp_payment_id, kind into v_status, v_prev_pid, v_order_kind from orders where id = p_order for update;
  if v_status in ('paid', 'fulfilled', 'refunded')
     and (p_payment_id is null or p_payment_id is distinct from v_prev_pid) then
    return 'already_paid';
  end if;

  -- mp_payment_id: SOLO el id real de MP (null en lo offline; el método va en payment_method).
  update orders set status = 'paid', mp_payment_id = p_payment_id,
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
        where order_id = p_order and status = 'expired' and kind in ('booking', 'prueba') and starts_at > now();
      get diagnostics v_held = row_count;
      v_reacquired := v_held > 0;
    exception when exclusion_violation then
      v_held := 0; -- otro cliente tiene el cupo → paid_no_hold, como hasta ahora
    end;
  end if;

  update payment_intents set payment_id = coalesce(p_payment_id, payment_id), status = 'approved'
    where order_id = p_order;

  select id into v_reservation from reservations where order_id = p_order and kind in ('booking', 'prueba') limit 1;
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
    -- Prueba del curso pagada: nace el crédito por lo efectivamente pagado, que vence 7 días
    -- después de la sesión. Uno por reserva (índice único): una re-entrega no duplica.
    if v_order_kind = 'trial' and v_reservation is not null and v_amount > 0 then
      insert into course_credits (email, amount_clp, source_reservation_id, expires_at, note)
        select lower(o.customer_email), o.amount_clp, r.id, r.starts_at + interval '7 days',
               'Prueba ' || to_char(r.starts_at at time zone 'America/Santiago', 'DD-MM-YYYY')
          from orders o join reservations r on r.id = v_reservation
         where o.id = p_order and o.customer_email is not null
        on conflict (source_reservation_id) where source_reservation_id is not null do nothing;
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

  update orders set status = 'paid', mp_payment_id = v_pid,
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

-- Limpieza: mp_payment_id queda SOLO para ids reales de Mercado Pago.
update orders set mp_payment_id = null where mp_payment_id like 'offline:%' and payment_method is not null;

-- ── 6. mark_refunded: una prueba devuelta entera anula su crédito ───────────
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
    -- PRUEBA devuelta entera: su crédito (si no se usó) deja de valer.
    if v_reservation is not null then
      update course_credits set voided_at = now()
       where source_reservation_id = v_reservation and consumed_order_id is null and voided_at is null;
    end if;
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

-- ── 7. create_course_enrollment: crédito anulado no vale; cierra la solicitud por email ──
create or replace function create_course_enrollment(
  p_generation    uuid,
  p_plan          text,
  p_students      jsonb,
  p_amount        int,
  p_net           int,
  p_tax           int,
  p_lead          uuid default null,
  p_terms_version text default null,
  p_terms_source  text default null,
  p_notes         text default null,
  p_credit        uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_gen course_generations;
  v_order uuid; v_seat int; v_price int; v_student jsonb;
  v_first_name text; v_first_email text; v_first_phone text; v_n int := 0;
  v_credit_amount int;
  v_payer uuid; v_student_customer uuid;
begin
  if p_plan not in ('duo', 'individual') then raise exception 'curso_bad_plan'; end if;
  if jsonb_array_length(p_students) < 1 then raise exception 'curso_sin_alumnos'; end if;
  if p_plan = 'duo' and jsonb_array_length(p_students) <> 2 then raise exception 'curso_duo_necesita_dos'; end if;
  if p_plan = 'individual' and jsonb_array_length(p_students) <> 1 then raise exception 'curso_individual_es_uno'; end if;

  update course_enrollments set status = 'expirada'
    where generation_id = p_generation and status = 'reservada' and expires_at < now();

  select * into v_gen from course_generations where id = p_generation for update;
  if v_gen.id is null then raise exception 'curso_generation_missing'; end if;
  if v_gen.status not in ('abierta', 'en_curso') then raise exception 'curso_generation_closed'; end if;

  v_price := case when p_plan = 'duo' then v_gen.price_duo_clp else v_gen.price_individual_clp end;

  v_first_name  := p_students -> 0 ->> 'name';
  v_first_email := lower(p_students -> 0 ->> 'email');
  v_first_phone := p_students -> 0 ->> 'phone';

  -- Ficha de quien compra, con la regla del checkout. El snapshot del pedido sale de
  -- la ficha (un titular de cuenta conserva su nombre), igual que create_checkout.
  v_payer := upsert_guest_customer(v_first_name, v_first_email, v_first_phone);
  if v_payer is not null then
    select coalesce(c.name, v_first_name), coalesce(c.email, v_first_email), coalesce(c.phone, v_first_phone)
      into v_first_name, v_first_email, v_first_phone
      from customers c where c.id = v_payer;
  end if;

  insert into orders (kind, status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, customer_id,
                      terms_accepted_at, terms_version, terms_source)
    values ('course', 'pending_payment', v_gen.currency, p_amount, p_net, p_tax,
            v_first_name, v_first_email, v_first_phone, v_payer,
            case when p_terms_source is not null then now() end,
            case when p_terms_source is not null then p_terms_version end,
            p_terms_source)
    returning id into v_order;

  if p_credit is not null then
    update course_credits
       set consumed_order_id = v_order, consumed_at = now()
     where id = p_credit and consumed_order_id is null and expires_at > now() and voided_at is null
     returning amount_clp into v_credit_amount;
    if v_credit_amount is null then raise exception 'curso_credito_no_disponible'; end if;
  end if;

  for v_student in select jsonb_array_elements(p_students) loop
    select coalesce(min(s.n), 0) into v_seat
      from generate_series(1, v_gen.seats) s(n)
      where not exists (
        select 1 from course_enrollments e
         where e.generation_id = p_generation and e.seat_no = s.n
           and e.status in ('reservada', 'pagada'));
    if v_seat = 0 then raise exception 'curso_sin_cupos'; end if;

    -- Cada persona del dúo es cliente con su propia ficha.
    v_student_customer := upsert_guest_customer(v_student ->> 'name', v_student ->> 'email', v_student ->> 'phone');

    insert into course_enrollments (generation_id, lead_id, order_id, seat_no, plan,
        student_name, student_email, student_phone, status, price_clp, expires_at, notes, customer_id)
      values (p_generation, p_lead, v_order, v_seat::int2, p_plan,
              v_student ->> 'name', lower(v_student ->> 'email'), v_student ->> 'phone',
              'reservada', v_price, null, p_notes, v_student_customer);
    v_n := v_n + 1;
  end loop;

  insert into order_lines (order_id, line_type, description, quantity, unit_price_clp, subtotal_clp)
    values (v_order, 'flat_service',
            format('Curso de Iniciación DJ · %s · %s', v_gen.code,
                   case when p_plan = 'duo' then 'en dúo' else 'individual' end),
            v_n, v_price, v_price * v_n);

  if v_credit_amount is not null then
    insert into order_lines (order_id, line_type, description, quantity, unit_price_clp, subtotal_clp)
      values (v_order, 'discount', 'Crédito sesión de prueba', 1, -v_credit_amount, -v_credit_amount);
  end if;

  -- Sin lead explícito (se inscribió desde la ficha o "Nuevo programa"): cierra la
  -- solicitud abierta de esa persona por email, así no queda colgando "contactada".
  if p_lead is null then
    update course_leads set status = 'inscrita'
     where lower(email) = v_first_email and status in ('nueva', 'contactada');
  end if;
  if p_lead is not null then
    update course_leads set status = 'inscrita' where id = p_lead and status <> 'descartada';
  end if;

  return v_order;
end;
$$;
