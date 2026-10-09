-- Mover la sesión de prueba del curso (kind 'prueba') a otra hora desde el admin.
-- Los RPC de reagendar son de 'booking' (precio, deltas, boletas); la prueba dura siempre
-- 1 h y su precio no cambia, así que moverla es solo cambiar la hora — sin plata, sin la
-- política de 12 h (el dueño la mueve, como una cortesía).
--
-- Deja el mismo rastro que un reagendamiento de cortesía: una fila 'equal' en
-- `reschedules` SIN pedido (queda fuera de todo camino de cobro o reembolso, que se
-- guían por original_order_id) y el evento 'reschedule_moved', así la línea de tiempo
-- muestra "Reagendada" y la hora original. El crédito de la prueba vence 7 días después
-- de la sesión: se recalcula con la hora nueva.

create function move_trial_reservation(
  p_reservation uuid,
  p_starts      timestamptz,
  p_ends        timestamptz,
  p_created_by  uuid default null
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  r         reservations%rowtype;
  v_resched uuid;
begin
  select * into r from reservations where id = p_reservation for update;
  if r.id is null or r.kind <> 'prueba' or r.status not in ('held', 'confirmed') then
    raise exception 'trial_not_movable';
  end if;
  if p_ends - p_starts <> interval '1 hour' then raise exception 'trial_bad_range'; end if;
  if p_starts <= now() then raise exception 'trial_in_past'; end if;
  if p_starts = r.starts_at then raise exception 'trial_same_slot'; end if;

  begin
    -- Hora nueva → recordatorio nuevo (igual que move_course_session).
    update reservations set starts_at = p_starts, ends_at = p_ends, reminder_sent_at = null
      where id = p_reservation;
  exception when exclusion_violation then
    raise exception 'trial_slot_taken';
  end;

  update course_credits set expires_at = p_starts + interval '7 days'
    where source_reservation_id = p_reservation and consumed_order_id is null and voided_at is null;

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp,
      created_by, applied_at)
    values (p_reservation, null, 'equal', 'applied', r.starts_at, r.ends_at, p_starts, p_ends, 0, 0, 0,
      p_created_by, now())
    returning id into v_resched;

  perform log_booking_event(p_reservation, 'reschedule_moved', p_reschedule => v_resched,
    p_detail => jsonb_build_object('old_starts_at', r.starts_at, 'new_starts_at', p_starts),
    p_created_by => p_created_by);

  return jsonb_build_object('old_starts_at', r.starts_at, 'old_ends_at', r.ends_at, 'order_id', r.order_id);
end;
$$;
revoke all on function move_trial_reservation(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- Corrección puntual: la prueba de Paulina Pozo Mardones se movió a mano el 09-10-2026
-- (jueves 08-10 18:00 → viernes 09-10 16:00) antes de que existiera este RPC. Su crédito
-- quedó venciendo con la hora vieja y la línea de tiempo sin el movimiento. Id de
-- producción: en local y staging no existe y el bloque no hace nada; idempotente.
do $$
declare
  v_id      constant uuid := '2cf7d7e2-a6da-4cca-a868-647fe3967521';
  v_old_s   constant timestamptz := '2026-10-08 18:00 America/Santiago';
  r         reservations%rowtype;
  v_resched uuid;
begin
  select * into r from reservations where id = v_id and kind = 'prueba';
  if r.id is null or r.starts_at = v_old_s then return; end if;

  update course_credits set expires_at = r.starts_at + interval '7 days'
    where source_reservation_id = v_id and consumed_order_id is null and voided_at is null;

  if not exists (select 1 from reschedules where reservation_id = v_id) then
    insert into reschedules (reservation_id, original_order_id, kind, status,
        old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp, applied_at)
      values (v_id, null, 'equal', 'applied', v_old_s, v_old_s + interval '1 hour', r.starts_at, r.ends_at,
        0, 0, 0, '2026-10-09 09:10 America/Santiago')
      returning id into v_resched;
    perform log_booking_event(v_id, 'reschedule_moved', p_reschedule => v_resched,
      p_detail => jsonb_build_object('old_starts_at', v_old_s, 'new_starts_at', r.starts_at, 'via', 'sql'),
      p_occurred_at => '2026-10-09 09:10 America/Santiago');
  end if;
end $$;
