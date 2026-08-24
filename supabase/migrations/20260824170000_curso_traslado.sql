-- Traslado de cupo y reemplazante — las dos salidas SIN dinero que ofrecen los
-- términos cuando se cancela con menos de 7 días:
--
--   "puedes traspasar tu cupo a la siguiente generación del curso, o a un
--    reemplazante que tú nos indiques."
--
-- Ninguna de las dos mueve plata, así que NINGUNA emite nota de crédito ni boleta
-- nueva: el pedido, su boleta y su receptor quedan intactos. Es la diferencia de
-- fondo con el reembolso, y la razón de que no pasen por mark_refunded.

-- ── Traspasar el cupo a otra generación ────────────────────────────────────
-- El order_id VIAJA con el alumno: la plata ya pagada sigue siendo suya, solo
-- cambia de cohorte. Consecuencia buscada: si más adelante se reembolsa ese
-- pedido, mark_refunded anula la inscripción que esté viva — la nueva — que es
-- exactamente el asiento que corresponde liberar.
create function transfer_enrollment(
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

  -- Barrido inline antes de contar cupos, igual que al inscribir.
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

  -- El precio y el estado de pago viajan tal cual: el alumno no paga la
  -- diferencia si la generación nueva subió de precio. Traspasar no es recomprar.
  insert into course_enrollments (generation_id, lead_id, order_id, seat_no, plan,
      student_name, student_email, student_phone, status, price_clp, notes)
    values (p_target, v_src.lead_id, v_src.order_id, v_seat::int2, v_src.plan,
            v_src.student_name, v_src.student_email, v_src.student_phone,
            v_src.status, v_src.price_clp, v_src.notes)
    returning id into v_new;

  update course_enrollments
     set status = 'trasladada', transferred_to = v_new, cancelled_at = now()
   where id = p_enrollment;

  return v_new;
end;
$$;

-- ── Reemplazante ───────────────────────────────────────────────────────────
-- Cambia quién ASISTE, no quién pagó. La boleta ya emitida va a nombre del
-- pagador y no se toca: la plata no se movió, así que no hay hecho tributario
-- nuevo que documentar.
create function substitute_student(
  p_enrollment uuid,
  p_name       text,
  p_email      text,
  p_phone      text default null
) returns void language plpgsql set search_path = public, pg_temp as $$
declare v_status text;
begin
  select status into v_status from course_enrollments where id = p_enrollment;
  if v_status is null or v_status not in ('reservada', 'pagada') then
    raise exception 'curso_enrollment_not_active';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'curso_reemplazante_incompleto';
  end if;

  update course_enrollments
     set student_name = p_name,
         student_email = lower(p_email),
         student_phone = p_phone,
         notes = trim(both from coalesce(notes || ' · ', '') ||
                      format('Reemplaza a %s', student_name))
   where id = p_enrollment;
end;
$$;
