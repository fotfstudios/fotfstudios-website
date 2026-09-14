-- Recordatorio de sesión (auditoría 2026-09-14, H9).
--
-- Entre la confirmación y el PIN (10 min antes) el cliente no recibía nada, y una
-- reserva manual puede ser para dentro de semanas. El barrido de pg_cron de 5 min
-- (el mismo del PIN, `/api/cron/access-codes`) manda un recordatorio a las reservas
-- confirmadas de cliente que empiezan dentro de las próximas 24 h, una sola vez:
-- `reminder_sent_at` es el reclamo (UPDATE … IS NULL RETURNING), igual que
-- `access_sent_at`. Se suelta si el correo falla, para que la próxima corrida reintente.

alter table reservations add column reminder_sent_at timestamptz;

-- Lo que lee el barrido: confirmadas, de cliente, sin recordatorio, por inicio.
create index reservations_reminder_due_idx
  on reservations (starts_at)
  where kind = 'booking' and status = 'confirmed' and reminder_sent_at is null;

-- Backfill: lo que empieza en las próximas 24 h ya pasó su momento de recordatorio
-- (o está tan cerca que la confirmación fue hace nada); no inundar en el primer barrido.
update reservations
   set reminder_sent_at = now()
 where kind = 'booking' and status = 'confirmed' and reminder_sent_at is null
   and starts_at < now() + interval '24 hours';
