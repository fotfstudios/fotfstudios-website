-- Fichas que no se pisan y el Curso de DJ no acumula puntos.
--
-- 1. ensure_customer: el escritor de fichas de los flujos del STAFF (curso). Igual puerta de
--    email que upsert_guest_customer, pero SOLO RELLENA: si la ficha ya existe no le pisa ni el
--    nombre ni el teléfono. Antes, inscribir con un nombre tipeado distinto renombraba la ficha
--    ("Martin Elicer Raab" → "Martín Elicer") y las listas mostraban dos nombres para una persona
--    (los pedidos guardan una foto del nombre). upsert_guest_customer sigue para el checkout
--    público: ahí es el propio cliente quien actualiza sus datos.
-- 2. El curso no acumula puntos: tampoco su sesión de prueba (pedido 'trial'). Las sesiones
--    guiadas y las horas de práctica ya no acumulaban (no tienen pedido).
-- 3. move_course_session: mover una sesión agendada suelta su recordatorio (hora nueva).
-- 4. Corrección puntual de Martín (ids de prod; en local/staging no encuentra nada).

-- ── 1. ensure_customer ──────────────────────────────────────────────────────
create function ensure_customer(p_name text, p_email text, p_phone text)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
  v_name  text := nullif(left(trim(p_name), 80), '');
  v_phone text := case when char_length(trim(p_phone)) between 6 and 40 then trim(p_phone) end;
  v_id    uuid;
begin
  if v_email is null
     or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
     or char_length(v_email) > 120 then
    return null;
  end if;

  -- Solo rellena lo que la ficha no tiene: nunca pisa un nombre o teléfono existente.
  insert into customers (email, name, phone) values (v_email, v_name, v_phone)
    on conflict (email) do update set
      name  = coalesce(customers.name, excluded.name),
      phone = coalesce(customers.phone, excluded.phone),
      updated_at = now()
    returning id into v_id;
  return v_id;
end;
$$;

-- ── 2. Los escritores del curso usan ensure_customer (cuerpos idénticos salvo esa llamada) ──
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
  v_payer := ensure_customer(v_first_name, v_first_email, v_first_phone);
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
    v_student_customer := ensure_customer(v_student ->> 'name', v_student ->> 'email', v_student ->> 'phone');

    insert into course_enrollments (generation_id, lead_id, order_id, seat_no, plan,
        student_name, student_email, student_phone, status, price_clp, expires_at, notes, customer_id)
      values (p_generation, p_lead, v_order, v_seat::int2, p_plan,
              coalesce((select c.name from customers c where c.id = v_student_customer), v_student ->> 'name'),
              lower(v_student ->> 'email'),
              coalesce((select c.phone from customers c where c.id = v_student_customer), v_student ->> 'phone'),
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

create or replace function substitute_student(
  p_enrollment uuid,
  p_name       text,
  p_email      text,
  p_phone      text default null
) returns void language plpgsql set search_path = public, pg_temp as $$
declare v_status text; v_customer uuid;
begin
  select status into v_status from course_enrollments where id = p_enrollment;
  if v_status is null or v_status not in ('reservada', 'pagada') then
    raise exception 'curso_enrollment_not_active';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'curso_reemplazante_incompleto';
  end if;

  v_customer := ensure_customer(p_name, p_email, p_phone);

  update course_enrollments
     set student_name = coalesce((select c.name from customers c where c.id = v_customer), p_name),
         student_email = lower(p_email),
         student_phone = coalesce((select c.phone from customers c where c.id = v_customer), p_phone),
         customer_id = v_customer,
         notes = trim(both from coalesce(notes || ' · ', '') ||
                      format('Reemplaza a %s', student_name))
   where id = p_enrollment;
end;
$$;

create or replace function redeem_practice_hours(
  p_enrollment uuid,
  p_starts     timestamptz,
  p_ends       timestamptz,
  p_hours      int2
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_total int2; v_used int2; v_resource uuid; v_valid date;
  v_name text; v_email text; v_phone text; v_res uuid; v_customer uuid;
begin
  if p_hours < 1 then raise exception 'practica_horas_invalidas'; end if;
  if p_ends <= p_starts then raise exception 'practica_rango_invalido'; end if;

  select e.practice_hours_total, e.practice_hours_redeemed, g.resource_id,
         course_practice_valid_until(g.id),
         e.student_name, e.student_email, e.student_phone, e.customer_id
    into v_total, v_used, v_resource, v_valid, v_name, v_email, v_phone, v_customer
    from course_enrollments e join course_generations g on g.id = e.generation_id
   where e.id = p_enrollment and e.status = 'pagada'
   for update of e;
  if v_total is null then raise exception 'practica_no_elegible'; end if;
  if v_used + p_hours > v_total then raise exception 'practica_sin_saldo'; end if;
  if v_valid is not null and p_starts::date > v_valid then raise exception 'practica_vencida'; end if;

  if v_customer is null then
    v_customer := ensure_customer(v_name, v_email, v_phone);
    if v_customer is not null then
      update course_enrollments set customer_id = v_customer where id = p_enrollment;
    end if;
  end if;

  insert into reservations (resource_id, kind, status, starts_at, ends_at,
                            customer_name, customer_email, customer_phone, customer_id, notes)
    values (v_resource, 'booking', 'confirmed', p_starts, p_ends,
            v_name, v_email, v_phone, v_customer, 'Práctica libre — curso DJ')
    returning id into v_res;

  insert into course_practice_redemptions (enrollment_id, reservation_id, hours)
    values (p_enrollment, v_res, p_hours);

  update course_enrollments set practice_hours_redeemed = v_used + p_hours
    where id = p_enrollment;

  perform log_booking_event(v_res, 'courtesy_confirmed');
  return v_res;
end;
$$;

create or replace function backfill_course_customers() returns void
language plpgsql set search_path = public, pg_temp as $$
declare e record; v_customer uuid;
begin
  for e in select id, student_name, student_email, student_phone from course_enrollments where customer_id is null loop
    v_customer := ensure_customer(e.student_name, e.student_email, e.student_phone);
    if v_customer is not null then
      update course_enrollments set customer_id = v_customer where id = e.id;
    end if;
  end loop;

  -- Pedido de curso → ficha de quien compró (el primer cupo).
  update orders o set customer_id = first.customer_id
    from (select distinct on (order_id) order_id, customer_id from course_enrollments
           where order_id is not null and customer_id is not null order by order_id, seat_no) first
   where o.id = first.order_id and o.kind = 'course' and o.customer_id is null;

  -- Práctica → ficha de su inscripción.
  update reservations r set customer_id = ce.customer_id
    from course_practice_redemptions p join course_enrollments ce on ce.id = p.enrollment_id
   where r.id = p.reservation_id and r.customer_id is null and ce.customer_id is not null;

  -- Créditos de prueba: quien vino a una prueba es cliente aunque no se haya inscrito.
  perform ensure_customer(null, c.email, null) from course_credits c
   where not exists (select 1 from customers x where x.email = lower(trim(c.email)));

  -- Sesiones guiadas futuras.
  perform course_sync_session_contacts(g) from (select distinct generation_id as g from course_sessions) s;
end;
$$;

-- ── 3. El curso (y su prueba) no acumula puntos ─────────────────────────────
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
    -- El Curso de DJ no acumula: tampoco su sesión de prueba (términos, Beatcoins).
    v_earn := case when v_order_kind = 'trial' then 0 else floor(0.05 * v_amount)::int end;
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

create or replace function award_retro_points(p_customer uuid)
returns int language plpgsql
set search_path = public, pg_temp as $$
declare
  v_awarded int := 0;
  v_earn    int;
  r record;
begin
  for r in
    select o.id, o.amount_clp - o.refunded_amount_clp as retained
      from orders o
      join customers c on c.id = p_customer
      where lower(o.customer_email) = c.email
        and o.status in ('paid', 'fulfilled', 'refunded')
        -- (1) el earn de un pedido delta vive en el pedido original
        and not exists (select 1 from reschedules rs where rs.delta_order_id = o.id)
        -- (3) el curso ni acumula ni acepta puntos (términos §6)
        and o.kind not in ('course', 'trial')
  loop
    select floor(0.05 * r.retained)::int
           - coalesce((select sum(amount)::int from points_ledger
                        where order_id = r.id and kind in ('earn', 'earn_revoke')), 0)
      into v_earn;
    if v_earn > 0 and apply_points(p_customer, r.id, 'earn', v_earn, '') then
      v_awarded := v_awarded + v_earn;
    end if;
  end loop;
  return v_awarded;
end;
$$;

-- ── 4. Mover una sesión agendada suelta su recordatorio ─────────────────────
create or replace function move_course_session(
  p_session    uuid,
  p_starts     timestamptz,
  p_ends       timestamptz,
  p_created_by uuid default null
) returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_status text; v_res uuid; v_gen uuid; v_n int2; v_old timestamptz;
  v_resource uuid; v_code text; v_new uuid;
begin
  select cs.status, cs.reservation_id, cs.generation_id, cs.n, r.starts_at
    into v_status, v_res, v_gen, v_n, v_old
    from course_sessions cs
    left join reservations r on r.id = cs.reservation_id
   where cs.id = p_session and cs.status in ('agendada', 'cancelada')
   for update of cs;
  if v_status is null or (v_status = 'agendada' and v_res is null) then
    raise exception 'curso_session_unscheduled';
  end if;
  if p_ends <= p_starts then raise exception 'curso_bad_range:%', v_n; end if;

  if v_status = 'agendada' then
    begin
      -- Hora nueva → recordatorio nuevo: sin esto, una sesión movida después de su
      -- recordatorio no recibía otro.
      update reservations set starts_at = p_starts, ends_at = p_ends, reminder_sent_at = null where id = v_res;
    exception when exclusion_violation then
      raise exception 'curso_slot_taken:%', v_n;
    end;
    perform log_booking_event(v_res, 'curso_session_moved',
      p_detail => jsonb_build_object('n', v_n, 'old_starts_at', v_old, 'new_starts_at', p_starts),
      p_created_by => p_created_by);
    return;
  end if;

  -- Re-agendar: el programa tiene que seguir vivo y la fecha en el futuro.
  select resource_id, code into v_resource, v_code
    from course_generations where id = v_gen and status in ('borrador', 'abierta', 'en_curso');
  if v_resource is null then raise exception 'curso_generation_not_schedulable'; end if;
  if p_starts <= now() then raise exception 'curso_in_past:%', v_n; end if;

  begin
    insert into reservations (resource_id, kind, status, starts_at, ends_at, notes)
      values (v_resource, 'curso', 'confirmed', p_starts, p_ends,
              format('Curso %s · Sesión %s', v_code, v_n))
      returning id into v_new;
  exception when exclusion_violation then
    raise exception 'curso_slot_taken:%', v_n;
  end;

  update course_sessions set reservation_id = v_new, status = 'agendada' where id = p_session;
  perform log_booking_event(v_new, 'curso_session_scheduled',
    p_detail => jsonb_build_object('generation', v_code, 'n', v_n, 'rescheduled_from', v_res),
    p_created_by => p_created_by);
end;
$$;

-- ── 5. Corrección puntual: Martín ───────────────────────────────────────────
-- Su prueba del 30-09 se agendó como ensayo (antes de que existiera el tipo 'prueba'):
-- ganó 999 puntos, no quedó enlazada a su crédito, y su inscripción le renombró la ficha.
-- Ids de producción: en local y staging ninguna fila calza y el bloque no hace nada.
do $$
declare
  v_customer uuid := '9d7c4481-9e4b-448f-9911-2bd05c587c22';
  v_order    uuid := '22098ed1-1790-4ebd-8ac6-6c72ab27dd58';
  v_res      uuid := '1926ce6c-aa55-4995-ba79-bbf413bc557f';
  v_credit   uuid := 'bbc1e240-6cad-4598-8351-84c8b4fa15e1';
  v_earned   int;
  c          customers%rowtype;
begin
  select * into c from customers where id = v_customer;
  if c.id is null then return; end if;

  -- (a) La prueba vuelve a ser lo que fue (solo si sigue siendo ese ensayo de 30-09).
  update orders set kind = 'trial'
   where id = v_order and customer_id = v_customer and kind = 'booking' and amount_clp = 19990;
  update reservations set kind = 'prueba'
   where id = v_res and order_id = v_order and kind = 'booking' and starts_at = '2026-09-30 15:00+00';

  -- (b) Se revocan los puntos que ganó (queda en su historial).
  select coalesce(sum(amount), 0) into v_earned
    from points_ledger where order_id = v_order and kind in ('earn', 'earn_revoke');
  if v_earned > 0 then
    perform apply_points(v_customer, v_order, 'earn_revoke', -v_earned, 'curso:prueba-sin-puntos');
  end if;

  -- (c) Su crédito (ya usado en la inscripción) queda enlazado a la prueba.
  update course_credits set source_reservation_id = v_res
   where id = v_credit and source_reservation_id is null;

  -- (d) Un solo nombre: la ficha y todas sus fotos (pedidos, reservas, inscripción).
  perform update_customer_contact(v_customer, 'Martín Elicer Raab', c.email, c.phone);
  update course_enrollments set student_name = 'Martín Elicer Raab' where customer_id = v_customer;
end $$;
