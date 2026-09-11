-- PIN de la cerradura Yale, de punta a punta.
--
-- Ya existían `access_code` y `access_sent_at` (20260626013738): el dueño
-- inventaba el código y el correo salía al instante. Esto completa el ciclo:
--
--   confirmada → la app GENERA el PIN → el dueño lo carga en Yale → marca "cargado"
--             → 10 min antes la app lo MANDA al cliente → sesión
--             → "quitar de la cerradura" → quitado
--
-- Sin las dos marcas nuevas no hay forma de saber en qué paso está cada reserva,
-- y sin `access_removed_at` la cerradura acumula un código válido por cliente
-- que pasó, en silencio.

-- ── 1. Estado del ciclo ──────────────────────────────────────────────────────
alter table reservations
  add column access_loaded_at  timestamptz,   -- el dueño confirmó que el PIN está en la Yale
  add column access_removed_at timestamptz;   -- el dueño confirmó que lo borró

-- Los códigos que ya se enviaron estaban necesariamente cargados: sin eso, el
-- modelo nuevo los mostraría como "sin cargar" y jamás como pendientes de quitar.
update reservations
   set access_loaded_at = access_sent_at
 where access_code is not null and access_sent_at is not null and access_loaded_at is null;

-- Forma del código. El rango 4-10 es el que el dueño describió y el que admite la
-- Yale; los 4 códigos que ya hay en prod son de 8 dígitos y pasan. El GENERADOR
-- produce 6 (decisión del dueño); el CHECK solo impide basura.
alter table reservations
  add constraint reservations_access_code_shape check (access_code is null or access_code ~ '^\d{4,10}$');

-- ── 2. Generación ────────────────────────────────────────────────────────────
-- 6 dígitos criptográficamente aleatorios (pgcrypto), nunca random(): un PIN de
-- puerta predecible es una puerta abierta. Descarta los obvios y exige unicidad
-- entre los códigos VIVOS (cargados y no quitados): dos iguales activos son
-- ambiguos y la Yale puede rechazar el duplicado.
create or replace function generate_access_code()
returns text language plpgsql
set search_path = public, pg_temp as $$
declare
  v_bytes bytea;
  v_n     bigint;
  v_code  text;
  v_try   int := 0;
begin
  loop
    v_try := v_try + 1;
    if v_try > 100 then raise exception 'access_code_exhausted'; end if;

    v_bytes := extensions.gen_random_bytes(4);
    v_n := (get_byte(v_bytes, 0)::bigint << 24) | (get_byte(v_bytes, 1)::bigint << 16)
         | (get_byte(v_bytes, 2)::bigint << 8)  |  get_byte(v_bytes, 3)::bigint;
    v_code := lpad((v_n % 1000000)::text, 6, '0');

    -- Obvios: todos iguales (000000, 111111…) y secuencias ascendentes/descendentes.
    continue when v_code ~ '^(\d)\1{5}$';
    continue when v_code in ('012345','123456','234567','345678','456789',
                             '987654','876543','765432','654321','543210');
    -- Único entre los vivos.
    continue when exists (select 1 from reservations
                           where access_code = v_code and access_removed_at is null);
    return v_code;
  end loop;
end;
$$;

-- ── 3. El scheduler: pg_cron → pg_net → /api/cron/access-codes ──────────────
-- Vercel Hobby solo admite crons diarios; mandar el PIN 10 minutos antes necesita
-- uno cada 5. La base lo hace sola. La URL del sitio y el CRON_SECRET viven en
-- Supabase Vault (nunca en git; difieren entre staging y prod). El dueño los
-- carga UNA vez por proyecto:
--
--   select vault.create_secret('https://www.fotfstudios.cl', 'site_url');
--   select vault.create_secret('<el mismo CRON_SECRET de Vercel>', 'cron_secret');
--
-- Sin los dos secretos la función es un no-op: así en local y en un proyecto
-- recién creado el job no falla cada 5 minutos, simplemente no hace nada.
create or replace function run_access_code_cron()
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
    url := rtrim(v_url, '/') || '/api/cron/access-codes',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 15000
  );
end;
$$;
revoke all on function run_access_code_cron() from public;

create extension if not exists pg_cron;
-- Con nombre, `cron.schedule` es idempotente: re-aplicar la migración actualiza el job.
select cron.schedule('access-codes', '*/5 * * * *', 'select public.run_access_code_cron()');
