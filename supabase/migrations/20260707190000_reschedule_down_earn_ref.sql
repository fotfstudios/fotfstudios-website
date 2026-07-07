-- Fix: reschedule_down keyed el claw-back de earn a un ref CONSTANTE.
--
-- A1 reordenó "más barato" a seat-first: RescheduleService llama reschedule_down
-- con p_refund_id = null (el refund id de MP todavía no existe al momento del
-- asiento; se reembolsa DESPUÉS). Con p_refund_id null, v_ref quedaba fijo en
-- 'manual' (y en el camino offline, en el literal constante 'offline:reschedule').
-- points_ledger tiene un unique (order_id, kind, ref): un SEGUNDO reagendamiento
-- más barato de la MISMA orden colisiona con el primer earn_revoke, apply_points
-- no inserta (on conflict do nothing) y la revocación incremental se descarta en
-- silencio — el cliente conserva puntos (plata) que ya no le corresponden.
--
-- Fix: generar el id de `reschedules` ANTES del insert final (en vez de vía
-- `returning id into`) y usarlo como ref del claw-back — único por evento de
-- reagendamiento y disponible al momento del asiento, sin depender del refund id
-- de MP. Resto de la función byte-idéntico a 20260707130000_reschedule.sql.
create or replace function reschedule_down(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb, p_refund_id text, p_refund_amount int, p_note text default null
) returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz;
  v_total int; v_prev int; v_boleta int; v_remaining int;
  v_customer uuid; v_earn_net int; v_revoke int; v_ref text; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  select amount_clp, refunded_amount_clp into v_total, v_prev
    from orders where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0;
  if v_total is null then raise exception 'reschedule_not_eligible'; end if;

  v_boleta := v_total - v_prev;                         -- boleta viva (antes)
  if p_refund_amount < 1 or p_refund_amount > v_boleta then raise exception 'reschedule_bad_delta'; end if;
  v_remaining := v_boleta - p_refund_amount;            -- = nuevo total

  v_resched := gen_random_uuid();

  -- Mover el rango (GiST aborta si se traslapa).
  update reservations set starts_at = p_starts, ends_at = p_ends where id = p_reservation;

  -- Acumular el reembolso; MANTENER 'paid' + reserva 'confirmed' (a diferencia de mark_refunded).
  update orders
    set refunded_amount_clp = v_prev + p_refund_amount,
        mp_refund_id = coalesce(p_refund_id, mp_refund_id),
        pricing_snapshot = coalesce(p_snapshot, pricing_snapshot)
    where id = v_order;

  -- Reescribir líneas al nuevo quote (suman v_remaining = boleta viva nueva).
  delete from order_lines where order_id = v_order;
  insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
    select v_order, l.line_type, case when l.line_type = 'room_time' then p_reservation end,
           l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
    from jsonb_to_recordset(p_lines)
      as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);

  -- Truing de earn (mismo cálculo que mark_refunded; sin redeem_restore: puntos bloqueados en v1).
  select c.id into v_customer
    from orders o left join customers c on c.email = lower(o.customer_email) where o.id = v_order;
  if v_customer is not null then
    v_ref := 'reschedule:' || v_resched;
    select coalesce(sum(amount), 0) into v_earn_net from points_ledger
      where order_id = v_order and kind in ('earn', 'earn_revoke');
    v_revoke := greatest(0, v_earn_net - floor(0.05 * v_remaining)::int);
    if v_revoke > 0 then perform apply_points(v_customer, v_order, 'earn_revoke', -v_revoke, v_ref); end if;
  end if;

  -- SII: NC por la boleta viva anterior + nueva boleta por el saldo retenido (= nuevo total).
  perform create_nota_credito_amount(v_order, v_boleta);
  if v_remaining > 0 then perform create_boleta_amount(v_order, v_remaining); end if;

  if p_note is not null and p_note <> '' then
    update reservations set notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || p_note) where id = p_reservation;
  end if;

  insert into reschedules (id, reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp, new_snapshot, new_lines, applied_at)
    values (v_resched, p_reservation, v_order, 'refund', 'applied',
      v_old_start, v_old_end, p_starts, p_ends, v_boleta, v_remaining, p_refund_amount, p_snapshot, p_lines, now());
  return v_resched;
end;
$$;
