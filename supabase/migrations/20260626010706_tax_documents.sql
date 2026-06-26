-- Boleta electrónica (SII) semi-automática. Cada pago crea una boleta PENDIENTE
-- (neto/IVA tomados del pedido) que el dueño emite en el portal del SII y luego
-- registra (folio/PDF). Un refund genera una nota de crédito pendiente.

create type tax_doc_kind as enum ('boleta', 'nota_credito');
create type tax_doc_status as enum ('pendiente', 'emitida');

create table tax_documents (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders (id) on delete cascade,
  kind         tax_doc_kind not null,
  status       tax_doc_status not null default 'pendiente',
  folio        text,
  neto         int not null,
  iva          int not null,
  total        int not null,
  receptor_rut text,
  pdf_url      text,
  emitted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index tax_documents_status_idx on tax_documents (status, kind);
-- Una sola boleta por pedido (idempotencia ante reprocesos del webhook).
create unique index tax_documents_one_boleta on tax_documents (order_id) where (kind = 'boleta');

alter table tax_documents enable row level security;
grant all privileges on tax_documents to service_role;

-- confirm_payment ahora también crea la boleta pendiente, atómico con el pago.
create or replace function confirm_payment(p_order uuid, p_payment_id text)
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

  insert into tax_documents (order_id, kind, neto, iva, total)
    select id, 'boleta', net_clp, tax_clp, amount_clp from orders where id = p_order
    on conflict do nothing;
end;
$$;

-- Nota de crédito pendiente (para refunds).
create function create_nota_credito(p_order uuid)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into tax_documents (order_id, kind, neto, iva, total)
    select id, 'nota_credito', net_clp, tax_clp, amount_clp from orders where id = p_order
    returning id into v_id;
  return v_id;
end;
$$;
