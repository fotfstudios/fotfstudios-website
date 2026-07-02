-- Observabilidad de reservas: snapshot del pago de MP (método/comisión/neto) y
-- timestamp real de cancelación, para mostrarlos en el panel admin.

alter table orders add column payment_snapshot jsonb;      -- detalle del pago MP al confirmar
alter table reservations add column cancelled_at timestamptz;

-- Recrea cancel_booking / mark_refunded para sellar reservations.cancelled_at
-- donde marcan la reserva 'cancelled'. Firma sin cambios → los callers no se tocan.

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
    end if;
  end if;
end;
$$;

drop function if exists mark_refunded(uuid, text);
create function mark_refunded(p_order uuid, p_refund_id text default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_was_paid boolean;
begin
  update orders
    set status = 'refunded',
        mp_refund_id = coalesce(p_refund_id, mp_refund_id),
        refunded_at = now()
    where id = p_order and status = 'paid'
    returning true into v_was_paid;

  if v_was_paid then
    update reservations set status = 'cancelled', cancelled_at = now()
      where order_id = p_order and status in ('held', 'confirmed');
    perform create_nota_credito(p_order);
  end if;
end;
$$;
