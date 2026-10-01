-- Espejo de la agenda en Google Calendar (spec 2026-10-01-google-calendar-espejo-design.md).
--
-- Unidireccional: la app empuja cada fila de `reservations` a un calendario que el dueño
-- comparte con una cuenta de servicio de Google. Google nunca se lee.
--
--   reservations ──trigger──▶ calendar_sync (cola + estado) ◀── pg_cron 1 min ──▶ pg_net
--                                                                   │
--                               /api/cron/calendar-sync ◀───────────┘  (reclama, llama a Google)
--
-- Por qué una cola y no llamar a Google desde las RPCs: Google es un efecto remoto que no puede
-- ir dentro de la transacción de la reserva (un timeout tumbaría un checkout). Por qué un
-- trigger y no `booking_events`: la expiración de holds (SQL puro en pg_cron) y los bloqueos
-- no registran evento, y `deleteBlock` / `release_reschedule_hold` hacen DELETE físico. El
-- trigger es el único lugar que ve todos los caminos.

-- ── 1. Estado por reserva ────────────────────────────────────────────────────
-- SIN FK a reservations a propósito: cuando un bloqueo se borra, la fila de acá tiene que
-- sobrevivir para que el worker borre el evento en Google. El worker la elimina después.
--
-- `version` evita perder una actualización: el worker reclama la fila (lee version=3), llama a
-- Google, y mientras tanto el admin reagenda (version=4). Al terminar, el worker escribe
-- `pending = (version <> 3)` y la fila queda pendiente para la próxima corrida.
create table calendar_sync (
  reservation_id   uuid primary key,
  -- Pista para el admin ("se va a borrar"). El worker NO la usa: decide por la foto actual.
  op               text not null default 'upsert' check (op in ('upsert', 'delete')),
  pending          boolean not null default true,
  version          bigint not null default 1,
  attempts         int not null default 0,
  next_attempt_at  timestamptz not null default now(),
  -- Lease del reclamo: un worker que muere a mitad de corrida la libera sola a los 5 min.
  locked_at        timestamptz,
  last_error       text check (char_length(last_error) <= 500),
  google_event_id  text,
  -- sha256 del payload ya enviado: un encolado que no cambia el evento no llama a Google.
  last_fingerprint text,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index calendar_sync_due_idx on calendar_sync (next_attempt_at) where pending;

-- Solo el servidor (service_role) la toca: RLS sin policies, como notification_log.
alter table calendar_sync enable row level security;
revoke all on calendar_sync from anon, authenticated;

-- ── 2. Encolar ───────────────────────────────────────────────────────────────
-- security definer: la fila se escribe sea quien sea el que toca `reservations` (service_role
-- desde la app, postgres desde pg_cron).
create or replace function enqueue_calendar_sync()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into calendar_sync (reservation_id, op, pending, next_attempt_at, attempts, version, updated_at)
  values (coalesce(new.id, old.id),
          case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
          true, now(), 0, 1, now())
  on conflict (reservation_id) do update
    set op              = excluded.op,
        pending         = true,
        next_attempt_at = now(),
        attempts        = 0,
        version         = calendar_sync.version + 1,
        updated_at      = now();
  -- locked_at NO se toca: si un worker está procesando esta fila, termina y la comparación
  -- de version decide si queda pendiente.
  return null;
end;
$$;
revoke all on function enqueue_calendar_sync() from public, anon, authenticated;

-- Solo las columnas que cambian el evento. Quedan fuera reminder_sent_at y access_* (el
-- barrido de PIN y recordatorios escribe cada 5 min), expires_at, cancelled_at, reschedule_id
-- y el contacto del cliente (que nunca sale a Google). Un cambio de status en la misma
-- sentencia sí encola.
create trigger reservations_calendar_sync
  after insert or delete
     or update of status, starts_at, ends_at, kind, customer_name, notes, order_id
  on reservations
  for each row execute function enqueue_calendar_sync();

-- ── 3. RPCs del worker ───────────────────────────────────────────────────────
-- Reclamo: SKIP LOCKED + lease. El cron y el botón "Sincronizar ahora" del admin nunca toman
-- la misma fila. Un UPDATE … LIMIT … FOR UPDATE no se puede expresar vía PostgREST.
create or replace function calendar_sync_claim(
  p_limit int default 25,
  p_lease interval default interval '5 minutes'
)
returns setof calendar_sync language sql
set search_path = public, pg_temp as $$
  with due as (
    select reservation_id
      from calendar_sync
     where pending
       and next_attempt_at <= now()
       and (locked_at is null or locked_at < now() - p_lease)
     order by next_attempt_at
     limit p_limit
     for update skip locked
  )
  update calendar_sync c
     set locked_at = now(), updated_at = now()
    from due
   where c.reservation_id = due.reservation_id
  returning c.*;
$$;

-- La foto que necesitan el título y la descripción. NO selecciona customer_email ni
-- customer_phone: el contacto del cliente no puede llegar a Google ni por error.
create or replace function calendar_sync_snapshot(p_reservation uuid)
returns table (
  id                    uuid,
  kind                  text,
  status                text,
  starts_at             timestamptz,
  ends_at               timestamptz,
  expires_at            timestamptz,
  customer_name         text,
  notes                 text,
  order_id              uuid,
  reschedule_id         uuid,
  course_n              int,
  course_title          text,
  course_session_status text,
  generation_name       text,
  addons                text[],
  tz                    text
)
language sql stable
set search_path = public, pg_temp as $$
  select r.id, r.kind, r.status::text, r.starts_at, r.ends_at, r.expires_at,
         r.customer_name, r.notes, r.order_id, r.reschedule_id,
         cs.n::int, cs.title, cs.status, cg.name,
         coalesce((select array_agg(ol.description order by ol.description)
                     from order_lines ol
                    where ol.order_id = r.order_id and ol.addon_key is not null), '{}'),
         coalesce(l.timezone, 'America/Santiago')
    from reservations r
    left join course_sessions cs    on cs.reservation_id = r.id
    left join course_generations cg on cg.id = cs.generation_id
    left join resources res         on res.id = r.resource_id
    left join locations l           on l.id = res.location_id
   where r.id = p_reservation;
$$;

-- Re-encola todo lo vigente (backfill y "Resincronizar todo" del admin). Limpia el
-- fingerprint para FORZAR el PATCH: sin eso, resincronizar después de que el dueño borró
-- eventos a mano no haría nada (el payload no cambió).
create or replace function calendar_sync_enqueue_all()
returns int language plpgsql
set search_path = public, pg_temp as $$
declare
  n int;
begin
  insert into calendar_sync (reservation_id, op)
  select r.id, 'upsert'
    from reservations r
   where r.ends_at >= now() and r.status in ('held', 'confirmed')
  on conflict (reservation_id) do update
    set op               = 'upsert',
        pending          = true,
        next_attempt_at  = now(),
        attempts         = 0,
        last_fingerprint = null,
        version          = calendar_sync.version + 1,
        updated_at       = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Cierre de una fila procesada, atómico (PostgREST no puede expresar "pending = version cambió").
-- Si la versión es la reclamada, queda sincronizada; si un trigger la subió mientras el worker
-- trabajaba, queda pendiente y el próximo tick la reprocesa con la foto nueva. Con p_gone (la
-- reserva ya no existe) borra la fila, solo si la versión no cambió.
create or replace function calendar_sync_mark_synced(
  p_reservation uuid, p_version bigint, p_event_id text, p_fingerprint text, p_gone boolean
)
returns void language plpgsql
set search_path = public, pg_temp as $$
begin
  if p_gone then
    delete from calendar_sync where reservation_id = p_reservation and version = p_version;
    if found then return; end if;
  end if;
  update calendar_sync
     set locked_at        = null,
         attempts         = 0,
         last_error       = null,
         last_synced_at   = now(),
         google_event_id  = p_event_id,
         last_fingerprint = p_fingerprint,
         pending          = (version <> p_version),
         updated_at       = now()
   where reservation_id = p_reservation;
end;
$$;

-- Fallo de una fila: suelta el lease, cuenta el intento y agenda el reintento. Si llegó un
-- cambio nuevo mientras tanto (version distinta), se reintenta YA: es otra foto, el backoff
-- de la anterior no aplica.
create or replace function calendar_sync_mark_failed(
  p_reservation uuid, p_version bigint, p_error text, p_next timestamptz
)
returns void language sql
set search_path = public, pg_temp as $$
  update calendar_sync
     set locked_at       = null,
         attempts        = attempts + 1,
         last_error      = left(p_error, 500),
         pending         = true,
         next_attempt_at = case when version = p_version then p_next else now() end,
         updated_at      = now()
   where reservation_id = p_reservation;
$$;

revoke execute on function calendar_sync_claim(int, interval) from public, anon, authenticated;
revoke execute on function calendar_sync_snapshot(uuid) from public, anon, authenticated;
revoke execute on function calendar_sync_enqueue_all() from public, anon, authenticated;
revoke execute on function calendar_sync_mark_synced(uuid, bigint, text, text, boolean) from public, anon, authenticated;
revoke execute on function calendar_sync_mark_failed(uuid, bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function calendar_sync_claim(int, interval) to service_role;
grant execute on function calendar_sync_snapshot(uuid) to service_role;
grant execute on function calendar_sync_enqueue_all() to service_role;
grant execute on function calendar_sync_mark_synced(uuid, bigint, text, text, boolean) to service_role;
grant execute on function calendar_sync_mark_failed(uuid, bigint, text, timestamptz) to service_role;

-- ── 4. Backfill ──────────────────────────────────────────────────────────────
-- La cola nace llena con todo lo futuro: el worker la drena a 25 por minuto cuando exista.
select calendar_sync_enqueue_all();

-- ── 5. Scheduler: pg_cron → pg_net → /api/cron/calendar-sync ─────────────────
-- Copia de run_access_code_cron() (20260911150000) con los MISMOS secretos de Vault
-- (site_url, cron_secret): el dueño no carga nada nuevo. Sin ellos es un no-op (local, o un
-- proyecto recién creado). Mientras la ruta no exista (ventana entre esta migración y el PR
-- del código), pg_net recibe 404 cada minuto y no pasa nada más.
create extension if not exists pg_net with schema extensions;
create or replace function run_calendar_sync_cron()
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
    url := rtrim(v_url, '/') || '/api/cron/calendar-sync',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 15000
  );
end;
$$;
revoke all on function run_calendar_sync_cron() from public, anon, authenticated;

create extension if not exists pg_cron;
-- Con nombre, cron.schedule es idempotente. Suma 1.440 filas/día a cron.job_run_details;
-- purge-cron-history ya las poda cada semana.
select cron.schedule('calendar-sync', '* * * * *', 'select public.run_calendar_sync_cron()');

-- ── 6. Permiso de la sección /admin/calendario ───────────────────────────────
-- NO se otorga a ningún rol (como equipment.manage): super_admin lo tiene por definición.
insert into admin_permissions (key, label)
values ('calendar.manage', 'Sincronizar calendario')
on conflict (key) do nothing;
