-- Reembolso vía Mercado Pago: registra el id de reembolso y refina las
-- transiciones de cancelación.
--
-- La llamada real a MP la hace la app (Postgres no llama a MP); estas funciones
-- solo hacen el asiento en la DB una vez que el reembolso quedó hecho.

alter table orders add column mp_refund_id text;   -- id del reembolso en MP (o 'offline:*')
alter table orders add column refunded_at timestamptz;

-- cancel_booking gana `p_refund_id` para distinguir:
--   p_refund_id NO nulo  → "cancelar y reembolsar": orden → 'refunded' + nota de crédito.
--   p_refund_id nulo     → "cancelar sin reembolso": la orden pagada queda 'paid'
--                          (dinero retenido; p. ej. no-show), sin nota de crédito.
--   orden no pagada      → 'cancelled' (igual que antes).
-- Siempre libera el horario (reserva → 'cancelled'). Cambia la firma → recrear.
drop function if exists cancel_booking(uuid);

create function cancel_booking(p_reservation uuid, p_refund_id text default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_order  uuid;
  v_status order_status;
begin
  select order_id into v_order from reservations where id = p_reservation;

  update reservations set status = 'cancelled' where id = p_reservation;

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

-- mark_refunded: reembolso originado FUERA del panel (dashboard de MP / webhook).
-- Libera el horario, marca la orden 'refunded' y crea la NC. Idempotente: solo
-- actúa si la orden está 'paid', así un reintento del webhook no duplica la NC.
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
    update reservations set status = 'cancelled'
      where order_id = p_order and status in ('held', 'confirmed');
    perform create_nota_credito(p_order);
  end if;
end;
$$;
