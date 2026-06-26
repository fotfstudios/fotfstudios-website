-- confirm_payment ahora DEVUELVE un estado, para distinguir el caso límite en que
-- un pago aprobado llega cuando la reserva ya no está en `held` (el hold de 10 min
-- venció y otra reserva del mismo recurso lo barrió, o se revendió). En ese caso el
-- cliente pagó pero su horario se perdió: NO debemos enviarle "¡Reserva confirmada!".
--
-- Estados devueltos:
--   'confirmed'    → reserva confirmada (camino feliz, o reproceso idempotente).
--   'paid_no_hold' → pagado sin reserva válida → requiere revisión/refund del dueño.
--
-- En 'paid_no_hold' marcamos `notified_at` para que el cron de emails NO mande la
-- confirmación normal; la app envía una alerta al dueño en su lugar. La boleta solo
-- se crea cuando hay reserva confirmada (en 'paid_no_hold' el dueño decide refund/NC).
-- Cambia el tipo de retorno (void→text), así que hay que recrear la función.

drop function if exists confirm_payment(uuid, text);

create function confirm_payment(p_order uuid, p_payment_id text)
returns text language plpgsql as $$
declare
  v_held int;
begin
  update orders
    set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_order and status <> 'paid';

  update reservations
    set status = 'confirmed', expires_at = null
    where order_id = p_order and status = 'held';
  get diagnostics v_held = row_count;

  update payment_intents
    set payment_id = p_payment_id, status = 'approved'
    where order_id = p_order;

  if v_held > 0 then
    -- Boleta pendiente (SII), única por pedido. Solo con reserva confirmada.
    insert into tax_documents (order_id, kind, neto, iva, total)
      select id, 'boleta', net_clp, tax_clp, amount_clp from orders where id = p_order
      on conflict do nothing;
    return 'confirmed';
  end if;

  -- v_held = 0: o ya estaba confirmada (reproceso idempotente) o se perdió el hold.
  if exists (select 1 from reservations where order_id = p_order and status = 'confirmed') then
    return 'confirmed';
  end if;

  -- Pagó sin reserva válida: suprime el email de confirmación al cliente y deja
  -- la orden marcada para que el dueño la revise (refund o reasignación).
  update orders set notified_at = now() where id = p_order and notified_at is null;
  return 'paid_no_hold';
end;
$$;
