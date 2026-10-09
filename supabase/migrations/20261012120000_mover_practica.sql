-- Mover una hora de práctica libre del curso a otro día u hora, desde el admin.
-- Hasta acá solo se podía cancelar (devuelve la hora al saldo) y volver a agendar.
--
-- Solo cambia el horario: la duración es la de la reserva (el fin se calcula, no viaja) y
-- la redención sigue siendo la misma, así que el saldo de horas no se toca. Sin plata:
-- deja el mismo rastro que un reagendamiento de cortesía (fila 'equal' en `reschedules`
-- SIN pedido + evento 'reschedule_moved').
--
-- El PIN: la Yale no tiene ventana horaria (un código abre hasta que se quita) y "Por
-- quitar" sale de `ends_at`, así que el código y `access_loaded_at` se conservan — no hay
-- que tocar la cerradura. Se reinician `access_sent_at` y `reminder_sent_at`: el
-- recordatorio y el PIN vuelven a salir antes del horario nuevo. La excepción es un código
-- que ya se quitó de la cerradura: vuelve a "por cargar".

create function move_practice_reservation(
  p_reservation uuid,
  p_starts      timestamptz,
  p_created_by  uuid default null
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  r          reservations%rowtype;
  v_enroll   uuid;
  v_status   text;
  v_valid    date;
  v_ends     timestamptz;
  v_resched  uuid;
begin
  select p.enrollment_id into v_enroll
    from course_practice_redemptions p
   where p.reservation_id = p_reservation and p.released_at is null
   for update;
  select * into r from reservations where id = p_reservation for update;
  if v_enroll is null or r.id is null or r.status <> 'confirmed' then
    raise exception 'practica_no_movible';
  end if;

  select e.status, course_practice_valid_until(e.generation_id) into v_status, v_valid
    from course_enrollments e where e.id = v_enroll;
  if v_status is distinct from 'pagada' then raise exception 'practica_no_elegible'; end if;
  if p_starts <= now() then raise exception 'practica_en_pasado'; end if;
  if p_starts = r.starts_at then raise exception 'practica_mismo_horario'; end if;
  -- Misma regla que redeem_practice_hours al agendar.
  if v_valid is not null and p_starts::date > v_valid then raise exception 'practica_vencida'; end if;

  v_ends := p_starts + (r.ends_at - r.starts_at);
  begin
    -- Si el código ya se QUITÓ de la cerradura (la hora vieja pasó: el alumno no vino), el
    -- ciclo vuelve a empezar: el mismo código queda "por cargar" y el envío espera a que se cargue.
    update reservations
       set starts_at = p_starts, ends_at = v_ends, reminder_sent_at = null, access_sent_at = null,
           access_loaded_at = case when access_removed_at is null then access_loaded_at end,
           access_removed_at = null
     where id = p_reservation;
  exception when exclusion_violation then
    raise exception 'practica_slot_taken';
  end;

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp,
      created_by, applied_at)
    values (p_reservation, null, 'equal', 'applied', r.starts_at, r.ends_at, p_starts, v_ends, 0, 0, 0,
      p_created_by, now())
    returning id into v_resched;

  perform log_booking_event(p_reservation, 'reschedule_moved', p_reschedule => v_resched,
    p_detail => jsonb_build_object('old_starts_at', r.starts_at, 'new_starts_at', p_starts),
    p_created_by => p_created_by);

  return jsonb_build_object(
    'old_starts_at', r.starts_at,
    'old_ends_at', r.ends_at,
    'ends_at', v_ends,
    'enrollment_id', v_enroll,
    'access_loaded', r.access_code is not null and r.access_loaded_at is not null and r.access_removed_at is null);
end;
$$;
revoke all on function move_practice_reservation(uuid, timestamptz, uuid) from public, anon, authenticated;
