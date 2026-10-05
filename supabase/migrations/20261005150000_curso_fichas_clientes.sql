-- Quien se inscribe al curso, practica o viene a una prueba es CLIENTE.
--
-- Hasta acá solo el checkout de sala (y la cortesía, y el "Nuevo cliente" del admin)
-- creaban ficha (`customers`). Una inscripción al curso nunca lo hacía: el alumno no
-- aparecía en /admin/clientes ni tenía historial. Ahora todas las puertas de entrada
-- crean o reutilizan la ficha con la MISMA regla que el checkout (upsert_guest_customer:
-- un invitado actualiza nombre y teléfono; un titular de cuenta conserva los suyos) y
-- la enlazan:
--   · inscripción (nueva columna course_enrollments.customer_id), por persona — en dúo,
--     cada uno con su ficha —, y el pedido a la ficha de quien compró;
--   · reemplazante (su propia ficha; el pedido sigue a nombre de quien pagó);
--   · práctica libre y sesiones guiadas (reservations.customer_id);
--   · crédito de sesión de prueba (lo crea la app al emitirlo).
-- Un walk-in solo con nombre sigue sin ficha: una ficha necesita email o teléfono.
--
-- Y el curso no acumula puntos (términos §6): award_retro_points, que recorre los
-- pedidos de la ficha al entrar a /cuenta, deja fuera los pedidos de curso. Antes no
-- importaba porque casi ningún alumno tenía ficha; ahora todos.

-- ── 1. Inscripción → ficha ──────────────────────────────────────────────────
alter table course_enrollments
  add column customer_id uuid references customers (id) on delete set null;
create index course_enrollments_customer_idx on course_enrollments (customer_id);

-- ── 2. create_course_enrollment crea/enlaza fichas ─────────────────────────
-- Igual que 20260824150000, más: ficha del pagador → pedido (con el snapshot de la
-- ficha, como create_checkout) y ficha de cada alumno → su inscripción.
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
     where id = p_credit and consumed_order_id is null and expires_at > now()
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

  if p_lead is not null then
    update course_leads set status = 'inscrita' where id = p_lead and status <> 'descartada';
  end if;

  return v_order;
end;
$$;

-- ── 3. Reemplazante: su propia ficha (el pedido no se toca) ────────────────
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

  v_customer := upsert_guest_customer(p_name, p_email, p_phone);

  update course_enrollments
     set student_name = p_name,
         student_email = lower(p_email),
         student_phone = p_phone,
         customer_id = v_customer,
         notes = trim(both from coalesce(notes || ' · ', '') ||
                      format('Reemplaza a %s', student_name))
   where id = p_enrollment;
end;
$$;

-- ── 4. Traslado: la inscripción nueva conserva la ficha ────────────────────
create or replace function transfer_enrollment(
  p_enrollment uuid,
  p_target     uuid
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_src course_enrollments;
  v_gen course_generations;
  v_seat int;
  v_new uuid;
begin
  select * into v_src from course_enrollments where id = p_enrollment for update;
  if v_src.id is null or v_src.status not in ('reservada', 'pagada') then
    raise exception 'curso_enrollment_not_active';
  end if;
  if v_src.generation_id = p_target then raise exception 'curso_misma_generacion'; end if;

  update course_enrollments set status = 'expirada'
    where generation_id = p_target and status = 'reservada' and expires_at < now();

  select * into v_gen from course_generations where id = p_target for update;
  if v_gen.id is null then raise exception 'curso_generation_missing'; end if;
  if v_gen.status in ('cerrada', 'cancelada') then raise exception 'curso_generation_closed'; end if;

  select coalesce(min(s.n), 0) into v_seat
    from generate_series(1, v_gen.seats) s(n)
    where not exists (
      select 1 from course_enrollments e
       where e.generation_id = p_target and e.seat_no = s.n
         and e.status in ('reservada', 'pagada'));
  if v_seat = 0 then raise exception 'curso_sin_cupos'; end if;

  insert into course_enrollments (generation_id, lead_id, order_id, seat_no, plan,
      student_name, student_email, student_phone, status, price_clp, notes, customer_id)
    values (p_target, v_src.lead_id, v_src.order_id, v_seat::int2, v_src.plan,
            v_src.student_name, v_src.student_email, v_src.student_phone,
            v_src.status, v_src.price_clp, v_src.notes, v_src.customer_id)
    returning id into v_new;

  update course_enrollments
     set status = 'trasladada', transferred_to = v_new, cancelled_at = now()
   where id = p_enrollment;

  return v_new;
end;
$$;

-- ── 5. Práctica: la reserva queda en la ficha del alumno ───────────────────
-- Igual que 20261005120000, más customer_id (de la inscripción; si no tuviera, se
-- crea con la misma regla).
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
    v_customer := upsert_guest_customer(v_name, v_email, v_phone);
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

-- ── 6. Sesiones guiadas: el contacto incluye la ficha ──────────────────────
-- Cambia el tipo de retorno → drop + create. course_sync_session_contacts es
-- plpgsql (se resuelve al ejecutar), así que no depende del objeto viejo.
drop function course_session_contact(uuid);
create function course_session_contact(p_generation uuid)
returns table (name text, email text, phone text, customer_id uuid)
language sql stable set search_path = public, pg_temp as $$
  select student_name, student_email, student_phone, customer_id
    from course_enrollments
   where generation_id = p_generation and status = 'pagada'
   order by seat_no
   limit 1;
$$;

create or replace function course_sync_session_contacts(p_generation uuid, p_reservation uuid default null)
returns void language plpgsql set search_path = public, pg_temp as $$
declare c record;
begin
  select * into c from course_session_contact(p_generation);
  update reservations r
     set customer_name = c.name, customer_email = c.email, customer_phone = c.phone, customer_id = c.customer_id
    from course_sessions cs
   where cs.generation_id = p_generation
     and r.id = cs.reservation_id
     and r.kind = 'curso'
     and (case when p_reservation is null then r.ends_at > now() else r.id = p_reservation end)
     and (r.customer_name, r.customer_email, r.customer_phone, r.customer_id)
         is distinct from (c.name, c.email, c.phone, c.customer_id);
end;
$$;

-- El trigger de inscripciones también debe correr cuando cambia la ficha.
drop trigger course_enrollments_contact_aiu on course_enrollments;
create trigger course_enrollments_contact_aiu
  after insert or update of status, student_name, student_email, student_phone, customer_id on course_enrollments
  for each row execute function course_session_contact_on_enrollment();

-- ── 7. El curso no acumula puntos ──────────────────────────────────────────
-- Igual que 20260911140000, más `o.kind <> 'course'`.
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
        and o.kind <> 'course'
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

-- ── 8. Backfill (idempotente) ──────────────────────────────────────────────
-- Fichas para quienes se inscribieron o recibieron un crédito de prueba antes de
-- esto, y sus enlaces. Función y no bloque suelto: el itest la vuelve a correr.
create function backfill_course_customers() returns void
language plpgsql set search_path = public, pg_temp as $$
declare e record; v_customer uuid;
begin
  for e in select id, student_name, student_email, student_phone from course_enrollments where customer_id is null loop
    v_customer := upsert_guest_customer(e.student_name, e.student_email, e.student_phone);
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
  perform upsert_guest_customer(null, c.email, null) from course_credits c
   where not exists (select 1 from customers x where x.email = lower(trim(c.email)));

  -- Sesiones guiadas futuras.
  perform course_sync_session_contacts(g) from (select distinct generation_id as g from course_sessions) s;
end;
$$;

select backfill_course_customers();
