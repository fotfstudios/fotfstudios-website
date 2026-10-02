-- Avisos por WhatsApp vía Kapso (spec 2026-10-02-whatsapp-kapso-design.md). Solo EXPANSIÓN:
-- nada del código vivo lee estas columnas ni llama estas funciones hasta PR3/PR4, así que la
-- migración puede correr en prod antes o después del deploy de este PR sin romper nada.
--
--   notifyX() ──encola──▶ whatsapp_outbox ◀── pg_cron 1 min ──▶ pg_net
--                               │
--   /api/cron/whatsapp-outbox ◀─┘  (reclama, manda a Kapso, marca sent/failed)
--   /api/webhooks/kapso ──▶ whatsapp_outbox_apply_status (delivered/read/failed)

-- ── 1. Consentimiento por cliente ────────────────────────────────────────────
-- El default de la DB es false: el consentimiento es un acto registrado (fecha + origen). La
-- casilla de /reservar viene marcada, pero lo que llega acá es lo que el cliente dejó marcado.
alter table customers
  add column whatsapp_opt_in        boolean not null default false,
  add column whatsapp_opt_in_at     timestamptz,
  add column whatsapp_opt_in_source text
    constraint customers_whatsapp_opt_in_source_check
    check (whatsapp_opt_in_source in ('customer', 'staff', 'account')),
  add column whatsapp_opt_out_at    timestamptz,
  add constraint customers_whatsapp_opt_in_dated
    check (not whatsapp_opt_in or (whatsapp_opt_in_at is not null and whatsapp_opt_in_source is not null));

-- Un solo escritor para las tres superficies (checkout, /cuenta, ficha del admin). Desmarcar
-- guarda la fecha de baja y conserva el origen/fecha del alta anterior como historia.
create or replace function set_whatsapp_opt_in(p_customer uuid, p_opt_in boolean, p_source text)
returns void language plpgsql
set search_path = public, pg_temp as $$
begin
  if p_opt_in then
    update customers
       set whatsapp_opt_in        = true,
           whatsapp_opt_in_at     = now(),
           whatsapp_opt_in_source = p_source,
           whatsapp_opt_out_at    = null,
           updated_at             = now()
     where id = p_customer;
  else
    update customers
       set whatsapp_opt_in     = false,
           whatsapp_opt_out_at = case when whatsapp_opt_in then now() else whatsapp_opt_out_at end,
           updated_at          = now()
     where id = p_customer;
  end if;
end;
$$;

-- Variante por pedido, para el checkout: create_checkout NO se toca (su firma y sus locks
-- quedan como están; ver 20260909130000). La app llama esto justo después, con el pedido
-- recién creado; si falla, la reserva sigue en pie y solo se pierde la preferencia.
-- Devuelve false si el pedido no tiene ficha (email que no pasó la puerta de forma).
create or replace function set_whatsapp_opt_in_for_order(p_order uuid, p_opt_in boolean, p_source text)
returns boolean language plpgsql
set search_path = public, pg_temp as $$
declare
  v_cust uuid;
begin
  select customer_id into v_cust from orders where id = p_order;
  if v_cust is null then return false; end if;
  perform set_whatsapp_opt_in(v_cust, p_opt_in, p_source);
  return true;
end;
$$;

-- ── 2. Cola de salida ────────────────────────────────────────────────────────
-- Una fila por mensaje. A diferencia de calendar_sync no hay `version`: los mensajes no se
-- fusionan, cada uno sale o falla. `expires_at` evita mandar tarde (un PIN después de la sesión,
-- un recordatorio de pago vencido): la fila pasa a 'expired' sin tocar a Kapso.
create table whatsapp_outbox (
  id              uuid primary key default gen_random_uuid(),
  -- Idempotencia del encolado: 'booking_confirmed:<orderId>', 'access_pin:<reservationId>', …
  dedupe_key      text not null unique,
  event           text not null,
  recipient       text not null check (recipient ~ '^[0-9]{8,15}$'),
  template_name   text not null check (template_name ~ '^[a-z0-9_]+$'),
  template_params jsonb not null default '{}'::jsonb,
  button_suffix   text,
  entity_kind     text check (entity_kind in ('order', 'reservation')),
  entity_id       uuid,
  status          text not null default 'pending'
                  check (status in ('pending', 'sent', 'delivered', 'read', 'failed', 'expired')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  -- Lease del reclamo: un worker que muere a mitad de corrida la libera solo a los 5 min.
  locked_at       timestamptz,
  expires_at      timestamptz not null,
  provider_id     text,            -- wamid de Meta
  failed_code     int,
  last_error      text check (char_length(last_error) <= 500),
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index whatsapp_outbox_due_idx on whatsapp_outbox (next_attempt_at) where status = 'pending';
create index whatsapp_outbox_provider_idx on whatsapp_outbox (provider_id) where provider_id is not null;
create index whatsapp_outbox_created_idx on whatsapp_outbox (created_at desc);

-- Teléfonos de clientes: solo el servidor (service_role), como notification_log.
alter table whatsapp_outbox enable row level security;
revoke all on whatsapp_outbox from anon, authenticated;
grant all privileges on whatsapp_outbox to service_role;

-- Reclamo: vence lo atrasado, poda lo viejo (90 días, como notification_log) y toma hasta
-- p_limit filas con SKIP LOCKED + lease. El cron y "Procesar ahora" nunca toman la misma fila.
create or replace function whatsapp_outbox_claim(
  p_limit int default 25,
  p_lease interval default interval '5 minutes'
)
returns setof whatsapp_outbox language plpgsql
set search_path = public, pg_temp as $$
begin
  update whatsapp_outbox
     set status = 'expired', locked_at = null, updated_at = now()
   where status = 'pending' and expires_at <= now();

  delete from whatsapp_outbox where created_at < now() - interval '90 days';

  return query
  with due as (
    select id
      from whatsapp_outbox
     where status = 'pending'
       and next_attempt_at <= now()
       and expires_at > now()
       and (locked_at is null or locked_at < now() - p_lease)
     order by next_attempt_at
     limit p_limit
     for update skip locked
  )
  update whatsapp_outbox o
     set locked_at = now(), updated_at = now()
    from due
   where o.id = due.id
  returning o.*;
end;
$$;

-- Kapso aceptó el mensaje. Un webhook de estado pudo haber llegado antes (carrera de ms): si la
-- fila ya avanzó, no se retrocede.
create or replace function whatsapp_outbox_mark_sent(p_id uuid, p_provider_id text)
returns void language sql
set search_path = public, pg_temp as $$
  update whatsapp_outbox
     set status      = case when status = 'pending' then 'sent' else status end,
         provider_id = p_provider_id,
         sent_at     = now(),
         locked_at   = null,
         attempts    = attempts + 1,
         last_error  = null,
         updated_at  = now()
   where id = p_id;
$$;

-- Fallo al mandar. p_terminal (error no reintentable o tope de intentos) la deja 'failed'; si
-- no, vuelve a 'pending' con el próximo intento que calculó el servicio (backoff en TS).
create or replace function whatsapp_outbox_mark_failed(
  p_id uuid, p_error text, p_code int, p_next timestamptz, p_terminal boolean
)
returns void language sql
set search_path = public, pg_temp as $$
  update whatsapp_outbox
     set status          = case when p_terminal then 'failed' else 'pending' end,
         attempts        = attempts + 1,
         failed_code     = p_code,
         last_error      = left(coalesce(nullif(p_error, ''), 'error'), 500),
         next_attempt_at = case when p_terminal then next_attempt_at else p_next end,
         locked_at       = null,
         updated_at      = now()
   where id = p_id;
$$;

-- Estado desde el webhook de Kapso. Monótono: sent < delivered < read; 'failed' es terminal y
-- se aplica sobre cualquier estado no terminal. Nunca reencola: una fila solo se reclama en
-- 'pending'. Devuelve false si el wamid no es nuestro (p. ej. un mensaje escrito a mano desde la
-- app Business en coexistencia) o si el estado no avanza.
create or replace function whatsapp_outbox_apply_status(
  p_provider_id text, p_status text, p_code int default null, p_message text default null
)
returns boolean language plpgsql
set search_path = public, pg_temp as $$
declare
  v_rank_new int := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 end;
begin
  if p_status = 'failed' then
    update whatsapp_outbox
       set status = 'failed', failed_code = p_code,
           last_error = left(coalesce(nullif(p_message, ''), 'failed'), 500),
           locked_at = null, updated_at = now()
     where provider_id = p_provider_id and status not in ('failed', 'expired');
    return found;
  end if;
  if v_rank_new is null then return false; end if;
  update whatsapp_outbox
     set status = p_status, updated_at = now()
   where provider_id = p_provider_id
     and status in ('pending', 'sent', 'delivered')
     and v_rank_new > case status when 'pending' then 0 when 'sent' then 1 when 'delivered' then 2 end;
  return found;
end;
$$;

-- Números del admin (/admin/whatsapp) sobre las últimas p_hours horas.
create or replace function whatsapp_outbox_stats(p_hours int default 24)
returns table (pending bigint, sent bigint, delivered bigint, failed bigint, expired bigint)
language sql stable
set search_path = public, pg_temp as $$
  select count(*) filter (where status = 'pending'),
         count(*) filter (where status in ('sent', 'delivered', 'read')),
         count(*) filter (where status in ('delivered', 'read')),
         count(*) filter (where status = 'failed'),
         count(*) filter (where status = 'expired')
    from whatsapp_outbox
   where created_at >= now() - make_interval(hours => p_hours);
$$;

-- "Reintentar fallidos": solo lo que todavía no venció. Devuelve cuántas filas volvieron.
create or replace function whatsapp_outbox_retry_failed()
returns int language plpgsql
set search_path = public, pg_temp as $$
declare
  n int;
begin
  update whatsapp_outbox
     set status = 'pending', attempts = 0, next_attempt_at = now(), failed_code = null,
         locked_at = null, updated_at = now()
   where status = 'failed' and expires_at > now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── 3. Bandeja del webhook ───────────────────────────────────────────────────
-- Kapso reintenta una entrega con la MISMA X-Idempotency-Key; el id del mensaje no sirve para
-- deduplicar (sent/delivered/read/failed lo comparten).
create table whatsapp_webhook_inbox (
  idempotency_key text primary key check (char_length(idempotency_key) between 1 and 200),
  event           text not null,
  received_at     timestamptz not null default now()
);
alter table whatsapp_webhook_inbox enable row level security;
revoke all on whatsapp_webhook_inbox from anon, authenticated;
grant all privileges on whatsapp_webhook_inbox to service_role;

-- true = primera vez que vemos esta entrega. Poda oportunista a 30 días (los reintentos de
-- Kapso duran ~50 s; 30 días es holgura de sobra).
create or replace function whatsapp_webhook_claim(p_key text, p_event text)
returns boolean language plpgsql
set search_path = public, pg_temp as $$
begin
  delete from whatsapp_webhook_inbox where received_at < now() - interval '30 days';
  insert into whatsapp_webhook_inbox (idempotency_key, event) values (p_key, p_event)
  on conflict (idempotency_key) do nothing;
  return found;
end;
$$;

-- ── 4. Bitácora por canal ────────────────────────────────────────────────────
-- "Hoy" en /admin muestra los fallos de los dos canales. DROP + CREATE porque PostgREST no
-- desambigua sobrecargas; el parámetro nuevo tiene default, así que el código vivo (5 args
-- con nombre) sigue funcionando sin cambios.
alter table notification_log
  add column channel text not null default 'email'
  constraint notification_log_channel_check check (channel in ('email', 'whatsapp'));

drop function notification_log_record(text, text, text, boolean, text);
create function notification_log_record(
  p_template text, p_recipient text, p_subject text, p_ok boolean, p_error text,
  p_channel text default 'email'
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from notification_log where created_at < now() - interval '90 days';
  insert into notification_log (template, recipient, subject, ok, error, channel)
  values (p_template, p_recipient, p_subject, p_ok,
          case when p_ok then null else coalesce(nullif(p_error, ''), 'error') end,
          coalesce(p_channel, 'email'));
end;
$$;

-- ── 5. Permisos de ejecución ─────────────────────────────────────────────────
revoke execute on function set_whatsapp_opt_in(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function set_whatsapp_opt_in_for_order(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function whatsapp_outbox_claim(int, interval) from public, anon, authenticated;
revoke execute on function whatsapp_outbox_mark_sent(uuid, text) from public, anon, authenticated;
revoke execute on function whatsapp_outbox_mark_failed(uuid, text, int, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function whatsapp_outbox_apply_status(text, text, int, text) from public, anon, authenticated;
revoke execute on function whatsapp_outbox_stats(int) from public, anon, authenticated;
revoke execute on function whatsapp_outbox_retry_failed() from public, anon, authenticated;
revoke execute on function whatsapp_webhook_claim(text, text) from public, anon, authenticated;
revoke execute on function notification_log_record(text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function set_whatsapp_opt_in(uuid, boolean, text) to service_role;
grant execute on function set_whatsapp_opt_in_for_order(uuid, boolean, text) to service_role;
grant execute on function whatsapp_outbox_claim(int, interval) to service_role;
grant execute on function whatsapp_outbox_mark_sent(uuid, text) to service_role;
grant execute on function whatsapp_outbox_mark_failed(uuid, text, int, timestamptz, boolean) to service_role;
grant execute on function whatsapp_outbox_apply_status(text, text, int, text) to service_role;
grant execute on function whatsapp_outbox_stats(int) to service_role;
grant execute on function whatsapp_outbox_retry_failed() to service_role;
grant execute on function whatsapp_webhook_claim(text, text) to service_role;
grant execute on function notification_log_record(text, text, text, boolean, text, text) to service_role;

-- ── 6. Scheduler: pg_cron → pg_net → /api/cron/whatsapp-outbox ───────────────
-- Copia de run_calendar_sync_cron() con los MISMOS secretos de Vault (site_url, cron_secret): el
-- dueño no carga nada nuevo. Sin ellos es un no-op. Mientras la ruta no exista (ventana hasta
-- PR4) pg_net recibe 404 cada minuto y no pasa nada más. Sin las variables de Kapso la ruta
-- responde `configured: false` sin tocar la cola.
create extension if not exists pg_net with schema extensions;
create or replace function run_whatsapp_outbox_cron()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/cron/whatsapp-outbox',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 15000
  );
end;
$$;
revoke all on function run_whatsapp_outbox_cron() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('whatsapp-outbox', '* * * * *', 'select public.run_whatsapp_outbox_cron()');

-- ── 7. Permiso de la sección /admin/whatsapp ─────────────────────────────────
-- NO se otorga a ningún rol (como calendar.manage): super_admin lo tiene por definición.
insert into admin_permissions (key, label)
values ('whatsapp.manage', 'Configurar WhatsApp')
on conflict (key) do nothing;
