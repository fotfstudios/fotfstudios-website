-- Rate limiting genérico por clave (contador de ventana fija). Lo usa el route público
-- /api/applications para frenar spam por IP, pero la tabla/función son reutilizables.
--
-- La clave que entra ya viene hasheada (sha256 del IP + sal) desde el route: la DB nunca
-- ve la IP cruda. Ventana fija: cada llamada cae en un bucket = floor(epoch/window); el
-- contador se incrementa atómicamente y se compara contra el máximo. Los buckets vencidos
-- se limpian de forma oportunista en cada llamada (volumen bajo → costo despreciable).

create table rate_limit_counters (
  bucket_key text primary key,
  count      int not null default 0,
  expires_at timestamptz not null
);
create index rate_limit_counters_expires_idx on rate_limit_counters (expires_at);

alter table rate_limit_counters enable row level security;   -- sin policies: solo service-role
grant all privileges on rate_limit_counters to service_role;

-- Devuelve true si la llamada está DENTRO del límite (permitida), false si lo excede.
create function rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
as $$
declare
  v_bucket bigint := floor(extract(epoch from now()) / p_window_seconds)::bigint;
  v_key    text   := p_key || ':' || v_bucket::text;
  v_count  int;
begin
  delete from rate_limit_counters where expires_at < now();
  insert into rate_limit_counters (bucket_key, count, expires_at)
  values (v_key, 1, now() + make_interval(secs => p_window_seconds * 2))
  on conflict (bucket_key)
  do update set count = rate_limit_counters.count + 1
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

alter function rate_limit_hit(text, int, int) set search_path = public, pg_temp;
grant execute on function rate_limit_hit(text, int, int) to service_role;
