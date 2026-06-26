-- Marca de "emails enviados" para idempotencia (outbox-lite): el webhook envía
-- al confirmar; un cron diario reenvía los pagados sin notificar (respaldo).
alter table orders add column notified_at timestamptz;

create index orders_pending_notify_idx on orders (paid_at)
  where (status = 'paid' and notified_at is null);
