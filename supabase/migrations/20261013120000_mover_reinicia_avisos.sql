-- Una reserva que cambia de hora vuelve a recibir su recordatorio y su PIN para el horario
-- nuevo, venga del camino que venga.
--
-- Antes solo lo hacían los RPC nuevos (move_course_session, move_trial_reservation,
-- move_practice_reservation). Los de reagendar una reserva de sala (reschedule_move,
-- reschedule_courtesy, apply_reschedule_charge…, redefinidos en ~15 migraciones) no tocaban
-- `reminder_sent_at` ni `access_sent_at`: una reserva movida después de recibir el
-- recordatorio o el PIN no los volvía a recibir. Un trigger lo cubre en un solo lugar,
-- también para cualquier camino futuro.
--
-- El PIN: la Yale no tiene ventana horaria (un código abre hasta que se quita), así que un
-- código cargado SIGUE cargado: solo se reinicia su envío. Si ya se había QUITADO de la
-- cerradura, el ciclo vuelve a empezar: el mismo código queda "por cargar".

create function reset_session_notices_on_move() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminder_sent_at := null;
    new.access_sent_at := null;
    if new.access_removed_at is not null then
      new.access_loaded_at := null;
      new.access_removed_at := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function reset_session_notices_on_move() from public, anon, authenticated;

create trigger reservations_reset_notices_on_move
  before update of starts_at on reservations
  for each row execute function reset_session_notices_on_move();
