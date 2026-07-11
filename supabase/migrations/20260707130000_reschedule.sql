-- Reagendamiento (admin): mover una reserva PAGADA a otro horario, con manejo del
-- delta de precio. Esta migración cubre los caminos SÍNCRONOS (3a):
--   • reschedule_move  — mismo precio: solo mueve el rango.
--   • reschedule_down  — nuevo más barato: reembolso del delta en MP (hecho en la
--                        capa app ANTES), y acá el asiento contable.
-- El caso "más caro" (charge, cobro diferido) llega en la migración de 3b.
--
-- Invariante de money-safety: a diferencia de mark_refunded, estas RPC NO cancelan
-- la reserva ni marcan la orden 'refunded' — el booking sigue VIVO, solo cambia de
-- horario. reschedule_down es exactamente mark_refunded MENOS sus dos líneas que
-- cancelan (reserva → 'cancelled', orden → 'refunded'); reutiliza el mismo asiento
-- SII (NC por la boleta vieja + boleta nueva por el saldo) y el mismo truing de puntos.
--
-- La constraint GiST reservations_no_overlap es la red anti-doble-reserva: un UPDATE
-- del rango aborta toda la transacción (23P01) si se traslapa con otra reserva activa;
-- como compara filas DISTINTAS, mover la propia reserva nunca choca consigo misma.
--
-- Corte v1: orden 'paid', reserva 'confirmed', points_redeemed_clp = 0. Los casos con
-- puntos se bloquean en la capa app (combinatoria contable no vale el riesgo en v1).

-- ── Tabla de coordinación / auditoría ───────────────────────────────────────
-- En 3a solo la usan los caminos síncronos (status 'applied'). El caso charge (3b)
-- usa el ciclo pending_charge → applied.
create table reschedules (
  id                uuid primary key default gen_random_uuid(),
  reservation_id    uuid not null references reservations (id) on delete cascade,
  original_order_id uuid not null references orders (id) on delete cascade,
  delta_order_id    uuid references orders (id) on delete set null,     -- solo caso charge (3b)
  kind              text not null check (kind in ('equal', 'refund', 'charge')),
  status            text not null default 'applied'
                      check (status in ('pending_charge', 'applied', 'failed_slot_taken', 'expired', 'cancelled')),
  old_starts_at     timestamptz not null,
  old_ends_at       timestamptz not null,
  new_starts_at     timestamptz not null,
  new_ends_at       timestamptz not null,
  old_live_clp      int not null,
  new_total_clp     int not null,
  delta_clp         int not null default 0,        -- magnitud; el signo lo implica `kind`
  new_snapshot      jsonb,
  new_lines         jsonb,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  applied_at        timestamptz
);

alter table reschedules enable row level security;   -- solo service_role (sin policies anon)
grant all privileges on reschedules to service_role;

-- ── RPC A: reschedule_move (mismo precio, sin plata) ────────────────────────
create function reschedule_move(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb, p_note text default null
) returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_live int; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  select amount_clp - refunded_amount_clp into v_live
    from orders where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0;
  if v_live is null then raise exception 'reschedule_not_eligible'; end if;

  -- Mover el rango: el GiST aborta la tx si se traslapa con otra reserva activa.
  update reservations set starts_at = p_starts, ends_at = p_ends where id = p_reservation;

  -- Reescribir líneas + snapshot; amount_clp intacto (mismo precio).
  delete from order_lines where order_id = v_order;
  insert into order_lines (order_id, line_type, reservation_id, addon_key, description, quantity, unit_price_clp, subtotal_clp)
    select v_order, l.line_type, case when l.line_type = 'room_time' then p_reservation end,
           l.addon_key, l.description, l.quantity, l.unit_price_clp, l.subtotal_clp
    from jsonb_to_recordset(p_lines)
      as l(line_type text, addon_key text, description text, quantity int, unit_price_clp int, subtotal_clp int);
  update orders set pricing_snapshot = coalesce(p_snapshot, pricing_snapshot) where id = v_order;

  if p_note is not null and p_note <> '' then
    update reservations set notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || p_note) where id = p_reservation;
  end if;

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp, new_snapshot, new_lines, applied_at)
    values (p_reservation, v_order, 'equal', 'applied',
      v_old_start, v_old_end, p_starts, p_ends, v_live, v_live, 0, p_snapshot, p_lines, now())
    returning id into v_resched;
  return v_resched;
end;
$$;

-- ── RPC B: reschedule_down (nuevo más barato → reembolso del delta) ──────────
-- El reembolso en MP lo hace la capa app ANTES (idéntico orden que RefundService);
-- acá va el asiento. Mantiene 'paid'/'confirmed' y mueve el horario.
create function reschedule_down(
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
    v_ref := coalesce(p_refund_id, 'manual');
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

  insert into reschedules (reservation_id, original_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp, new_snapshot, new_lines, applied_at)
    values (p_reservation, v_order, 'refund', 'applied',
      v_old_start, v_old_end, p_starts, p_ends, v_boleta, v_remaining, p_refund_amount, p_snapshot, p_lines, now())
    returning id into v_resched;
  return v_resched;
end;
$$;

-- ── Permiso RBAC ────────────────────────────────────────────────────────────
-- super_admin lo hereda (el hook agrega TODAS las keys); staff NO por defecto.
-- Debe mantener paridad con PERMISSIONS en src/domain/auth/permissions.ts (rbac.itest.ts).
insert into admin_permissions (key, label)
values ('reservations.reschedule', 'Reagendar reserva')
on conflict (key) do nothing;
