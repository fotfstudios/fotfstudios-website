-- /guia-dj — Guía de iniciación al DJing (PDF gratis a cambio de un email).
--
-- Un lead es un EMAIL, no una persona: la landing lo pide tres veces (hero, fragmento,
-- cierre) y la misma persona puede volver a pedirlo si el correo no le llegó. Por eso la
-- clave natural es `email` y el re-pedido NO crea filas: suma `request_count`, refresca
-- `last_requested_at` y conserva el `source` del primer toque (para saber qué formulario
-- convierte). El token de descarga es estable por email: el link del correo es el
-- artefacto durable; la URL firmada del bucket se emite recién al hacer clic (120 s).
--
-- PostgREST no puede expresar el `+1` atómico del upsert → RPC `guide_lead_request`.
-- Tabla y bucket son solo-service-role: RLS sin policies + sin grants a anon/authenticated.

create table guide_leads (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique
                     constraint guide_leads_email_valid
                     check (char_length(email) between 1 and 120 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  source             text not null
                     constraint guide_leads_source_valid check (source in ('hero', 'fragmento', 'cierre')),
  download_token     text not null unique default encode(extensions.gen_random_bytes(24), 'hex')
                     constraint guide_leads_token_valid check (download_token ~ '^[0-9a-f]{48}$'),
  request_count      integer not null default 1 check (request_count >= 1),
  created_at         timestamptz not null default now(),
  last_requested_at  timestamptz not null default now(),
  last_downloaded_at timestamptz
);
create index guide_leads_created_idx on guide_leads (created_at desc);

alter table guide_leads enable row level security;   -- sin policies: solo service-role
grant all privileges on guide_leads to service_role;

-- Alta o re-pedido en una sola ida. Devuelve el token (estable) y cuántas veces se pidió,
-- así el route sabe si es la primera vez sin una segunda consulta.
create function guide_lead_request(p_email text, p_source text)
returns table (id uuid, download_token text, request_count integer)
language sql
as $$
  insert into guide_leads (email, source)
  values (p_email, p_source)
  on conflict (email) do update
    set request_count     = guide_leads.request_count + 1,
        last_requested_at = now()
  returning guide_leads.id, guide_leads.download_token, guide_leads.request_count
$$;

alter function guide_lead_request(text, text) set search_path = public, pg_temp;
grant execute on function guide_lead_request(text, text) to service_role;

-- Bucket PRIVADO del PDF (el repo es público: el archivo nunca va a git). Sin policies en
-- storage.objects: solo el service role (server) firma URLs; anon/authenticated no ven
-- nada. Nunca `public = true`. El archivo se sube a mano (Studio) — ver DEPLOY.md.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guias', 'guias', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;
