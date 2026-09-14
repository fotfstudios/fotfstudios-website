-- Auditoría 2026-09-13 (H1/H3): la expiración de holds era perezosa — solo corría dentro de
-- create_checkout/create_hold — y ninguna lectura miraba expires_at, así que un checkout
-- abandonado bloqueaba su horario hasta que OTRA persona reservara en la sala, y los puntos
-- canjeados quedaban retenidos hasta el barrido diario de 72 h.

-- 1. Un solo redeem_release por orden, garantizado por la base. El candado de apply_points es
--    (order_id, kind, ref) y los llamadores usan refs distintos ('' en cancel_*, 'abandoned' en
--    el barrido, y ahora 'hold_expired'): dos liberadores concurrentes o consecutivos podían
--    reponer dos veces. Índice parcial: los inserts concurrentes se serializan sobre él y el
--    `on conflict do nothing` de apply_points deja el segundo como no-op (devuelve false).
--    NO se bloquea la fila de orders aquí a propósito: confirm_payment bloquea orders → reservations
--    y el barrido reservations → orders; un lock explícito sería un deadlock webhook-vs-vencimiento.
do $$
declare v_dups text;
begin
  select string_agg(order_id::text, ', ') into v_dups
    from (select order_id from points_ledger where kind = 'redeem_release'
          group by order_id having count(*) > 1) d;
  if v_dups is not null then
    raise exception 'points_ledger tiene más de un redeem_release en: % — reconciliar antes de migrar', v_dups;
  end if;
end $$;
create unique index points_ledger_release_once
  on points_ledger (order_id) where kind = 'redeem_release';

-- 2. release_order_redemption: además, guarda por KIND (camino rápido sin tocar el índice).
create or replace function release_order_redemption(p_order uuid, p_ref text default '')
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_customer uuid;
  v_points   int;
begin
  if exists (select 1 from points_ledger where order_id = p_order and kind = 'redeem_release') then
    return;
  end if;
  select customer_id into v_customer
    from points_ledger where order_id = p_order and kind = 'redeem' limit 1;
  if v_customer is null then return; end if;
  select points_redeemed_clp into v_points from orders where id = p_order;
  if v_points > 0 then
    perform apply_points(v_customer, p_order, 'redeem_release', v_points, p_ref);
  end if;
end;
$$;

-- 3. expire_stale_holds: además de expirar, repone los puntos canjeados de cada orden cuyo
--    hold venció. La orden sigue pending_payment: un pago tardío se auto-repara en
--    confirm_payment (re-canje 'late:<pago>'). Misma firma y tipo de retorno → create or
--    replace vale y database.types no cambia. search_path inline (create or replace pisa el
--    `alter function … set search_path` de 20260626121614).
-- Nota: la liberación de puntos se ejecuta también en el barrido inline de create_checkout, así que
-- ese checkout toca filas de customers ajenas (points_balance) — con una sala es un punto de
-- serialización más; el único ciclo construible (mismo cliente re-reservando un slot solapado en la
-- ventana de ms) lo absorbe retryOnDeadlock.
create or replace function expire_stale_holds(p_resource uuid default null)
returns integer language plpgsql
set search_path = public, pg_temp as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    update reservations
      set status = 'expired'
      where status = 'held'
        and expires_at < now()
        and (p_resource is null or resource_id = p_resource)
      returning order_id
  loop
    n := n + 1;
    if r.order_id is not null then
      perform release_order_redemption(r.order_id, 'hold_expired');
    end if;
  end loop;
  return n;
end;
$$;

-- 4. Barrido cada minuto en la base. SQL puro: no necesita pg_net ni secretos en Vault
--    (a diferencia del job de PINs). Con nombre, cron.schedule es idempotente. El historial
--    de corridas crece 1.440 filas/día → purga semanal.
create extension if not exists pg_cron;
select cron.schedule('expire-holds', '* * * * *', 'select public.expire_stale_holds()');
select cron.schedule(
  'purge-cron-history', '0 3 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
