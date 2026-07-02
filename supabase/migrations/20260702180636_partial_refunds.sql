-- Reembolsos (parciales o totales) hechos en Mercado Pago.
--
-- Procedimiento SII: una nota de crédito solo puede ser por el TOTAL de una boleta.
-- Por eso cualquier reembolso emite una NC por el total de la boleta VIGENTE y, si
-- queda saldo retenido, una NUEVA boleta por ese saldo. Cualquier reembolso (parcial
-- o total) cancela la reserva y libera el horario.

alter table orders add column refunded_amount_clp int not null default 0;

-- Un pedido ahora puede tener >1 boleta (original + saldo). Quitamos la restricción
-- "una boleta por pedido"; la idempotencia de la boleta inicial pasa a un NOT EXISTS.
drop index if exists tax_documents_one_boleta;

-- confirm_payment: la boleta inicial se inserta solo si el pedido aún no tiene boleta.
create or replace function confirm_payment(p_order uuid, p_payment_id text)
returns text language plpgsql
set search_path = public, pg_temp as $$
declare
  v_held int;
begin
  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_order and status <> 'paid';

  update reservations set status = 'confirmed', expires_at = null
    where order_id = p_order and status = 'held';
  get diagnostics v_held = row_count;

  update payment_intents set payment_id = p_payment_id, status = 'approved'
    where order_id = p_order;

  if v_held > 0 then
    insert into tax_documents (order_id, kind, neto, iva, total)
      select o.id, 'boleta', o.net_clp, o.tax_clp, o.amount_clp from orders o
      where o.id = p_order
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

-- NC por un monto, con neto/IVA proporcionales al split del pedido.
create function create_nota_credito_amount(p_order uuid, p_total int)
returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare v_id uuid; v_net int;
begin
  select round(p_total::numeric * net_clp / amount_clp)::int into v_net from orders where id = p_order;
  insert into tax_documents (order_id, kind, neto, iva, total)
    values (p_order, 'nota_credito', v_net, p_total - v_net, p_total)
    returning id into v_id;
  return v_id;
end;
$$;

-- Boleta pendiente por un monto (saldo retenido tras un reembolso parcial).
create function create_boleta_amount(p_order uuid, p_total int)
returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare v_id uuid; v_net int;
begin
  select round(p_total::numeric * net_clp / amount_clp)::int into v_net from orders where id = p_order;
  insert into tax_documents (order_id, kind, neto, iva, total)
    values (p_order, 'boleta', v_net, p_total - v_net, p_total)
    returning id into v_id;
  return v_id;
end;
$$;

-- mark_refunded: cualquier reembolso cancela la reserva, marca la orden 'refunded',
-- acumula el monto reembolsado, y emite NC por la boleta vigente + (si hay saldo)
-- una nueva boleta. Idempotente por reembolso (el webhook keyea el inbox por refund id).
drop function if exists mark_refunded(uuid, text);
create function mark_refunded(p_order uuid, p_refund_id text default null, p_refund_amount int default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_total     int;
  v_prev      int;
  v_boleta    int;   -- boleta vigente = total del pedido − ya reembolsado
  v_refund    int;
  v_remaining int;
begin
  select amount_clp, refunded_amount_clp into v_total, v_prev
    from orders where id = p_order and status in ('paid', 'refunded');
  if v_total is null then return; end if;               -- orden no pagada → ignora

  v_boleta := v_total - v_prev;
  v_refund := least(coalesce(p_refund_amount, v_boleta), v_boleta); -- no exceder la boleta vigente
  v_remaining := v_boleta - v_refund;

  update reservations set status = 'cancelled', cancelled_at = now()
    where order_id = p_order and status in ('held', 'confirmed');

  update orders
    set status = 'refunded',
        mp_refund_id = coalesce(p_refund_id, mp_refund_id),
        refunded_at = now(),
        refunded_amount_clp = v_prev + v_refund
    where id = p_order;

  perform create_nota_credito_amount(p_order, v_boleta);  -- NC por el total de la boleta vigente
  if v_remaining > 0 then
    perform create_boleta_amount(p_order, v_remaining);   -- nueva boleta por el saldo retenido
  end if;
end;
$$;
