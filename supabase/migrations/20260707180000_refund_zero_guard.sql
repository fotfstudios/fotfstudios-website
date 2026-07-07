-- A3 (defensa en profundidad): nunca emitir un documento tributario de $0. La raíz del
-- bug es el reembolso de slot_taken que no registraba el inbox (arreglado en la capa app);
-- este guard evita que cualquier camino con monto 0 inserte una boleta/NC inválida.
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
