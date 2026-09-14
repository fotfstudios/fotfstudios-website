-- Bitácora de correos transaccionales (auditoría 2026-09-14, H5).
--
-- Hasta acá todo envío era best-effort con `.catch(console.error)`: cuando la API key
-- de Resend quedó inválida (2026-07-10) TODOS los correos fallaron durante días y el
-- cron diario devolvía "0 notificadas" como si nada. Cada intento queda acá —ok o con
-- el error del proveedor— y /admin "Hoy" muestra los fallos de las últimas 24 h.
--
-- `recipient` es dato del cliente (ya vive en orders.customer_email): RLS sin policies,
-- solo service-role, igual que rate_limit_counters. Volumen bajo (decenas al día); la
-- limpieza de filas viejas se hace en cada inserción, sin job aparte.

create table notification_log (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  template   text not null,            -- customerConfirmation, ownerNeedsReview, …
  recipient  text not null,
  subject    text not null,
  ok         boolean not null,
  error      text,                     -- mensaje del proveedor cuando ok = false
  constraint notification_log_error_only_on_failure check (ok or error is not null)
);
create index notification_log_created_idx on notification_log (created_at desc);
create index notification_log_failures_idx on notification_log (created_at desc) where not ok;

alter table notification_log enable row level security;   -- sin policies: solo service-role
grant all privileges on notification_log to service_role;

-- Retención de 90 días, oportunista (misma idea que rate_limit_hit): cada inserción
-- borra lo vencido. Con este volumen es más barato que un cron.
create function notification_log_record(p_template text, p_recipient text, p_subject text, p_ok boolean, p_error text)
returns void
language plpgsql
as $$
begin
  delete from notification_log where created_at < now() - interval '90 days';
  insert into notification_log (template, recipient, subject, ok, error)
  values (p_template, p_recipient, p_subject, p_ok, case when p_ok then null else coalesce(nullif(p_error, ''), 'error') end);
end;
$$;

alter function notification_log_record(text, text, text, boolean, text) set search_path = public, pg_temp;
grant execute on function notification_log_record(text, text, text, boolean, text) to service_role;
