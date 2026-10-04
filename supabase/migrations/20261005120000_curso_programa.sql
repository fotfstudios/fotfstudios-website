-- Curso de DJ 1:1 — el programa por alumno.
--
-- Desde el relanzamiento (#221) el curso se vende 1:1 (o en dúo): 6 sesiones de
-- 90 min en cualquier día y hora, 6 horas de práctica. En vez de una tabla nueva,
-- cada pedido es su propia fila de course_generations ("programa"): seats 1 o 2.
-- Todo lo que ya cuelga de una generación sigue igual —cupos, pago, boleta,
-- reembolso, práctica, espejo de calendario— porque course_sessions.generation_id
-- y course_enrollments.generation_id son NOT NULL y cada RPC del curso pasa por ahí.
--
-- `kind` distingue el programa de la cohorte antigua: solo un programa suelta su
-- agenda cuando se queda sin alumnos. Una cohorte vacía puede seguir abierta
-- esperando inscritos, y borrarle las fechas sería un error.
--
-- Aditiva: el admin por generaciones sigue funcionando sobre este esquema.

-- ── 1. Esquema ─────────────────────────────────────────────────────────────
-- Muchos programas abiertos a la vez: el "una sola abierta" era de la cohorte.
drop index course_generations_one_open;

alter table course_generations
  add column kind text not null default 'cohorte' check (kind in ('cohorte', 'programa')),
  add column instructor text check (char_length(instructor) between 1 and 60),
  alter column seats set default 1,
  alter column practice_hours_per_seat set default 6;

alter table course_sessions
  add column instructor text check (char_length(instructor) between 1 and 60);

alter table course_enrollments
  alter column practice_hours_total set default 6;

-- P0001, P0002…: cabe en el `code` de ≤ 8 caracteres y no choca con G01/GT1.
create sequence course_program_code_seq;

-- ── 2. Datos: el curso 1:1 trae 6 horas de práctica ────────────────────────
-- Decisión del dueño (2026-10-04): quien ya está inscrito compró la oferta 1:1,
-- así que su saldo sube de 4 a 6. Solo inscripciones vivas que sigan en 4.
update course_enrollments set practice_hours_total = 6
 where status in ('reservada', 'pagada') and practice_hours_total = 4;
update course_generations set practice_hours_per_seat = 6
 where practice_hours_per_seat = 4;

-- ── 3. Crear un programa: programa + pedido + cupos, una transacción ───────
-- Envuelve create_course_enrollment SIN cambiarla: el pedido, el crédito de
-- prueba, la boleta y el lead siguen pasando por el mismo camino ya probado.
-- Los precios llegan como argumentos (fuente: lib/curso-content.ts) y quedan
-- congelados en la fila del programa.
create function create_course_program(
  p_resource         uuid,
  p_plan             text,
  p_students         jsonb,
  p_amount           int,
  p_net              int,
  p_tax              int,
  p_price_duo        int,
  p_price_individual int,
  p_price_prueba     int,
  p_instructor       text default null,
  p_lead             uuid default null,
  p_terms_version    text default null,
  p_terms_source     text default null,
  p_notes            text default null,
  p_credit           uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_gen uuid; v_order uuid; v_name text;
begin
  if p_plan not in ('duo', 'individual') then raise exception 'curso_bad_plan'; end if;

  select left(string_agg(s ->> 'name', ' y '), 60) into v_name
    from jsonb_array_elements(p_students) s;

  insert into course_generations (resource_id, kind, code, name, status, seats,
                                  price_duo_clp, price_individual_clp, price_prueba_clp,
                                  practice_hours_per_seat, instructor)
    values (p_resource, 'programa',
            'P' || lpad(nextval('course_program_code_seq')::text, 4, '0'),
            coalesce(nullif(trim(v_name), ''), 'Programa'), 'abierta',
            case p_plan when 'duo' then 2 else 1 end,
            p_price_duo, p_price_individual, p_price_prueba,
            6, nullif(trim(p_instructor), ''))
    returning id into v_gen;

  v_order := create_course_enrollment(v_gen, p_plan, p_students, p_amount, p_net, p_tax,
                                      p_lead, p_terms_version, p_terms_source, p_notes, p_credit);

  -- El saldo de práctica sale del programa, no del default de la columna.
  update course_enrollments e set practice_hours_total = g.practice_hours_per_seat
    from course_generations g
   where e.order_id = v_order and g.id = e.generation_id;

  return v_order;
end;
$$;

-- ── 4. Un programa sin alumnos vivos suelta la sala ────────────────────────
-- Trigger y no un parche en cada RPC: un alumno deja de estar vivo por cinco
-- caminos (cancel_course_order, el barrido de 72 h, mark_refunded, el traslado y
-- el UPDATE directo de "anular pagada" en la app). Engancharlo en la tabla los
-- cubre a todos y deja intactas las funciones del dinero.
create function release_course_program_sessions(p_generation uuid)
returns int language plpgsql set search_path = public, pg_temp as $$
declare s record; v_count int := 0;
begin
  -- FOR UPDATE: dos inscripciones del mismo dúo anuladas en paralelo no pueden
  -- verse "vivas" mutuamente y dejar la agenda tomada.
  perform 1 from course_generations
   where id = p_generation and kind = 'programa' for update;
  if not found then return 0; end if;

  if exists (select 1 from course_enrollments
              where generation_id = p_generation and status in ('reservada', 'pagada')) then
    return 0;
  end if;

  for s in
    select cs.id, cs.n, cs.reservation_id from course_sessions cs
     where cs.generation_id = p_generation and cs.status = 'agendada' and cs.reservation_id is not null
  loop
    update reservations set status = 'cancelled', cancelled_at = now()
     where id = s.reservation_id and status in ('held', 'confirmed');
    update course_sessions set status = 'cancelada' where id = s.id;
    perform log_booking_event(s.reservation_id, 'curso_session_cancelled',
      p_detail => jsonb_build_object('n', s.n, 'reason', 'program_released'));
    v_count := v_count + 1;
  end loop;

  update course_generations set status = 'cancelada'
   where id = p_generation and status in ('borrador', 'abierta', 'en_curso');
  return v_count;
end;
$$;

create function course_enrollment_release_program() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform release_course_program_sessions(new.generation_id);
  return null;
end;
$$;

create trigger course_enrollment_release_program_au
  after update of status on course_enrollments
  for each row
  when (old.status in ('reservada', 'pagada') and new.status not in ('reservada', 'pagada'))
  execute function course_enrollment_release_program();

-- ── 5. Agendar copia el instructor ─────────────────────────────────────────
-- Igual que 20260824130000, más el instructor: el de la sesión (si viene en el
-- payload) gana sobre el del programa.
create or replace function schedule_course_generation(
  p_generation uuid,
  p_sessions   jsonb,
  p_created_by uuid default null
) returns int language plpgsql set search_path = public, pg_temp as $$
declare
  v_resource uuid; v_code text; v_instructor text; v_res uuid; v_n int2;
  v_starts timestamptz; v_ends timestamptz; s jsonb; v_count int := 0;
begin
  select resource_id, code, instructor into v_resource, v_code, v_instructor
    from course_generations
   where id = p_generation and status in ('borrador', 'abierta')
   for update;
  if v_resource is null then raise exception 'curso_generation_not_schedulable'; end if;

  if exists (select 1 from course_sessions
              where generation_id = p_generation and status = 'agendada' and reservation_id is not null) then
    raise exception 'curso_already_scheduled';
  end if;

  for s in select jsonb_array_elements(p_sessions) loop
    v_n      := (s ->> 'n')::int2;
    v_starts := (s ->> 'starts_at')::timestamptz;
    v_ends   := (s ->> 'ends_at')::timestamptz;

    if v_ends <= v_starts then raise exception 'curso_bad_range:%', v_n; end if;
    if v_starts <= now() then raise exception 'curso_in_past:%', v_n; end if;

    begin
      insert into reservations (resource_id, kind, status, starts_at, ends_at, notes)
        values (v_resource, 'curso', 'confirmed', v_starts, v_ends,
                format('Curso %s · Sesión %s', v_code, v_n))
        returning id into v_res;
    exception when exclusion_violation then
      raise exception 'curso_slot_taken:%', v_n;
    end;

    insert into course_sessions (generation_id, n, title, reservation_id, instructor)
      values (p_generation, v_n, coalesce(s ->> 'title', format('Sesión %s', v_n)), v_res,
              coalesce(nullif(trim(s ->> 'instructor'), ''), v_instructor))
      on conflict (generation_id, n)
        do update set title = excluded.title, reservation_id = excluded.reservation_id,
                      instructor = excluded.instructor, status = 'agendada';

    perform log_booking_event(v_res, 'curso_session_scheduled',
      p_detail => jsonb_build_object('generation', v_code, 'n', v_n),
      p_created_by => p_created_by);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── 6. Mover también re-agenda una sesión cancelada ────────────────────────
-- Los términos prometen "reagendamos tu sesión", y una sesión cancelada era un
-- callejón sin salida: schedule_course_generation se niega mientras haya otras
-- agendadas. Cancelada → bloque NUEVO (la reserva vieja queda cancelada como
-- rastro); agendada → se mueve el rango, igual que antes.
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
      update reservations set starts_at = p_starts, ends_at = p_ends where id = v_res;
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

-- ── 7. La práctica vence 90 días después de la última sesión ───────────────
-- Calculado, no guardado: mover la sesión 6 mueve el vencimiento sin que nadie
-- tenga que acordarse. `practice_valid_until` sigue como ajuste manual y gana.
-- Sin sesiones agendadas no hay fecha → no vence (NULL).
create function course_practice_valid_until(p_generation uuid)
returns date language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    g.practice_valid_until,
    (select max((r.ends_at at time zone coalesce(l.timezone, 'America/Santiago'))::date) + 90
       from course_sessions cs
       join reservations r on r.id = cs.reservation_id
       left join resources res on res.id = r.resource_id
       left join locations l on l.id = res.location_id
      where cs.generation_id = g.id and cs.status in ('agendada', 'dictada')))
  from course_generations g where g.id = p_generation;
$$;

-- Igual que 20260824180000, salvo el vencimiento.
create or replace function redeem_practice_hours(
  p_enrollment uuid,
  p_starts     timestamptz,
  p_ends       timestamptz,
  p_hours      int2
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_total int2; v_used int2; v_resource uuid; v_valid date;
  v_name text; v_email text; v_phone text; v_res uuid;
begin
  if p_hours < 1 then raise exception 'practica_horas_invalidas'; end if;
  if p_ends <= p_starts then raise exception 'practica_rango_invalido'; end if;

  select e.practice_hours_total, e.practice_hours_redeemed, g.resource_id,
         course_practice_valid_until(g.id),
         e.student_name, e.student_email, e.student_phone
    into v_total, v_used, v_resource, v_valid, v_name, v_email, v_phone
    from course_enrollments e join course_generations g on g.id = e.generation_id
   where e.id = p_enrollment and e.status = 'pagada'
   for update of e;
  if v_total is null then raise exception 'practica_no_elegible'; end if;
  if v_used + p_hours > v_total then raise exception 'practica_sin_saldo'; end if;
  if v_valid is not null and p_starts::date > v_valid then raise exception 'practica_vencida'; end if;

  insert into reservations (resource_id, kind, status, starts_at, ends_at,
                            customer_name, customer_email, customer_phone, notes)
    values (v_resource, 'booking', 'confirmed', p_starts, p_ends,
            v_name, v_email, v_phone, 'Práctica libre — curso DJ')
    returning id into v_res;

  insert into course_practice_redemptions (enrollment_id, reservation_id, hours)
    values (p_enrollment, v_res, p_hours);

  update course_enrollments set practice_hours_redeemed = v_used + p_hours
    where id = p_enrollment;

  perform log_booking_event(v_res, 'courtesy_confirmed');
  return v_res;
end;
$$;
