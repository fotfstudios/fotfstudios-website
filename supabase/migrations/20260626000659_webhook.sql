-- Webhook de pago: inbox (idempotencia) + confirmación/cancelación atómica.
-- El webhook es la ÚNICA fuente de verdad del pago. Consulta el pago en la API
-- de MP (no confía en el body) y aquí solo persiste el resultado.

-- Inbox: deduplica notificaciones. event_id = paymentId:status (procesar cada
-- transición una sola vez).
create table webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'mercadopago',
  event_id     text not null,
  topic        text,
  payload      jsonb,
  created_at   timestamptz not null default now(),
  unique (provider, event_id)
);

alter table webhook_events enable row level security;
grant all privileges on webhook_events to service_role;

-- Marca el pedido pagado + confirma la reserva (forward-only → idempotente).
create function confirm_payment(p_order uuid, p_payment_id text)
returns void language plpgsql as $$
begin
  update orders
    set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_order and status <> 'paid';

  update reservations
    set status = 'confirmed', expires_at = null
    where order_id = p_order and status = 'held';

  update payment_intents
    set payment_id = p_payment_id, status = 'approved'
    where order_id = p_order;
end;
$$;

-- Pago rechazado/cancelado: libera el horario y cancela el pedido (si no pagado).
create function cancel_unpaid_order(p_order uuid)
returns void language plpgsql as $$
begin
  update reservations
    set status = 'expired'
    where order_id = p_order and status = 'held';

  update orders
    set status = 'cancelled'
    where id = p_order and status = 'pending_payment';
end;
$$;
