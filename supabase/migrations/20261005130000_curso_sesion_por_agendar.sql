-- Curso 1:1: agendar UNA sesión a la vez ("por agendar").
--
-- Un alumno 1:1 no fija las 6 fechas de una: acuerda cada sesión cuando puede, en
-- cualquier día y hora. schedule_course_generation (todo o nada, misma hora cada
-- semana) obligaba a reservar la sala en fechas de relleno que bloqueaban horas
-- vendibles hasta moverlas. Esta función agenda solo la sesión `n`: la sala se
-- toma recién cuando hay una fecha acordada.
--
-- Si la sesión `n` está cancelada, se re-agenda con un bloque nuevo (la reserva
-- vieja queda cancelada como rastro, igual que en move_course_session). Si ya está
-- agendada o dictada, se rechaza: para cambiarla está Editar.
create function schedule_course_session(
  p_generation uuid,
  p_n          int2,
  p_title      text,
  p_starts     timestamptz,
  p_ends       timestamptz,
  p_instructor text default null,
  p_created_by uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_resource uuid; v_code text; v_instructor text; v_status text; v_res uuid; v_session uuid;
begin
  if p_n < 1 or p_n > 12 then raise exception 'curso_bad_session'; end if;

  -- FOR UPDATE: dos "Agendar" de la misma sesión (doble clic) no crean dos bloques.
  select resource_id, code, instructor into v_resource, v_code, v_instructor
    from course_generations
   where id = p_generation and status in ('borrador', 'abierta', 'en_curso')
   for update;
  if v_resource is null then raise exception 'curso_generation_not_schedulable'; end if;

  select status into v_status from course_sessions where generation_id = p_generation and n = p_n;
  if v_status in ('agendada', 'dictada') then raise exception 'curso_session_already_scheduled:%', p_n; end if;

  if p_ends <= p_starts then raise exception 'curso_bad_range:%', p_n; end if;
  if p_starts <= now() then raise exception 'curso_in_past:%', p_n; end if;

  begin
    insert into reservations (resource_id, kind, status, starts_at, ends_at, notes)
      values (v_resource, 'curso', 'confirmed', p_starts, p_ends, format('Curso %s · Sesión %s', v_code, p_n))
      returning id into v_res;
  exception when exclusion_violation then
    raise exception 'curso_slot_taken:%', p_n;
  end;

  insert into course_sessions (generation_id, n, title, reservation_id, instructor)
    values (p_generation, p_n, coalesce(nullif(trim(p_title), ''), format('Sesión %s', p_n)), v_res,
            coalesce(nullif(trim(p_instructor), ''), v_instructor))
    on conflict (generation_id, n)
      do update set title = excluded.title, reservation_id = excluded.reservation_id,
                    instructor = excluded.instructor, status = 'agendada'
    returning id into v_session;

  perform log_booking_event(v_res, 'curso_session_scheduled',
    p_detail => jsonb_build_object('generation', v_code, 'n', p_n), p_created_by => p_created_by);
  return v_session;
end;
$$;
