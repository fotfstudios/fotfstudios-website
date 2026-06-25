-- Pedidos + líneas + checkout transaccional.
-- El monto se recalcula SIEMPRE en el servidor (motor de precios) y se congela
-- como snapshot inmutable por pedido. create_checkout() crea reserva (hold) +
-- pedido + líneas atómicamente; si el horario se traslapa, el EXCLUDE aborta todo.

create type order_status as enum (
  'cart', 'pending_payment', 'paid', 'fulfilled', 'cancelled', 'refunded'
);

create table orders (
  id               uuid primary key default gen_random_uuid(),
  status           order_status not null default 'pending_payment',
  currency         text not null default 'CLP',
  amount_clp       int not null check (amount_clp >= 0),
  net_clp          int not null,
  tax_clp          int not null,
  customer_name    text,
  customer_email   text,
  customer_phone   text,
  pricing_snapshot jsonb,
  mp_preference_id text,
  mp_payment_id    text,
  paid_at          timestamptz,
  created_at       timestamptz not null default now()
);

create table order_lines (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders (id) on delete cascade,
  line_type      text not null check (line_type in ('room_time', 'flat_service', 'discount')),
  reservation_id uuid references reservations (id) on delete set null,
  addon_key      text,
  description    text not null,
  quantity       int not null default 1 check (quantity > 0),
  unit_price_clp int not null,
  subtotal_clp   int not null
);

-- vincula la reserva con su pedido (la reserva se creó en PR4 sin este FK)
alter table reservations add column order_id uuid references orders (id) on delete set null;

create index order_lines_order_idx on order_lines (order_id);

-- RLS: solo servidor (service-role). Sin políticas anónimas.
alter table orders enable row level security;
alter table order_lines enable row level security;

-- Checkout atómico: hold + pedido + líneas. Monto/snapshot vienen ya calculados
-- por el motor de precios en el servidor.
create function create_checkout(
  p_resource uuid,
  p_starts   timestamptz,
  p_ends     timestamptz,
  p_amount   int,
  p_net      int,
  p_tax      int,
  p_currency text,
  p_customer jsonb,
  p_snapshot jsonb,
  p_lines    jsonb,
  p_ttl      interval default interval '10 minutes'
)
returns uuid language plpgsql as $$
declare
  v_res   uuid;
  v_order uuid;
  v_line  jsonb;
begin
  perform expire_stale_holds(p_resource);

  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at,
                            customer_name, customer_email, customer_phone)
    values (p_resource, 'booking', 'held', p_starts, p_ends, now() + p_ttl,
            p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone')
    returning id into v_res;

  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot)
    values ('pending_payment', p_currency, p_amount, p_net, p_tax,
            p_customer ->> 'name', p_customer ->> 'email', p_customer ->> 'phone', p_snapshot)
    returning id into v_order;

  update reservations set order_id = v_order where id = v_res;

  for v_line in select jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, line_type, reservation_id, addon_key, description,
                             quantity, unit_price_clp, subtotal_clp)
      values (v_order,
              v_line ->> 'line_type',
              case when v_line ->> 'line_type' = 'room_time' then v_res else null end,
              v_line ->> 'addon_key',
              v_line ->> 'description',
              coalesce((v_line ->> 'quantity')::int, 1),
              (v_line ->> 'unit_price_clp')::int,
              (v_line ->> 'subtotal_clp')::int);
  end loop;

  return v_order;
end;
$$;
