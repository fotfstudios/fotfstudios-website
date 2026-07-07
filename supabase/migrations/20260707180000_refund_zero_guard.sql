-- A3 (defensa en profundidad, a nivel documento): un boleta/NC de $0 nunca es válida
-- y no debe insertarse. No es el fix de raíz de ningún bug puntual — el camino
-- concreto $0-NC-vía-mark_refunded ya está cubierto por el guard `v_boleta <= 0` de
-- 20260704113000_customers_points.sql; este invariante protege a los llamadores
-- DIRECTOS de estos helpers (p. ej. apply_reschedule_charge), que no pasan por
-- mark_refunded.
create or replace function create_nota_credito_amount(p_order uuid, p_total int)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_net int;
begin
  if p_total is null or p_total <= 0 then return null; end if;  -- guard: sin documento de $0
  select round(p_total::numeric * net_clp / amount_clp)::int into v_net from orders where id = p_order;
  insert into tax_documents (order_id, kind, neto, iva, total)
    values (p_order, 'nota_credito', v_net, p_total - v_net, p_total)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function create_boleta_amount(p_order uuid, p_total int)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_net int;
begin
  if p_total is null or p_total <= 0 then return null; end if;  -- guard: sin documento de $0
  select round(p_total::numeric * net_clp / amount_clp)::int into v_net from orders where id = p_order;
  insert into tax_documents (order_id, kind, neto, iva, total)
    values (p_order, 'boleta', v_net, p_total - v_net, p_total)
    returning id into v_id;
  return v_id;
end;
$$;
