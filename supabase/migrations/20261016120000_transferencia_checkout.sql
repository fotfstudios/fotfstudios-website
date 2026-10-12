-- Transferencia bancaria como medio de pago de RESPALDO del checkout público.
--
-- Decisión del dueño (2026-10-12): es un respaldo de emergencia para cuando Mercado Pago
-- falla, no un medio permanente. Se prende y apaga desde el admin
-- (checkout_settings.transfer_enabled, apagado por defecto).
--
-- Reloj del cupo (reutiliza el barrido de cada minuto, expire_stale_holds, que libera
-- todo hold `held` con expires_at < now()):
--   · request_transfer — al elegir "Transferencia", el hold de 10 min del checkout pasa
--     a min(ahora + 2 h, inicio − 1 h). Si la sesión empieza en menos de 3 h no se
--     ofrece (no alcanza a transferir y que el dueño verifique).
--   · declare_transfer — "Ya transferí": el cupo se sostiene hasta min(ahora + 48 h,
--     inicio) mientras el dueño verifica y la marca pagada desde el admin (Cobro →
--     Transferencia, vía confirm_payment). Si nunca la confirma, el barrido la libera.
-- Un pago que llega tarde (cupo ya liberado) cae en el camino de siempre: confirm_payment
-- re-toma el horario si sigue libre, o paid_no_hold → revisión.
--
-- Fuera de alcance: los holds firmes del admin (expires_at null) y su barrido de 72 h y
-- recordatorio no cambian — estos holds siempre tienen expires_at.
--
-- Despliegue: migración SOLA (sin código que la use). Nada la lee hasta la PR de código.

-- ── 1. Interruptor del checkout (una sola fila) ─────────────────────────────
create table checkout_settings (
  id               boolean primary key default true check (id),
  transfer_enabled boolean not null default false,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null
);

comment on table checkout_settings is
  'Ajustes del checkout público editables desde el admin. Una sola fila (id = true).';
comment on column checkout_settings.transfer_enabled is
  'Ofrecer transferencia bancaria en /reservar (respaldo de emergencia si Mercado Pago falla).';

insert into checkout_settings default values;

alter table checkout_settings enable row level security;
revoke all on checkout_settings from anon, authenticated;

-- ── 2. Marcas del flujo en la orden ─────────────────────────────────────────
alter table orders
  add column transfer_requested_at timestamptz,
  add column transfer_declared_at  timestamptz;

comment on column orders.transfer_requested_at is
  'El cliente eligió pagar por transferencia en el checkout público.';
comment on column orders.transfer_declared_at is
  'El cliente avisó "Ya transferí"; el cupo espera la verificación del dueño.';

-- ── 3. Eventos de la línea de tiempo (constraint + categoría van juntos) ────
alter table booking_events drop constraint booking_events_type_check;
alter table booking_events add constraint booking_events_type_check
  check (type in ('created','payment_confirmed','courtesy_confirmed','access_sent',
    'reschedule_moved','reschedule_charge_pending','reschedule_charge_paid',
    'reschedule_refund','reschedule_failed_slot_taken','reschedule_expired','reschedule_cancelled',
    'boleta_issued','boleta_emitted','nota_credito_issued','nota_credito_emitted',
    'points_earned','points_revoked','points_restored','cancelled','refunded',
    'curso_session_scheduled','curso_session_moved','curso_session_cancelled','customer_changed',
    'duplicate_payment','transfer_requested','transfer_declared'));

create or replace function booking_event_category(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_type in ('created', 'courtesy_confirmed', 'reschedule_moved', 'cancelled',
                    'curso_session_scheduled', 'curso_session_moved',
                    'curso_session_cancelled', 'customer_changed') then 'Reservas'
    when p_type in ('payment_confirmed', 'reschedule_charge_pending', 'reschedule_charge_paid',
                    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
                    'reschedule_cancelled', 'refunded', 'duplicate_payment',
                    'transfer_requested', 'transfer_declared') then 'Pagos'
    when p_type in ('points_earned', 'points_revoked', 'points_restored') then 'Puntos'
    when p_type in ('boleta_issued', 'boleta_emitted', 'nota_credito_issued',
                    'nota_credito_emitted') then 'Documentos tributarios'
    when p_type = 'access_sent' then 'Notificaciones'
  end
$$;

-- ── 4. request_transfer: el cliente elige transferencia ─────────────────────
-- Devuelve: ok | disabled | not_found | not_pending | no_hold | too_late.
-- Idempotente: una segunda llamada sobre una orden ya en transferencia devuelve ok sin
-- volver a estirar el plazo. Orden de locks orders → reservations, igual que
-- confirm_payment (el barrido va al revés pero sin lock explícito de orders).
create function request_transfer(
  p_order     uuid,
  p_window    interval default interval '2 hours',
  p_lead      interval default interval '1 hour',
  p_min_lead  interval default interval '3 hours'
) returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_order    orders%rowtype;
  v_res      reservations%rowtype;
  v_deadline timestamptz;
begin
  if not coalesce((select transfer_enabled from checkout_settings where id), false) then
    return 'disabled';
  end if;

  select * into v_order from orders where id = p_order for update;
  if not found then return 'not_found'; end if;
  if v_order.status <> 'pending_payment' then return 'not_pending'; end if;

  select * into v_res from reservations
    where order_id = p_order and status = 'held' and expires_at > now()
    for update;
  if not found then return 'no_hold'; end if;

  if v_order.transfer_requested_at is not null then return 'ok'; end if;
  if v_res.starts_at - now() < p_min_lead then return 'too_late'; end if;

  v_deadline := least(now() + p_window, v_res.starts_at - p_lead);
  update reservations set expires_at = v_deadline where id = v_res.id;
  update orders set transfer_requested_at = now() where id = p_order;

  perform log_booking_event(v_res.id, 'transfer_requested', p_order,
    p_amount => v_order.amount_clp,
    p_detail => jsonb_build_object('pay_by', v_deadline));
  return 'ok';
end;
$$;

-- ── 5. declare_transfer: "Ya transferí" ─────────────────────────────────────
-- Devuelve: ok | already | not_found | not_transfer | not_pending | expired.
create function declare_transfer(
  p_order uuid,
  p_grace interval default interval '48 hours'
) returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_order    orders%rowtype;
  v_res      reservations%rowtype;
  v_deadline timestamptz;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then return 'not_found'; end if;
  if v_order.transfer_requested_at is null then return 'not_transfer'; end if;
  if v_order.status <> 'pending_payment' then return 'not_pending'; end if;
  if v_order.transfer_declared_at is not null then return 'already'; end if;

  select * into v_res from reservations
    where order_id = p_order and status = 'held' and expires_at > now()
    for update;
  if not found then return 'expired'; end if;

  v_deadline := least(now() + p_grace, v_res.starts_at);
  update reservations set expires_at = v_deadline where id = v_res.id;
  update orders set transfer_declared_at = now() where id = p_order;

  perform log_booking_event(v_res.id, 'transfer_declared', p_order,
    p_amount => v_order.amount_clp,
    p_detail => jsonb_build_object('hold_until', v_deadline));
  return 'ok';
end;
$$;

revoke execute on function request_transfer(uuid, interval, interval, interval) from public, anon, authenticated;
revoke execute on function declare_transfer(uuid, interval) from public, anon, authenticated;
grant execute on function request_transfer(uuid, interval, interval, interval) to service_role;
grant execute on function declare_transfer(uuid, interval) to service_role;
