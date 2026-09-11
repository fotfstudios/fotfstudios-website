-- El retro deja de premiar los pedidos delta de un reagendamiento.
--
-- BUG: `award_retro_points` recorre TODO pedido del email en estado
-- paid|fulfilled|refunded y otorga 5% si no ve una fila (pedido,'earn',''). Un
-- pedido delta queda `fulfilled` con el mismo email, pero su earn se asentó en el
-- pedido ORIGINAL con ref 'reschedule:{id}' — el delta no tiene fila propia. El
-- barrido lo lee como "pagado y nunca premiado" y acuña un 5% extra.
--
-- Importa porque `ensureCustomer` llama a esta función en CADA visita autenticada
-- (/cuenta y /reservar), así que sobre-acreditaría en cada login. Y es permanente:
-- todos los claw-back (mark_refunded, reschedule_down) apuntan al pedido
-- principal, así que nada revierte lo acuñado sobre el delta.
--
-- Se arreglan DOS agujeros de la misma familia:
--
-- 1. EXCLUIR los pedidos delta. Es la mitad que carga el peso.
--    OJO: no sirve filtrar por `orders.kind = 'reschedule_delta'`. El valor existe
--    en el CHECK desde 20260824120000_curso_dj.sql:50 y hubo un backfill único,
--    pero NINGÚN escritor lo setea — `create_reschedule_charge` omite `kind` en su
--    insert, así que cae al default 'booking'. Todo pedido delta creado desde
--    2026-08-24 tiene kind='booking'. El join contra `reschedules` es el único
--    discriminador confiable.
--
-- 2. FÓRMULA DE BRECHA en vez de "existe (pedido,'earn','')", igual que
--    assign_booking_customer (20260909120000:404-412) y apply_reschedule_charge.
--    Defensa en profundidad, no un camino alcanzable hoy: si un pedido tiene earn
--    asentado con OTRA ref (p. ej. 'reschedule:{id}') y ninguna con '', el chequeo
--    de existencia no lo ve y otorga el 5% COMPLETO encima. Medido: con el cuerpo
--    viejo, un pedido de 20.000 con un earn previo de 1.000 bajo ref
-- 'reschedule:x' recibía otros 1.000; con la brecha recibe 0.
--    No pude construir una secuencia que llegue a ese estado con los flujos de
--    HOY —desde PR3 todo pedido con email válido gana al pagar con ref ''—, así
--    que se agrega porque el ledger lo permite, no porque esté ocurriendo.
--
-- Misma firma y mismo nombre (`create or replace`): la RPC está expuesta por
-- PostgREST y sigue devolviendo el total efectivamente acuñado, que consumen el
-- `raise notice` de la migración de activación y customer-repository.ts.
create or replace function award_retro_points(p_customer uuid)
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
        -- (1) el earn de un pedido delta vive en el pedido original
        and not exists (select 1 from reschedules rs where rs.delta_order_id = o.id)
  loop
    -- (2) brecha entre el 5% del efectivo retenido y lo que el pedido YA acumuló
    select floor(0.05 * r.retained)::int
           - coalesce((select sum(amount)::int from points_ledger
                        where order_id = r.id and kind in ('earn', 'earn_revoke')), 0)
      into v_earn;
    if v_earn > 0 and apply_points(p_customer, r.id, 'earn', v_earn, '') then
      v_awarded := v_awarded + v_earn;
    end if;
  end loop;
  return v_awarded;
end;
$$;

-- El barrido corre en cada login y ahora hace un anti-join contra `reschedules`.
-- `delta_order_id` solo tenía la FK, sin índice: sin esto cada iteración del loop
-- es un seq scan de la tabla.
create index if not exists reschedules_delta_order_idx
  on reschedules (delta_order_id) where delta_order_id is not null;
