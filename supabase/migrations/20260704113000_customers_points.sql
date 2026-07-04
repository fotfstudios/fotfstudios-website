-- Clientes + puntos canjeables (Puntos FOTF).
--
-- Modelo: 1 punto = $1 CLP; se gana el 5% del EFECTIVO pagado (floor). El canje
-- entra al checkout como línea 'discount' + orders.points_redeemed_clp, de modo
-- que orders.amount_clp SIGUE siendo "efectivo cobrado" (lo que cobra MP, lo que
-- cubre la boleta, lo que suman las líneas). Una orden 100% puntos se confirma
-- sin MP (mp_payment_id = 'offline:puntos') y sin boleta ($0 → ninguna).
--
-- Contabilidad: points_ledger es la fuente de verdad (auditable); el saldo vive
-- materializado en customers.points_balance porque el canje necesita igual un
-- row lock (check-then-deduct atómico) y así el saldo es gratis de leer. Sin
-- check >= 0: el claw-back de reembolsos puede dejar deuda (puntos ya gastados);
-- el canje sí exige saldo suficiente. Idempotencia de TODA mutación:
-- unique (order_id, kind, ref) + apply_points (inserta o no hace nada).

-- ── Tablas ──────────────────────────────────────────────────────────────────

create table customers (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text unique not null,          -- siempre minúsculas (como admin_members)
  name           text,
  phone          text,
  points_balance int not null default 0,        -- materializado; deuda permitida
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create type points_entry_kind as enum
  ('earn', 'earn_revoke', 'redeem', 'redeem_release', 'redeem_restore', 'adjust');

create table points_ledger (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  order_id    uuid references orders (id) on delete set null,
  kind        points_entry_kind not null,
  amount      int not null,                     -- con signo
  ref         text not null default '',         -- refund id / 'late:{payment}' / motivo
  created_at  timestamptz not null default now(),
  constraint points_ledger_sign check (
       (kind in ('earn', 'redeem_release', 'redeem_restore') and amount > 0)
    or (kind in ('earn_revoke', 'redeem') and amount < 0)
    or (kind = 'adjust' and amount <> 0)
  )
);

-- earn/redeem/release una vez por orden (ref=''); revoke/restore una vez por
-- reembolso (ref = refund id); re-canje tardío una vez por pago (ref = 'late:…').
create unique index points_ledger_once on points_ledger (order_id, kind, ref)
  where order_id is not null;
create index points_ledger_customer_idx on points_ledger (customer_id, created_at desc);

alter table orders add column points_redeemed_clp int not null default 0;

-- RLS: solo servidor (service-role), como el resto de las tablas de negocio.
alter table customers enable row level security;
alter table points_ledger enable row level security;
grant all privileges on customers to service_role;
grant all privileges on points_ledger to service_role;

-- ── Escritor único ──────────────────────────────────────────────────────────

-- Toda mutación de puntos pasa por aquí: inserta al ledger (o no hace nada si el
-- movimiento ya existe) y solo si insertó toca el saldo. Devuelve si insertó.
create function apply_points(
  p_customer uuid, p_order uuid, p_kind points_entry_kind, p_amount int, p_ref text default ''
) returns boolean language plpgsql
set search_path = public, pg_temp as $$
begin
  insert into points_ledger (customer_id, order_id, kind, amount, ref)
    values (p_customer, p_order, p_kind, p_amount, p_ref)
    on conflict do nothing;
  if not found then return false; end if;
  update customers set points_balance = points_balance + p_amount, updated_at = now()
    where id = p_customer;
  return true;
end;
$$;

-- ── Checkout con canje (+ confirmación atómica de órdenes $0) ───────────────

-- Firma nueva (p_customer_id, p_points): drop + create — un create or replace con
-- parámetros default extra dejaría dos overloads y PostgREST no sabría cuál llamar.
drop function create_checkout(uuid, timestamptz, timestamptz, int, int, int, text, jsonb, jsonb, jsonb, interval);
create function create_checkout(
  p_resource    uuid,
  p_starts      timestamptz,
  p_ends        timestamptz,
  p_amount      int,
  p_net         int,
  p_tax         int,
  p_currency    text,
  p_customer    jsonb,
  p_snapshot    jsonb,
  p_lines       jsonb,
  p_ttl         interval default interval '10 minutes',
  p_customer_id uuid default null,
  p_points      int default 0
)
returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare
  v_res     uuid;
  v_order   uuid;
  v_line    jsonb;
  v_balance int;
begin
  perform expire_stale_holds(p_resource);

  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at,
                            customer_name, customer_email, customer_phone)
    values (p_resource, 'booking', 'held', p_starts, p_ends, now() + p_ttl,
            p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone')
    returning id into v_res;

  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot)
    values ('pending_payment', p_currency, p_amount, p_net, p_tax,
            p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone', p_snapshot)
    returning id into v_order;

  update reservations set order_id = v_order where id = v_res;

  -- Canje: el FOR UPDATE serializa "verificar saldo y descontar" — si dos
  -- checkouts compiten por el mismo saldo, el perdedor aborta y su transacción
  -- completa (hold + orden + líneas) se revierte.
  if p_points > 0 then
    select points_balance into v_balance from customers where id = p_customer_id for update;
    if v_balance is null then raise exception 'points_without_customer'; end if;
    if v_balance < p_points then raise exception 'insufficient_points'; end if;
    perform apply_points(p_customer_id, v_order, 'redeem', -p_points, '');
    update orders set points_redeemed_clp = p_points where id = v_order;
  end if;

  for v_line in select jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, line_type, reservation_id, addon_key, description,
                             quantity, unit_price_clp, subtotal_clp)
      values (v_order,
              v_line ->> 'line_type',
              case when v_line ->> 'line_type' = 'room_time' then v_res else null end,
              v_line ->> 'addon_key',
              v_line ->> 'description',
              coalesce((v_line ->> 'quantity')::int, 1),
              (v_line ->> 'unit_price_clp')::int,
              (v_line ->> 'subtotal_clp')::int);
  end loop;

  -- Orden 100% puntos: confirmar aquí mismo evita la ventana "creada pero no
  -- confirmada" de un round-trip extra. El prefijo 'offline:' ya significa
  -- "no es un pago real de MP" para RefundService y analytics.
  if p_points > 0 and p_amount = 0 then
    perform confirm_payment(v_order, 'offline:puntos');
  end if;

  return v_order;
end;
$$;

-- ── confirm_payment: earn + reparación de canje tardío + guardia de boleta ──

create or replace function confirm_payment(p_order uuid, p_payment_id text)
returns text language plpgsql
set search_path = public, pg_temp as $$
declare
  v_held     int;
  v_customer uuid;
  v_amount   int;
  v_points   int;
  v_earn     int;
begin
  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_order and status <> 'paid';

  update reservations set status = 'confirmed', expires_at = null
    where order_id = p_order and status = 'held';
  get diagnostics v_held = row_count;

  update payment_intents set payment_id = p_payment_id, status = 'approved'
    where order_id = p_order;

  -- Puntos (si el email tiene perfil; un invitado los gana después vía retro).
  select c.id, o.amount_clp, o.points_redeemed_clp into v_customer, v_amount, v_points
    from orders o left join customers c on c.email = lower(o.customer_email)
    where o.id = p_order;

  if v_customer is not null then
    -- Pago tardío: el sweep ya liberó el canje → re-aplicarlo (el saldo puede
    -- quedar negativo; deuda que se descuenta de earns futuros).
    if v_points > 0 and exists (
      select 1 from points_ledger where order_id = p_order and kind = 'redeem_release'
    ) then
      perform apply_points(v_customer, p_order, 'redeem', -v_points, 'late:' || p_payment_id);
    end if;

    -- Earn: 5% del efectivo. Orden $0 (pagada con puntos) → floor(0) → nada.
    -- También en paid_no_hold: rastrea efectivo retenido; si el dueño reembolsa,
    -- el claw-back lo neutraliza.
    v_earn := floor(0.05 * v_amount)::int;
    if v_earn > 0 then
      perform apply_points(v_customer, p_order, 'earn', v_earn, '');
    end if;
  end if;

  if v_held > 0 then
    -- Boleta solo si hubo efectivo: una orden 100% puntos no factura ($0).
    insert into tax_documents (order_id, kind, neto, iva, total)
      select o.id, 'boleta', o.net_clp, o.tax_clp, o.amount_clp from orders o
      where o.id = p_order
        and o.amount_clp > 0
        and not exists (select 1 from tax_documents t where t.order_id = p_order and t.kind = 'boleta');
    return 'confirmed';
  end if;

  if exists (select 1 from reservations where order_id = p_order and status = 'confirmed') then
    return 'confirmed';
  end if;

  update orders set notified_at = now() where id = p_order and notified_at is null;
  return 'paid_no_hold';
end;
$$;

-- ── Liberación de canjes de órdenes que mueren sin pagar ────────────────────

-- Devuelve los puntos canjeados de una orden que no llegó a pagarse.
create function release_order_redemption(p_order uuid, p_ref text default '')
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_customer uuid;
  v_points   int;
begin
  select customer_id into v_customer
    from points_ledger where order_id = p_order and kind = 'redeem' limit 1;
  if v_customer is null then return; end if;

  select points_redeemed_clp into v_points from orders where id = p_order;
  if v_points > 0 then
    perform apply_points(v_customer, p_order, 'redeem_release', v_points, p_ref);
  end if;
end;
$$;

create or replace function cancel_unpaid_order(p_order uuid)
returns void language plpgsql
set search_path = public, pg_temp as $$
begin
  update reservations
    set status = 'expired'
    where order_id = p_order and status = 'held';

  update orders
    set status = 'cancelled'
    where id = p_order and status = 'pending_payment';

  perform release_order_redemption(p_order);
end;
$$;

-- cancel_booking: misma lógica + liberar el canje cuando la orden muere impaga.
drop function if exists cancel_booking(uuid, text);
create function cancel_booking(p_reservation uuid, p_refund_id text default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_order  uuid;
  v_status order_status;
begin
  select order_id into v_order from reservations where id = p_reservation;

  update reservations set status = 'cancelled', cancelled_at = now() where id = p_reservation;

  if v_order is not null then
    select status into v_status from orders where id = v_order;
    if v_status = 'paid' then
      if p_refund_id is not null then
        update orders
          set status = 'refunded', mp_refund_id = p_refund_id, refunded_at = now()
          where id = v_order;
        perform create_nota_credito(v_order);
      end if;
      -- p_refund_id nulo → cancelación sin reembolso: la orden queda 'paid'.
    else
      update orders set status = 'cancelled' where id = v_order;
      perform release_order_redemption(v_order);
    end if;
  end if;
end;
$$;

-- Sweep: hoy nada termina una orden abandonada (el webhook deja pending_payment
-- para reintentos y el reconcile nunca cancela) — sin esto, los puntos canjeados
-- en checkouts abandonados quedarían secuestrados para siempre. 72 h = ventana
-- del reconcile. Solo libera puntos; no toca el estado de la orden.
create function release_abandoned_redemptions(p_older_than interval default interval '72 hours')
returns int language plpgsql
set search_path = public, pg_temp as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select o.id from orders o
      where o.status = 'pending_payment'
        and o.points_redeemed_clp > 0
        and o.created_at < now() - p_older_than
        and not exists (select 1 from points_ledger pl
                        where pl.order_id = o.id and pl.kind = 'redeem_release')
  loop
    perform release_order_redemption(r.id, 'abandoned');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── mark_refunded: claw-back por estado objetivo (sin deriva en parciales) ───

create or replace function mark_refunded(p_order uuid, p_refund_id text default null, p_refund_amount int default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_total     int;
  v_prev      int;
  v_boleta    int;   -- boleta vigente = total del pedido − ya reembolsado
  v_refund    int;
  v_remaining int;
  v_customer  uuid;
  v_points    int;
  v_ref       text;
  v_earn_net  int;
  v_revoke    int;
  v_restored  int;
  v_restore   int;
begin
  select amount_clp, refunded_amount_clp into v_total, v_prev
    from orders where id = p_order and status in ('paid', 'refunded');
  if v_total is null then return; end if;               -- orden no pagada → ignora

  v_boleta := v_total - v_prev;
  if v_boleta <= 0 then return; end if;                 -- sin saldo vivo (incluye órdenes $0
                                                        -- pagadas con puntos → refund_points_order)
  v_refund := least(coalesce(p_refund_amount, v_boleta), v_boleta);
  v_remaining := v_boleta - v_refund;

  update reservations set status = 'cancelled', cancelled_at = now()
    where order_id = p_order and status in ('held', 'confirmed');

  update orders
    set status = 'refunded',
        mp_refund_id = coalesce(p_refund_id, mp_refund_id),
        refunded_at = now(),
        refunded_amount_clp = v_prev + v_refund
    where id = p_order;

  -- Puntos: truing hacia el objetivo calculado del R acumulado. Cada reembolso
  -- parcial converge sin acumular error de redondeo; el total revoca todo el
  -- earn y repone exactamente lo canjeado.
  select c.id, o.points_redeemed_clp into v_customer, v_points
    from orders o left join customers c on c.email = lower(o.customer_email)
    where o.id = p_order;

  if v_customer is not null then
    v_ref := coalesce(p_refund_id, 'manual');

    select coalesce(sum(amount), 0) into v_earn_net from points_ledger
      where order_id = p_order and kind in ('earn', 'earn_revoke');
    v_revoke := greatest(0, v_earn_net - floor(0.05 * (v_total - v_prev - v_refund))::int);
    if v_revoke > 0 then
      perform apply_points(v_customer, p_order, 'earn_revoke', -v_revoke, v_ref);
    end if;

    if v_points > 0 then
      select coalesce(sum(amount), 0) into v_restored from points_ledger
        where order_id = p_order and kind = 'redeem_restore';
      v_restore := floor(v_points::numeric * (v_prev + v_refund) / v_total)::int - v_restored;
      if v_restore > 0 then
        perform apply_points(v_customer, p_order, 'redeem_restore', v_restore, v_ref);
      end if;
    end if;
  end if;

  perform create_nota_credito_amount(p_order, v_boleta);  -- NC por el total de la boleta vigente
  if v_remaining > 0 then
    perform create_boleta_amount(p_order, v_remaining);   -- nueva boleta por el saldo retenido
  end if;
end;
$$;

-- ── Cancelación de órdenes 100% puntos (mark_refunded no aplica: boleta $0) ──

create function refund_points_order(p_order uuid, p_restore int, p_ref text default 'points:manual')
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_status   order_status;
  v_amount   int;
  v_points   int;
  v_customer uuid;
begin
  select status, amount_clp, points_redeemed_clp into v_status, v_amount, v_points
    from orders where id = p_order;
  if v_status is null or v_status not in ('paid', 'fulfilled') or v_amount <> 0 or v_points <= 0 then
    return;
  end if;

  update reservations set status = 'cancelled', cancelled_at = now()
    where order_id = p_order and status in ('held', 'confirmed');
  update orders set status = 'refunded', refunded_at = now() where id = p_order;

  -- Sin NC: nunca hubo boleta. Se repone según la política (0..P), decidida en la app.
  select customer_id into v_customer
    from points_ledger where order_id = p_order and kind = 'redeem' limit 1;
  if v_customer is not null and p_restore > 0 then
    perform apply_points(v_customer, p_order, 'redeem_restore', least(p_restore, v_points), p_ref);
  end if;
end;
$$;

-- ── Retro: puntos por el historial al crear la cuenta ───────────────────────

-- Para cada orden pagada del email (incluye 'refunded': la regla es 5% del
-- efectivo RETENIDO). Comparte la clave única del earn → una orden ganada en
-- vivo jamás se re-otorga, y correr esto N veces es inocuo.
create function award_retro_points(p_customer uuid)
returns int language plpgsql
set search_path = public, pg_temp as $$
declare
  v_awarded int := 0;
  v_earn    int;
  r record;
begin
  for r in
    select o.id, o.amount_clp - o.refunded_amount_clp as retained
      from orders o
      join customers c on c.id = p_customer
      where lower(o.customer_email) = c.email
        and o.status in ('paid', 'fulfilled', 'refunded')
  loop
    v_earn := floor(0.05 * r.retained)::int;
    if v_earn > 0 and apply_points(p_customer, r.id, 'earn', v_earn, '') then
      v_awarded := v_awarded + v_earn;
    end if;
  end loop;
  return v_awarded;
end;
$$;
