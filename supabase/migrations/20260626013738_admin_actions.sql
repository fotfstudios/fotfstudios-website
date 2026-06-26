-- Acciones de admin: acceso (código) en reservas + cancelación atómica con NC.

alter table reservations add column access_code text;
alter table reservations add column access_sent_at timestamptz;

-- Cancela una reserva: libera el horario y, si el pedido estaba pagado, lo marca
-- reembolsado y genera la nota de crédito pendiente.
create function cancel_booking(p_reservation uuid)
returns void language plpgsql as $$
declare
  v_order uuid;
  v_paid  boolean;
begin
  select order_id into v_order from reservations where id = p_reservation;

  update reservations set status = 'cancelled' where id = p_reservation;

  if v_order is not null then
    select status = 'paid' into v_paid from orders where id = v_order;
    if v_paid then
      update orders set status = 'refunded' where id = v_order;
      insert into tax_documents (order_id, kind, neto, iva, total)
        select id, 'nota_credito', net_clp, tax_clp, amount_clp from orders where id = v_order;
    else
      update orders set status = 'cancelled' where id = v_order;
    end if;
  end if;
end;
$$;
