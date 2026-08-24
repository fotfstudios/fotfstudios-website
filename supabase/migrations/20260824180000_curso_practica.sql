-- Las 4 horas de práctica libre del curso, como SALDO redimible.
--
-- POR QUÉ NO SE PRE-BLOQUEAN. Seis cupos × 4 h son 24 h de la ÚNICA sala. La
-- semana tiene 93 h de apertura, así que pre-bloquearlas congela ~26% del
-- inventario para horas que nadie eligió todavía — y como el EXCLUDE gist no
-- distingue quién ocupa, esas horas tampoco se le podrían vender a un cliente que
-- sí paga. Encima, quien nunca redime deja ese bloqueo muerto. El saldo se
-- materializa como reserva recién al redimirse.
--
-- POR QUÉ NO SON PUNTOS. El ledger de puntos es equivalente a EFECTIVO (1 pt =
-- $1, se gana 5% de lo pagado). Convertir un beneficio del curso en puntos lo
-- volvería gastable en cualquier cosa y ensuciaría el truing de earn/clawback,
-- que asume que todo punto nace de plata. Esto es una entitlement, no dinero.
--
-- VIGENCIA: `practice_valid_until` queda NULL por defecto = sin vencimiento.
-- /terminos hoy NO publica ninguna ventana para estas horas, y no corresponde
-- inventarle una al alumno desde el código. Ponerle fecha exige editar /terminos
-- y subir TERMS_VERSION.

alter table course_generations
  add column practice_hours_per_seat int2 not null default 4 check (practice_hours_per_seat between 0 and 12),
  add column practice_valid_until date;

alter table course_enrollments
  add column practice_hours_total int2 not null default 4 check (practice_hours_total between 0 and 12),
  add column practice_hours_redeemed int2 not null default 0,
  add constraint course_enrollments_practice_bounds
    check (practice_hours_redeemed between 0 and practice_hours_total);

-- Cada redención apunta a la reserva que la materializó: sin esto, "devolver la
-- hora" al cancelar sería adivinar cuál reserva correspondía a cuál saldo.
create table course_practice_redemptions (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references course_enrollments (id) on delete cascade,
  reservation_id uuid not null unique references reservations (id) on delete cascade,
  hours          int2 not null check (hours between 1 and 12),
  released_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index course_practice_enrollment_idx on course_practice_redemptions (enrollment_id, created_at desc);

alter table course_practice_redemptions enable row level security;   -- sin policies: solo service-role
grant all privileges on course_practice_redemptions to service_role;

-- ── Redimir: reserva + descuento del saldo, en UNA transacción ─────────────
-- Nunca en dos pasos. Si fueran dos, un fallo entre medio dejaría una hora
-- reservada sin descontar (regalada) o un saldo descontado sin reserva (robada).
create function redeem_practice_hours(
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

  -- FOR UPDATE serializa "ver saldo y descontarlo", igual que el canje de puntos.
  select e.practice_hours_total, e.practice_hours_redeemed, g.resource_id, g.practice_valid_until,
         e.student_name, e.student_email, e.student_phone
    into v_total, v_used, v_resource, v_valid, v_name, v_email, v_phone
    from course_enrollments e join course_generations g on g.id = e.generation_id
   where e.id = p_enrollment and e.status = 'pagada'
   for update of e;
  -- Solo una inscripción PAGADA tiene horas: el beneficio viene con el curso.
  if v_total is null then raise exception 'practica_no_elegible'; end if;
  if v_used + p_hours > v_total then raise exception 'practica_sin_saldo'; end if;
  if v_valid is not null and p_starts::date > v_valid then raise exception 'practica_vencida'; end if;

  -- kind='booking' a propósito: una hora de práctica redimida ES un alumno en la
  -- cabina, igual que una cortesía. Cuenta en ocupación; sin orden no hay boleta.
  insert into reservations (resource_id, kind, status, starts_at, ends_at,
                            customer_name, customer_email, customer_phone, notes)
    values (v_resource, 'booking', 'confirmed', p_starts, p_ends,
            v_name, v_email, v_phone, 'Práctica libre — curso DJ')
    returning id into v_res;   -- el EXCLUDE aborta todo si el horario está tomado

  insert into course_practice_redemptions (enrollment_id, reservation_id, hours)
    values (p_enrollment, v_res, p_hours);

  update course_enrollments set practice_hours_redeemed = v_used + p_hours
    where id = p_enrollment;

  perform log_booking_event(v_res, 'courtesy_confirmed');
  return v_res;
end;
$$;

-- ── Liberar: cancelar la reserva y devolver la hora al saldo ───────────────
-- Idempotente por `released_at`: cancelar dos veces no regala horas.
create function release_practice_hours(p_reservation uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_enrollment uuid; v_hours int2;
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
