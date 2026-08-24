-- Agendar las sesiones de una generación: TODAS o NINGUNA.
--
-- Una generación media agendada es estrictamente peor que ninguna: el dueño
-- tendría que recordar qué sesión falta, y /curso-dj y /terminos prometen cuatro.
-- Como acá no hay plata capturada, no existe la razón que sí justifica el
-- resultado parcial de apply_reschedule_charge (ahí el cliente ya pagó).
--
-- El bloqueo de sala sale gratis: las filas son reservations kind='curso', así que
-- el EXCLUDE gist impide agendar sobre una reserva pagada (y viceversa), y el motor
-- de disponibilidad —que filtra por status, nunca por kind— deja de ofrecer esas
-- horas en /reservar sin tocar una línea.

-- ── Preview: qué choca, ANTES de intentar ──────────────────────────────────
-- Read-only. El TOCTOU es aceptado y consciente: la DB sigue siendo la autoridad,
-- igual que en /reservar (el calendario muestra disponibilidad y el checkout aún
-- puede devolver 409). Sirve para que el dueño vea el nombre y el monto del cliente
-- con el que va a chocar antes de decidir, en vez de comerse un error seco.
create function preview_course_conflicts(p_resource uuid, p_sessions jsonb)
returns table (
  n                 int2,
  starts_at         timestamptz,
  ends_at           timestamptz,
  conflict_id       uuid,
  conflict_kind     text,
  conflict_status   text,
  conflict_customer text,
  conflict_amount   int
)
language sql stable set search_path = public, pg_temp as $$
  select (s ->> 'n')::int2,
         (s ->> 'starts_at')::timestamptz,
         (s ->> 'ends_at')::timestamptz,
         r.id, r.kind, r.status::text, r.customer_name, o.amount_clp
    from jsonb_array_elements(p_sessions) s
    join reservations r
      on r.resource_id = p_resource
     and r.status in ('held', 'confirmed')
     and tstzrange(r.starts_at, r.ends_at)
         && tstzrange((s ->> 'starts_at')::timestamptz, (s ->> 'ends_at')::timestamptz)
    left join orders o on o.id = r.order_id
   order by 1;
$$;

-- ── Agendar: atómico ───────────────────────────────────────────────────────
create function schedule_course_generation(
  p_generation uuid,
  p_sessions   jsonb,
  p_created_by uuid default null
) returns int language plpgsql set search_path = public, pg_temp as $$
declare
  v_resource uuid; v_code text; v_res uuid; v_n int2;
  v_starts timestamptz; v_ends timestamptz; s jsonb; v_count int := 0;
begin
  -- FOR UPDATE serializa dos submits del mismo formulario (doble clic, dos pestañas).
  select resource_id, code into v_resource, v_code
    from course_generations
   where id = p_generation and status in ('borrador', 'abierta')
   for update;
  if v_resource is null then raise exception 'curso_generation_not_schedulable'; end if;

  -- Idempotencia: re-enviar no duplica bloques. El dueño reagenda sesión por sesión
  -- con move_course_session, no re-agendando la generación entera.
  if exists (select 1 from course_sessions
              where generation_id = p_generation and status = 'agendada' and reservation_id is not null) then
    raise exception 'curso_already_scheduled';
  end if;

  for s in select jsonb_array_elements(p_sessions) loop
    v_n      := (s ->> 'n')::int2;
    v_starts := (s ->> 'starts_at')::timestamptz;
    v_ends   := (s ->> 'ends_at')::timestamptz;

    if v_ends <= v_starts then raise exception 'curso_bad_range:%', v_n; end if;
    -- El dueño está exento de la anticipación mínima (igual que la reserva manual
    -- del admin), pero el pasado sigue vetado: una sesión ayer no bloquea nada.
    if v_starts <= now() then raise exception 'curso_in_past:%', v_n; end if;

    begin
      insert into reservations (resource_id, kind, status, starts_at, ends_at, notes)
        values (v_resource, 'curso', 'confirmed', v_starts, v_ends,
                format('Curso %s · Sesión %s', v_code, v_n))
        returning id into v_res;
    exception when exclusion_violation then
      -- Re-lanzar con el número de sesión: el formulario resalta la fila culpable.
      -- Propagar aborta la función completa → nunca queda media generación agendada.
      raise exception 'curso_slot_taken:%', v_n;
    end;

    insert into course_sessions (generation_id, n, title, reservation_id)
      values (p_generation, v_n, coalesce(s ->> 'title', format('Sesión %s', v_n)), v_res)
      on conflict (generation_id, n)
        do update set title = excluded.title, reservation_id = excluded.reservation_id,
                      status = 'agendada';

    perform log_booking_event(v_res, 'curso_session_scheduled',
      p_detail => jsonb_build_object('generation', v_code, 'n', v_n),
      p_created_by => p_created_by);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── Mover una sesión ───────────────────────────────────────────────────────
-- NO pasa por reschedule_move: esa RPC exige reservations.order_id y una orden
-- pagada, y un bloque de curso no tiene precio (el alumno paga la generación).
-- Acá solo se mueve el rango; el GiST decide si se puede.
create function move_course_session(
  p_session    uuid,
  p_starts     timestamptz,
  p_ends       timestamptz,
  p_created_by uuid default null
) returns void language plpgsql set search_path = public, pg_temp as $$
declare v_res uuid; v_gen uuid; v_old timestamptz; v_n int2;
begin
  select cs.reservation_id, cs.generation_id, cs.n, r.starts_at
    into v_res, v_gen, v_n, v_old
    from course_sessions cs
    join reservations r on r.id = cs.reservation_id
   where cs.id = p_session and cs.status = 'agendada';
  if v_res is null then raise exception 'curso_session_unscheduled'; end if;
  if p_ends <= p_starts then raise exception 'curso_bad_range:%', v_n; end if;

  begin
    update reservations set starts_at = p_starts, ends_at = p_ends where id = v_res;
  exception when exclusion_violation then
    raise exception 'curso_slot_taken:%', v_n;
  end;

  perform log_booking_event(v_res, 'curso_session_moved',
    p_detail => jsonb_build_object('n', v_n, 'old_starts_at', v_old, 'new_starts_at', p_starts),
    p_created_by => p_created_by);
end;
$$;

-- ── Cancelar una sesión ────────────────────────────────────────────────────
-- Cambio de estado, NO delete: el GiST ya ignora las canceladas (su WHERE es
-- status in ('held','confirmed')), así que la hora se libera igual, y además
-- queda el rastro en booking_events. Un DELETE no deja nada.
create function cancel_course_session(
  p_session    uuid,
  p_created_by uuid default null
) returns void language plpgsql set search_path = public, pg_temp as $$
declare v_res uuid; v_n int2;
begin
  select cs.reservation_id, cs.n into v_res, v_n
    from course_sessions cs where cs.id = p_session and cs.status = 'agendada';
  if v_res is null then raise exception 'curso_session_unscheduled'; end if;

  update reservations set status = 'cancelled', cancelled_at = now() where id = v_res;
  update course_sessions set status = 'cancelada' where id = p_session;

  perform log_booking_event(v_res, 'curso_session_cancelled',
    p_detail => jsonb_build_object('n', v_n), p_created_by => p_created_by);
end;
$$;
