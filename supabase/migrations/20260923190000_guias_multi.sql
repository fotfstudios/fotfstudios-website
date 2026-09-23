-- Multi-guía: /guia-dj deja de ser LA guía y pasa a ser la PRIMERA.
--
-- Hasta acá un lead era un correo global: `unique (email)` decía "una persona, una guía".
-- Con 3–6 imanes la clave natural es (guía, correo): la misma persona puede pedir varias y
-- cada fila lleva SU token, porque el link del correo es durable y apunta a UN PDF.
--
-- ADITIVA Y COMPATIBLE HACIA ATRÁS A PROPÓSITO. El código vivo en producción llama
-- `guide_lead_request(email, source)` y lo va a seguir llamando durante TODA la ventana de
-- aprobación del job `migrate`. Esa función sobrevive como wrapper de la nueva
-- (`guide_lead_capture`) fijando guide_slug = 'guia-dj'. Se borra en una migración de
-- contracción posterior, cuando ya nadie la llame (incidente #183).
--
-- NO PARTIR ESTE ARCHIVO. El `drop constraint guide_leads_email_key` y el
-- `create or replace function guide_lead_request` tienen que ir en la MISMA transacción:
-- entre uno y otro, el `on conflict (email)` del cuerpo viejo no tiene índice que inferir
-- y cada pedido de la landing revienta con 42P10. Y como el cuerpo es un literal $$ (no
-- BEGIN ATOMIC), Postgres NO registra la dependencia y el DROP pasa en silencio: la falla
-- aparece recién en runtime.

-- ── 1. La guía a la que pertenece el lead ────────────────────────────────────────────
-- Default constante ⇒ PG11+ lo resuelve con attmissingval, sin reescribir la tabla.
alter table guide_leads add column guide_slug text not null default 'guia-dj';

-- CHECK de FORMA, no de catálogo: el registro de guías vive en TypeScript (lib/guides.ts)
-- y una guía nueva no puede necesitar una migración para existir.
alter table guide_leads add constraint guide_leads_guide_slug_valid
  check (char_length(guide_slug) between 3 and 40
         and guide_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
alter table guide_leads validate constraint guide_leads_guide_slug_valid;

-- ── 2. Unicidad: de (email) a (guide_slug, email) ────────────────────────────────────
-- El índice nuevo se crea ANTES de soltar el viejo: nunca hay un instante sin unicidad.
-- (No se puede usar CREATE INDEX CONCURRENTLY: no corre dentro de una transacción. Da
-- igual acá — la tabla es chica —, pero tenerlo presente si algún día crece.)
create unique index guide_leads_guide_email_key on guide_leads (guide_slug, email);
alter table guide_leads drop constraint if exists guide_leads_email_key;

-- Filtro por guía del admin. guide_leads_created_idx se queda: lo usa la pestaña "Todas".
create index guide_leads_guide_created_idx on guide_leads (guide_slug, created_at desc);

-- ── 3. `source` deja de ser un catálogo cerrado ──────────────────────────────────────
-- ('hero','fragmento','cierre') eran el layout de ESTA landing. Cada guía declara los
-- suyos en lib/guides.ts y parseGuideLead los valida contra esa lista. La base conserva la
-- validación que sí le corresponde: forma y largo (un `source` termina en el CSV del admin).
--
-- OJO: esto es un aflojamiento de una sola vía. Desde acá, un `source` con typo entra sin
-- chistar y se ve como string crudo en el admin; el backstop pasa a ser parseGuideLead.
alter table guide_leads drop constraint guide_leads_source_valid;
alter table guide_leads add constraint guide_leads_source_valid
  check (char_length(source) between 2 and 24
         and source ~ '^[a-z][a-z0-9_]*$') not valid;
alter table guide_leads validate constraint guide_leads_source_valid;

-- ── 4. Semilla para una secuencia futura — para NO tener que backfillear después ──────
-- UTM en columnas discretas y no en un jsonb: el destino de estos datos es el CSV del
-- admin y la herramienta de correo, donde una columna es una columna. Largo acotado
-- porque vienen de la query string, o sea del atacante.
alter table guide_leads
  add column utm_source   text constraint guide_leads_utm_source_len   check (char_length(utm_source)   <= 120),
  add column utm_medium   text constraint guide_leads_utm_medium_len   check (char_length(utm_medium)   <= 120),
  add column utm_campaign text constraint guide_leads_utm_campaign_len check (char_length(utm_campaign) <= 120),
  add column utm_content  text constraint guide_leads_utm_content_len  check (char_length(utm_content)  <= 120),
  add column utm_term     text constraint guide_leads_utm_term_len     check (char_length(utm_term)     <= 120),
  -- Solo el HOST del referente, nunca la URL completa (puede llevar datos en la query).
  add column referrer_host text constraint guide_leads_referrer_host_len check (char_length(referrer_host) <= 253),
  -- Cuándo esta persona aceptó recibir correo. Primer toque, nunca se pisa.
  add column consent_at timestamptz default now();

-- Backfill honesto: el consentimiento de los leads que ya existen es su primer pedido.
update guide_leads set consent_at = created_at where consent_at is null;
alter table guide_leads alter column consent_at set not null;

-- ── 5. El RPC nuevo ──────────────────────────────────────────────────────────────────
-- Misma idea que el anterior (alta o re-pedido en una sola ida, token estable, `source` de
-- primer toque) con la guía como parte de la clave. Los UTM son "primer toque CON datos":
-- coalesce, no overwrite — si el primer pedido llegó directo y el segundo por campaña, la
-- atribución útil es la campaña.
create function guide_lead_capture(
  p_email         text,
  p_source        text,
  p_guide         text,
  p_utm_source    text default null,
  p_utm_medium    text default null,
  p_utm_campaign  text default null,
  p_utm_content   text default null,
  p_utm_term      text default null,
  p_referrer_host text default null
)
returns table (id uuid, download_token text, request_count integer)
language sql
as $$
  insert into guide_leads (
    email, source, guide_slug,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host
  )
  values (
    p_email, p_source, p_guide,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term, p_referrer_host
  )
  on conflict (guide_slug, email) do update
    set request_count     = guide_leads.request_count + 1,
        last_requested_at = now(),
        utm_source    = coalesce(guide_leads.utm_source,    excluded.utm_source),
        utm_medium    = coalesce(guide_leads.utm_medium,    excluded.utm_medium),
        utm_campaign  = coalesce(guide_leads.utm_campaign,  excluded.utm_campaign),
        utm_content   = coalesce(guide_leads.utm_content,   excluded.utm_content),
        utm_term      = coalesce(guide_leads.utm_term,      excluded.utm_term),
        referrer_host = coalesce(guide_leads.referrer_host, excluded.referrer_host)
  returning guide_leads.id, guide_leads.download_token, guide_leads.request_count
$$;

alter function guide_lead_capture(text,text,text,text,text,text,text,text,text)
  set search_path = public, pg_temp;
grant execute on function guide_lead_capture(text,text,text,text,text,text,text,text,text)
  to service_role;

-- ── 6. Wrapper compatible (se borra en la contracción) ───────────────────────────────
-- MISMA firma ⇒ el código vivo en producción sigue funcionando el instante en que esta
-- migración aplica, y ahora escribe guide_slug = 'guia-dj'. `create or replace` conserva
-- el grant a service_role.
--
-- Nombre nuevo para la función real, NO una sobrecarga con default: una sobrecarga la
-- resuelve Postgres de forma ambigua contra la de 2 argumentos, `supabase gen types` la
-- emite como unión en Args, y PostgREST elige según las claves del JSON — así una clave
-- con typo seleccionaría en silencio la función equivocada.
create or replace function guide_lead_request(p_email text, p_source text)
returns table (id uuid, download_token text, request_count integer)
language sql
as $$
  select * from guide_lead_capture(p_email, p_source, 'guia-dj')
$$;

-- IMPRESCINDIBLE. `create or replace` conserva dueño y permisos pero RESETEA los
-- parámetros de configuración, así que sin esta línea el wrapper se queda SIN el
-- search_path que la migración original le había fijado (20260915130000, línea 46).
-- La función seguiría andando igual: solo quedaría menos protegida contra search_path
-- injection, estando expuesta por PostgREST. No falla nada — por eso solo lo caza un
-- diff del esquema, no una prueba.
alter function guide_lead_request(text, text) set search_path = public, pg_temp;
