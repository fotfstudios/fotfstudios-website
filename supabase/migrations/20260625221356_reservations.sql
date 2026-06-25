-- Reservas: agenda del recurso con anti doble-reserva ATÓMICO en Postgres.
-- starts_at/ends_at se guardan en UTC (timestamptz); el app los calcula desde
-- la fecha local + minutos con la tz de la locación (Luxon).

create type reservation_status as enum ('held', 'confirmed', 'cancelled', 'expired');

create table reservations (
  id             uuid primary key default gen_random_uuid(),
  resource_id    uuid not null references resources (id) on delete restrict,
  kind           text not null default 'booking' check (kind in ('booking', 'block')),
  status         reservation_status not null default 'held',
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  expires_at     timestamptz,                -- solo holds
  customer_name  text,
  customer_email text,
  customer_phone text,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint reservations_time_order check (ends_at > starts_at),
  -- Anti-solape: ninguna reserva activa del mismo recurso puede traslaparse.
  -- tstzrange por defecto es '[)' → reservas adyacentes (fin == inicio) NO chocan.
  constraint reservations_no_overlap exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('held', 'confirmed'))
);

-- Disponibilidad: bookings activos de un recurso en una ventana.
create index reservations_active_idx on reservations (resource_id, starts_at)
  where (status in ('held', 'confirmed'));
-- Sweep de holds vencidos.
create index reservations_hold_expiry_idx on reservations (expires_at)
  where (status = 'held');

-- RLS: sin acceso anónimo. Toda escritura/lectura pasa por servidor (service-role).
alter table reservations enable row level security;

-- Libera holds vencidos (sweep). Idempotente; devuelve cuántos expiró.
create function expire_stale_holds(p_resource uuid default null)
returns integer language plpgsql as $$
declare
  n integer;
begin
  update reservations
    set status = 'expired'
    where status = 'held'
      and expires_at < now()
      and (p_resource is null or resource_id = p_resource);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Crea un hold de forma atómica: sweep inline + insert. Si hay solape, la
-- exclusion constraint lanza 23P01 (exclusion_violation) y el caller lo traduce
-- a "horario no disponible".
create function create_hold(
  p_resource uuid,
  p_starts   timestamptz,
  p_ends     timestamptz,
  p_ttl      interval default interval '10 minutes'
)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  -- sweep inline: la correctitud no depende de un cron frecuente
  perform expire_stale_holds(p_resource);
  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at)
    values (p_resource, 'booking', 'held', p_starts, p_ends, now() + p_ttl)
    returning id into v_id;
  return v_id;
end;
$$;
