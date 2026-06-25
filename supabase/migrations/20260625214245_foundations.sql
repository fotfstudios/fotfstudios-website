-- Fundaciones: locaciones, recursos agendables, horarios y price book versionado.
-- Datos de config + precios se siembran desde los números legacy (lib/pricing.ts).
-- Bloques de tiempo en MINUTOS del día, hora local de la locación.

create extension if not exists btree_gist;

-- ───────────────────────── enums
create type tax_mode as enum ('inclusive', 'exclusive');
create type price_book_status as enum ('draft', 'active', 'archived');

-- ───────────────────────── locaciones / recursos
create table locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  address    text,
  timezone   text not null default 'America/Santiago',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table resources (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations (id) on delete restrict,
  name        text not null,
  kind        text not null default 'room',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- horario de apertura por día de semana (0=Dom … 6=Sáb), minutos locales
create table opening_hours (
  id           uuid primary key default gen_random_uuid(),
  resource_id  uuid not null references resources (id) on delete cascade,
  weekday      int2 not null check (weekday between 0 and 6),
  open_minute  int2 not null check (open_minute between 0 and 1440),
  close_minute int2 not null check (close_minute between 0 and 1440),
  constraint opening_hours_open_before_close check (close_minute > open_minute),
  unique (resource_id, weekday)
);

-- excepciones: feriados, horas especiales o cierres puntuales
create table schedule_exceptions (
  id           uuid primary key default gen_random_uuid(),
  resource_id  uuid not null references resources (id) on delete cascade,
  date         date not null,
  closed       boolean not null default false,
  open_minute  int2 check (open_minute between 0 and 1440),
  close_minute int2 check (close_minute between 0 and 1440),
  reason       text,
  created_at   timestamptz not null default now(),
  unique (resource_id, date)
);

-- ───────────────────────── price book versionado
create table price_books (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     price_book_status not null default 'draft',
  valid_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);
-- a lo más un price book activo a la vez
create unique index price_books_one_active on price_books (status) where (status = 'active');

create table rate_plans (
  id                 uuid primary key default gen_random_uuid(),
  price_book_id      uuid not null references price_books (id) on delete cascade,
  resource_id        uuid not null references resources (id) on delete cascade,
  currency           text not null default 'CLP',
  tax_mode           tax_mode not null default 'inclusive',
  rounding_increment int not null default 10,
  min_hours          int2 not null default 1,
  step_hours         int2 not null default 1,
  unique (price_book_id, resource_id)
);

-- franjas: cada fila cubre días + ventana de minutos a una tarifa
create table rate_tiers (
  id           uuid primary key default gen_random_uuid(),
  rate_plan_id uuid not null references rate_plans (id) on delete cascade,
  key          text not null,
  weekdays     int2[] not null,
  start_minute int2 not null check (start_minute between 0 and 1440),
  end_minute   int2 not null check (end_minute between 0 and 1440),
  amount_clp   int not null check (amount_clp >= 0),
  priority     int2 not null default 0,
  constraint rate_tiers_start_before_end check (end_minute > start_minute)
);

create table volume_discounts (
  id           uuid primary key default gen_random_uuid(),
  rate_plan_id uuid not null references rate_plans (id) on delete cascade,
  min_hours    int2 not null check (min_hours > 0),
  pct          numeric(5, 4) not null check (pct >= 0 and pct < 1),
  unique (rate_plan_id, min_hours)
);

create table addons (
  id           uuid primary key default gen_random_uuid(),
  rate_plan_id uuid not null references rate_plans (id) on delete cascade,
  key          text not null,
  name         text not null,
  amount_clp   int not null check (amount_clp >= 0),
  kind         text not null default 'flat_service',
  active       boolean not null default true,
  unique (rate_plan_id, key)
);

create table tax_rates (
  id   uuid primary key default gen_random_uuid(),
  code text not null unique,
  pct  numeric(5, 4) not null check (pct >= 0 and pct < 1)
);

-- ───────────────────────── RLS: lectura pública de catálogo/precios; escrituras solo service-role
alter table locations           enable row level security;
alter table resources           enable row level security;
alter table opening_hours        enable row level security;
alter table schedule_exceptions  enable row level security;
alter table price_books          enable row level security;
alter table rate_plans           enable row level security;
alter table rate_tiers           enable row level security;
alter table volume_discounts      enable row level security;
alter table addons               enable row level security;
alter table tax_rates            enable row level security;

create policy "public read" on locations           for select using (true);
create policy "public read" on resources           for select using (true);
create policy "public read" on opening_hours        for select using (true);
create policy "public read" on schedule_exceptions  for select using (true);
create policy "public read" on price_books          for select using (true);
create policy "public read" on rate_plans           for select using (true);
create policy "public read" on rate_tiers           for select using (true);
create policy "public read" on volume_discounts      for select using (true);
create policy "public read" on addons               for select using (true);
create policy "public read" on tax_rates            for select using (true);

-- ───────────────────────── seed (config + precios legacy)
do $$
declare
  loc uuid;
  res uuid;
  pb  uuid;
  rp  uuid;
begin
  insert into locations (name, slug, address, timezone)
    values ('FOTF Studios — Viña del Mar', 'vina-del-mar',
            'Los Chercanes 78a, Viña del Mar, Valparaíso', 'America/Santiago')
    returning id into loc;

  insert into resources (location_id, name, kind)
    values (loc, 'Sala de ensayo DJ', 'room')
    returning id into res;

  insert into opening_hours (resource_id, weekday, open_minute, close_minute) values
    (res, 0, 540, 1320),  -- Dom 09:00–22:00
    (res, 1, 540, 1320),  -- Lun
    (res, 2, 540, 1320),  -- Mar
    (res, 3, 540, 1320),  -- Mié
    (res, 4, 540, 1320),  -- Jue
    (res, 5, 540, 1380),  -- Vie 09:00–23:00
    (res, 6, 540, 1380);  -- Sáb 09:00–23:00

  insert into price_books (name, status) values ('Inicial', 'active') returning id into pb;

  insert into rate_plans (price_book_id, resource_id) values (pb, res) returning id into rp;

  -- franjas (peak 17:00=1020; cierre máx 23:00=1380; ventanas hasta 1440 las acota opening_hours)
  insert into rate_tiers (rate_plan_id, key, weekdays, start_minute, end_minute, amount_clp, priority) values
    (rp, 'valle',       '{1,2,3,4,5}'::int2[], 540, 1020,  9990, 0),  -- Lun–Vie hasta 17:00
    (rp, 'puntaSemana', '{1,2,3,4}'::int2[],   1020, 1440, 14990, 1), -- Lun–Jue 17:00→cierre
    (rp, 'puntaFinde',  '{5}'::int2[],         1020, 1440, 19990, 1), -- Vie 17:00→cierre
    (rp, 'puntaFinde',  '{0,6}'::int2[],       0, 1440,    19990, 1); -- Sáb y Dom todo el día

  insert into volume_discounts (rate_plan_id, min_hours, pct) values
    (rp, 2, 0.10), (rp, 3, 0.15), (rp, 4, 0.20);

  insert into addons (rate_plan_id, key, name, amount_clp, kind) values
    (rp, 'audio',      'Grabación de audio',       9990,  'flat_service'),
    (rp, 'audioVideo', 'Grabación audio + video',  49990, 'flat_service');

  insert into tax_rates (code, pct) values ('IVA', 0.19) on conflict (code) do nothing;
end $$;
