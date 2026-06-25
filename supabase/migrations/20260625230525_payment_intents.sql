-- Intentos de pago (Mercado Pago). El monto sale del pedido (snapshot), nunca
-- del cliente. idempotency_key evita doble cobro en reintentos.

create table payment_intents (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders (id) on delete cascade,
  provider        text not null default 'mercadopago',
  preference_id   text,
  payment_id      text,
  amount_clp      int not null check (amount_clp >= 0),
  currency        text not null default 'CLP',
  status          text not null default 'created',
  idempotency_key text,
  created_at      timestamptz not null default now()
);

create index payment_intents_order_idx on payment_intents (order_id);

alter table payment_intents enable row level security;

grant all privileges on payment_intents to service_role;
