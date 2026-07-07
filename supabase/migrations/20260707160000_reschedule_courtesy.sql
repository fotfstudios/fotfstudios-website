-- Reagendamiento de CORTESÍAS (reservas sin orden): movimiento puro de calendario.
-- Sin plata, sin MP, sin boleta — solo cambia el rango (el GiST anti-solape es la
-- red) y queda el evento en `reschedules` para la línea de tiempo del admin.
-- Las reservas CON orden siguen yendo por reschedule_move/down/charge.

-- La auditoría ahora admite movimientos sin orden.
alter table reschedules alter column original_order_id drop not null;

create function reschedule_courtesy(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz, p_note text default null
) returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare
  v_old_start timestamptz; v_old_end timestamptz; v_resched uuid;
begin
  select r.starts_at, r.ends_at into v_old_start, v_old_end
    from reservations r
    where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking' and r.order_id is null;
  if v_old_start is null then raise exception 'reschedule_not_active'; end if;

  -- Mover el rango: el GiST aborta la tx si se traslapa con otra reserva activa.
  update reservations set starts_at = p_starts, ends_at = p_ends where id = p_reservation;

  if p_note is not null and p_note <> '' then
    update reservations set notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || p_note) where id = p_reservation;
  end if;

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp, applied_at)
    values (p_reservation, null, 'equal', 'applied', v_old_start, v_old_end, p_starts, p_ends, 0, 0, 0, now())
    returning id into v_resched;
  return v_resched;
end;
$$;
