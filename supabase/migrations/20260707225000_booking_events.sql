-- Log append-only de eventos de reserva: fuente ÚNICA y ordenada del timeline del
-- admin. Cada RPC que cambia estado inserta su(s) evento(s) DENTRO de su transacción
-- (atómico con el cambio) → el log nunca diverge del estado real (un abort GiST
-- revierte también los eventos). Reemplaza el merge en memoria de reservas/[id]/page.

create table booking_events (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,          -- desempate intra/inter-tx (now() es idéntico por tx)
  reservation_id  uuid not null references reservations (id) on delete cascade,
  order_id        uuid references orders (id) on delete set null,     -- orden original O de delta; null en cortesía
  reschedule_id   uuid references reschedules (id) on delete set null,
  tax_document_id uuid references tax_documents (id) on delete set null,
  type            text not null check (type in (
                    'created', 'payment_confirmed', 'courtesy_confirmed', 'access_sent',
                    'reschedule_moved', 'reschedule_charge_pending', 'reschedule_charge_paid',
                    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
                    'boleta_issued', 'boleta_emitted', 'nota_credito_issued', 'nota_credito_emitted',
                    'points_earned', 'points_revoked', 'cancelled', 'refunded')),
  category        text not null check (category in
                    ('Reservas', 'Pagos', 'Puntos', 'Documentos tributarios', 'Notificaciones')),
  amount_clp      int,
  payment_ref     text,
  detail          jsonb,
  occurred_at     timestamptz not null default now(),           -- tiempo del HECHO (paid_at/applied_at/emitted_at…)
  created_by      uuid,
  created_at      timestamptz not null default now()
);

create index booking_events_timeline_idx on booking_events (reservation_id, occurred_at desc, seq desc);
create index booking_events_order_idx on booking_events (order_id) where order_id is not null;

alter table booking_events enable row level security;   -- solo service_role (como reschedules / tax_documents)
grant all privileges on booking_events to service_role;

-- Mapa tipo→categoría central (imposible que derive): cada RPC llama a este helper.
create function booking_event_category(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_type in ('created', 'courtesy_confirmed', 'reschedule_moved', 'cancelled') then 'Reservas'
    when p_type in ('payment_confirmed', 'reschedule_charge_pending', 'reschedule_charge_paid',
                    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
                    'refunded') then 'Pagos'
    when p_type in ('points_earned', 'points_revoked') then 'Puntos'
    when p_type in ('boleta_issued', 'boleta_emitted', 'nota_credito_issued',
                    'nota_credito_emitted') then 'Documentos tributarios'
    when p_type = 'access_sent' then 'Notificaciones'
  end
$$;

-- Escritor único: DRYea cada insert y hace imposible equivocar la categoría.
create function log_booking_event(
  p_reservation uuid, p_type text,
  p_order uuid default null, p_reschedule uuid default null, p_tax_doc uuid default null,
  p_amount int default null, p_payment_ref text default null,
  p_detail jsonb default null, p_occurred_at timestamptz default null, p_created_by uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_cat text;
begin
  v_cat := booking_event_category(p_type);
  if v_cat is null then raise exception 'unknown booking_event type: %', p_type; end if;
  insert into booking_events (reservation_id, type, category, order_id, reschedule_id,
      tax_document_id, amount_clp, payment_ref, detail, occurred_at, created_by)
    values (p_reservation, p_type, v_cat, p_order, p_reschedule, p_tax_doc,
      p_amount, p_payment_ref, p_detail, coalesce(p_occurred_at, now()), p_created_by)
    returning id into v_id;
  return v_id;
end;
$$;

-- Resuelve la reserva de un pedido (original o de delta) para adjuntar sus eventos.
create function reservation_for_order(p_order uuid)
returns uuid language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select id from reservations where order_id = p_order and kind = 'booking' limit 1),
    (select reservation_id from reschedules where delta_order_id = p_order limit 1))
$$;

-- ── Backfill de reservas existentes ─────────────────────────────────────────
-- Reconstruye el historial de las reservas ya creadas (prod) desde las columnas
-- denormalizadas + reschedules + tax_documents. Un solo INSERT…SELECT ordenado
-- para que `seq` quede en orden de ciclo de vida. Idempotente (guard not exists).
insert into booking_events
  (reservation_id, type, category, order_id, reschedule_id, tax_document_id,
   amount_clp, payment_ref, detail, occurred_at, created_by, created_at)
select reservation_id, type, booking_event_category(type), order_id, reschedule_id, tax_document_id,
       amount_clp, payment_ref, detail, occurred_at, null, occurred_at
from (
  -- (1) created / courtesy_confirmed
  select r.id as reservation_id,
         case when r.order_id is null then 'courtesy_confirmed' else 'created' end as type,
         r.order_id, null::uuid as reschedule_id, null::uuid as tax_document_id,
         null::int as amount_clp, null::text as payment_ref, null::jsonb as detail,
         r.created_at as occurred_at, 0 as rank
    from reservations r where r.kind = 'booking'

  union all
  -- (2) payment_confirmed
  select r.id, 'payment_confirmed', o.id, null, null,
         o.amount_clp - coalesce((select sum(m.delta_clp) from reschedules m
             where m.reservation_id = r.id and m.status = 'applied' and m.kind = 'charge'), 0),
         o.mp_payment_id, null, o.paid_at, 1
    from reservations r join orders o on o.id = r.order_id where o.paid_at is not null

  union all
  -- (3) reschedules (por kind/status)
  select m.reservation_id,
         case
           when m.status = 'applied' and m.kind = 'refund' then 'reschedule_refund'
           when m.status = 'applied' and m.kind = 'charge' then 'reschedule_charge_paid'
           when m.status = 'applied' then 'reschedule_moved'
           when m.status = 'pending_charge' then 'reschedule_charge_pending'
           when m.status = 'failed_slot_taken' then 'reschedule_failed_slot_taken'
           when m.status = 'expired' then 'reschedule_expired'
           else 'reschedule_moved'
         end,
         m.original_order_id, m.id, null,
         nullif(m.delta_clp, 0), null,
         jsonb_build_object('old_starts_at', m.old_starts_at, 'new_starts_at', m.new_starts_at),
         coalesce(m.applied_at, m.created_at), 2
    from reschedules m

  union all
  -- (3b) el movimiento en sí (applied refund/charge dejan además su fila de reserva)
  select m.reservation_id, 'reschedule_moved', m.original_order_id, m.id, null,
         null, null,
         jsonb_build_object('old_starts_at', m.old_starts_at, 'new_starts_at', m.new_starts_at),
         coalesce(m.applied_at, m.created_at), 3
    from reschedules m where m.status = 'applied' and m.kind in ('refund', 'charge')

  union all
  -- (4) documentos generados
  select res.reservation_id,
         case d.kind when 'boleta' then 'boleta_issued' else 'nota_credito_issued' end,
         d.order_id, null, d.id, d.total, null, null, d.created_at, 4
    from tax_documents d
    join lateral (
      select coalesce(r1.id, r2.reservation_id) as reservation_id
        from (select 1) _
        left join reservations r1 on r1.order_id = d.order_id and r1.kind = 'booking'
        left join reschedules  r2 on r2.delta_order_id = d.order_id) res on res.reservation_id is not null

  union all
  -- (5) documentos emitidos (con folio)
  select res.reservation_id,
         case d.kind when 'boleta' then 'boleta_emitted' else 'nota_credito_emitted' end,
         d.order_id, null, d.id, d.total, null,
         jsonb_build_object('folio', d.folio), d.emitted_at, 5
    from tax_documents d
    join lateral (
      select coalesce(r1.id, r2.reservation_id) as reservation_id
        from (select 1) _
        left join reservations r1 on r1.order_id = d.order_id and r1.kind = 'booking'
        left join reschedules  r2 on r2.delta_order_id = d.order_id) res on res.reservation_id is not null
    where d.emitted_at is not null

  union all
  -- (6) refunded
  select r.id, 'refunded', o.id, null, null, nullif(o.refunded_amount_clp, 0), o.mp_refund_id,
         null, o.refunded_at, 6
    from reservations r join orders o on o.id = r.order_id where o.refunded_at is not null

  union all
  -- (7) cancelled
  select r.id, 'cancelled', null, null, null, null, null, null, r.cancelled_at, 7
    from reservations r where r.status = 'cancelled' and r.kind = 'booking' and r.cancelled_at is not null

  union all
  -- (8) access_sent
  select r.id, 'access_sent', null, null, null, null, null, null, r.access_sent_at, 8
    from reservations r where r.access_sent_at is not null and r.kind = 'booking'
) src
where not exists (select 1 from booking_events)   -- one-shot
order by reservation_id, occurred_at, rank;
