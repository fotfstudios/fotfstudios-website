-- Práctica libre en medias horas (mínimo 1 hora): 1, 1,5, 2, 2,5…
--
-- Hasta acá el saldo eran horas enteras (int2) y mover una práctica conservaba la duración.
-- Ahora:
--  · `course_practice_redemptions.hours` y `course_enrollments.practice_hours_redeemed`
--    pasan a numeric(3,1) con pasos de 0,5. La asignación (`practice_hours_total`,
--    `practice_hours_per_seat`) sigue en horas enteras: lo que se incluye no cambia, solo
--    cómo se gasta. Si quedan 0,5 h no alcanzan para una práctica (mínimo 1 h).
--  · `redeem_practice_hours` acepta medias horas y exige que el rango dure lo que descuenta.
--  · `move_practice_reservation` acepta una duración nueva (`p_hours`, null = la misma):
--    alargar descuenta la diferencia del saldo, acortar la devuelve. Mismo rastro que antes.
--
-- Los int2 → numeric cambian la firma de los RPC: se dropean y se recrean (si no, PostgREST
-- vería dos sobrecargas). `release_practice_hours` se recrea porque su variable era int2 y
-- redondeaba 1,5 a 2 (devolvía media hora de más).

alter table course_practice_redemptions
  alter column hours type numeric(3,1),
  drop constraint course_practice_redemptions_hours_check,
  add constraint course_practice_redemptions_hours_check
    check (hours between 1 and 12 and hours * 2 = trunc(hours * 2));

alter table course_enrollments
  alter column practice_hours_redeemed type numeric(3,1),
  add constraint course_enrollments_practice_half_hours
    check (practice_hours_redeemed * 2 = trunc(practice_hours_redeemed * 2));

-- ── Agendar ─────────────────────────────────────────────────────────────────
drop function redeem_practice_hours(uuid, timestamptz, timestamptz, int2);

create function redeem_practice_hours(
  p_enrollment uuid,
  p_starts     timestamptz,
  p_ends       timestamptz,
  p_hours      numeric
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_total int2; v_used numeric; v_resource uuid; v_valid date;
  v_name text; v_email text; v_phone text; v_res uuid; v_customer uuid;
begin
  if p_hours is null or p_hours < 1 or p_hours * 2 <> trunc(p_hours * 2) then
    raise exception 'practica_horas_invalidas';
  end if;
  if p_ends <= p_starts then raise exception 'practica_rango_invalido'; end if;
  -- El saldo se descuenta por `p_hours`: el rango tiene que durar exactamente eso.
  if p_ends - p_starts <> make_interval(mins => (p_hours * 60)::int) then
    raise exception 'practica_rango_invalido';
  end if;

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
revoke all on function redeem_practice_hours(uuid, timestamptz, timestamptz, numeric) from public, anon, authenticated;

-- ── Liberar (sin cambios de lógica: solo el tipo de la variable) ────────────
create or replace function release_practice_hours(p_reservation uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_enrollment uuid; v_hours numeric;
begin
  select enrollment_id, hours into v_enrollment, v_hours
    from course_practice_redemptions
   where reservation_id = p_reservation and released_at is null
   for update;
  if v_enrollment is null then return; end if;   -- no era práctica, o ya se liberó

  update reservations set status = 'cancelled', cancelled_at = now()
    where id = p_reservation and status in ('held', 'confirmed');
  update course_practice_redemptions set released_at = now() where reservation_id = p_reservation;
  update course_enrollments
     set practice_hours_redeemed = greatest(0, practice_hours_redeemed - v_hours)
   where id = v_enrollment;
end;
$$;

-- ── Mover (ahora también puede cambiar la duración) ─────────────────────────
drop function move_practice_reservation(uuid, timestamptz, uuid);

create function move_practice_reservation(
  p_reservation uuid,
  p_starts      timestamptz,
  p_created_by  uuid default null,
  p_hours       numeric default null
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  r          reservations%rowtype;
  v_enroll   uuid;
  v_old_h    numeric;
  v_new_h    numeric;
  v_total    int2;
  v_used     numeric;
  v_status   text;
  v_valid    date;
  v_ends     timestamptz;
  v_resched  uuid;
begin
  select p.enrollment_id, p.hours into v_enroll, v_old_h
    from course_practice_redemptions p
   where p.reservation_id = p_reservation and p.released_at is null
   for update;
  select * into r from reservations where id = p_reservation for update;
  if v_enroll is null or r.id is null or r.status <> 'confirmed' then
    raise exception 'practica_no_movible';
  end if;

  v_new_h := coalesce(p_hours, v_old_h);
  if v_new_h < 1 or v_new_h * 2 <> trunc(v_new_h * 2) then raise exception 'practica_horas_invalidas'; end if;

  select e.status, e.practice_hours_total, e.practice_hours_redeemed, course_practice_valid_until(e.generation_id)
    into v_status, v_total, v_used, v_valid
    from course_enrollments e where e.id = v_enroll
   for update;
  if v_status is distinct from 'pagada' then raise exception 'practica_no_elegible'; end if;
  if p_starts <= now() then raise exception 'practica_en_pasado'; end if;
  if p_starts = r.starts_at and v_new_h = v_old_h then raise exception 'practica_mismo_horario'; end if;
  -- Misma regla que redeem_practice_hours al agendar.
  if v_valid is not null and p_starts::date > v_valid then raise exception 'practica_vencida'; end if;
  if v_used - v_old_h + v_new_h > v_total then raise exception 'practica_sin_saldo'; end if;

  v_ends := p_starts + make_interval(mins => (v_new_h * 60)::int);
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

  if v_new_h <> v_old_h then
    update course_practice_redemptions set hours = v_new_h where reservation_id = p_reservation;
    update course_enrollments set practice_hours_redeemed = v_used - v_old_h + v_new_h where id = v_enroll;
  end if;

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp,
      created_by, applied_at)
    values (p_reservation, null, 'equal', 'applied', r.starts_at, r.ends_at, p_starts, v_ends, 0, 0, 0,
      p_created_by, now())
    returning id into v_resched;

  perform log_booking_event(p_reservation, 'reschedule_moved', p_reschedule => v_resched,
    p_detail => jsonb_build_object('old_starts_at', r.starts_at, 'new_starts_at', p_starts,
                                   'old_hours', v_old_h, 'new_hours', v_new_h),
    p_created_by => p_created_by);

  return jsonb_build_object(
    'old_starts_at', r.starts_at,
    'old_ends_at', r.ends_at,
    'ends_at', v_ends,
    'enrollment_id', v_enroll,
    'old_hours', v_old_h,
    'new_hours', v_new_h,
    'hours_left', v_total - (v_used - v_old_h + v_new_h),
    'access_loaded', r.access_code is not null and r.access_loaded_at is not null and r.access_removed_at is null);
end;
$$;
revoke all on function move_practice_reservation(uuid, timestamptz, uuid, numeric) from public, anon, authenticated;
