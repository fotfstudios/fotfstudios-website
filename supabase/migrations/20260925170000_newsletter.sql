-- Newsletter "Sigue aprendiendo" (/curso-dj): avisos de guías y posts nuevos.
--
-- Tabla PROPIA, no una columna en guide_leads: un lead de guía pidió UN PDF ("solo para
-- enviarte la guía", /guia-pendrive-dj) y no aceptó correo recurrente; y su unicidad es
-- por guía. Aquí la clave natural es el correo, y el consentimiento es explícito.
--
-- ADITIVA: nada del código vivo la toca. Va sola, antes que el código que la usa
-- (ventana de aprobación del job `migrate`, incidente #183).

create table newsletter_subscribers (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique
                    constraint newsletter_subscribers_email_valid
                    check (char_length(email) between 1 and 120 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  -- Sección del sitio que originó el alta (p. ej. 'curso_dj'). Forma, no catálogo.
  source            text not null
                    constraint newsletter_subscribers_source_valid
                    check (char_length(source) between 2 and 24 and source ~ '^[a-z][a-z0-9_]*$'),
  -- Token durable del link de baja. Nunca cambia: un correo viejo sigue sirviendo.
  unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex')
                    constraint newsletter_subscribers_token_valid check (unsubscribe_token ~ '^[0-9a-f]{48}$'),
  -- Último consentimiento vigente. Un re-alta después de una baja lo renueva.
  consent_at        timestamptz not null default now(),
  unsubscribed_at   timestamptz,
  request_count     integer not null default 1 check (request_count >= 1),
  utm_source        text constraint newsletter_subscribers_utm_source_len   check (char_length(utm_source)   <= 120),
  utm_medium        text constraint newsletter_subscribers_utm_medium_len   check (char_length(utm_medium)   <= 120),
  utm_campaign      text constraint newsletter_subscribers_utm_campaign_len check (char_length(utm_campaign) <= 120),
  utm_content       text constraint newsletter_subscribers_utm_content_len  check (char_length(utm_content)  <= 120),
  utm_term          text constraint newsletter_subscribers_utm_term_len     check (char_length(utm_term)     <= 120),
  -- Solo el HOST del referente, nunca la URL completa.
  referrer_host     text constraint newsletter_subscribers_referrer_host_len check (char_length(referrer_host) <= 253),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index newsletter_subscribers_created_idx on newsletter_subscribers (created_at desc);

alter table newsletter_subscribers enable row level security;   -- sin policies: solo service-role
grant all privileges on newsletter_subscribers to service_role;

-- Alta o re-alta en una sola ida. `welcome` dice si corresponde el correo de bienvenida:
-- alta nueva o vuelta después de una baja — no un re-envío del formulario de alguien que
-- ya está suscrito (eso sería spamearle con cada clic). UTM: primer toque con datos.
create function newsletter_subscribe(
  p_email         text,
  p_source        text,
  p_utm_source    text default null,
  p_utm_medium    text default null,
  p_utm_campaign  text default null,
  p_utm_content   text default null,
  p_utm_term      text default null,
  p_referrer_host text default null
)
returns table (id uuid, unsubscribe_token text, welcome boolean)
language plpgsql
as $$
declare
  v_found boolean := false;
  v_prev  timestamptz;
begin
  select true, s.unsubscribed_at into v_found, v_prev
    from newsletter_subscribers s where s.email = p_email
    for update;

  return query
  insert into newsletter_subscribers as s (
    email, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host
  )
  values (
    p_email, p_source, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term, p_referrer_host
  )
  on conflict (email) do update
    set request_count   = s.request_count + 1,
        updated_at      = now(),
        consent_at      = case when s.unsubscribed_at is not null then now() else s.consent_at end,
        unsubscribed_at = null,
        utm_source    = coalesce(s.utm_source,    excluded.utm_source),
        utm_medium    = coalesce(s.utm_medium,    excluded.utm_medium),
        utm_campaign  = coalesce(s.utm_campaign,  excluded.utm_campaign),
        utm_content   = coalesce(s.utm_content,   excluded.utm_content),
        utm_term      = coalesce(s.utm_term,      excluded.utm_term),
        referrer_host = coalesce(s.referrer_host, excluded.referrer_host)
  returning s.id, s.unsubscribe_token, (not coalesce(v_found, false)) or v_prev is not null;
end;
$$;

alter function newsletter_subscribe(text,text,text,text,text,text,text,text)
  set search_path = public, pg_temp;
grant execute on function newsletter_subscribe(text,text,text,text,text,text,text,text)
  to service_role;

-- Baja idempotente por token. Devuelve el correo si el token existe (dada de baja ahora o
-- antes), null si no. Una segunda baja no pisa la fecha de la primera.
create function newsletter_unsubscribe(p_token text)
returns text
language sql
as $$
  update newsletter_subscribers
     set unsubscribed_at = coalesce(unsubscribed_at, now()),
         updated_at      = now()
   where unsubscribe_token = p_token
  returning email
$$;

alter function newsletter_unsubscribe(text) set search_path = public, pg_temp;
grant execute on function newsletter_unsubscribe(text) to service_role;
