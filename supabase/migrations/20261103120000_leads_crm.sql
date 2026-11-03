-- Sistema de seguimiento de leads (CRM) + motor de nurture por correo.
--
-- Unifica en UNA ficha por correo las cuatro vías de captación (guía, newsletter, solicitud de
-- curso, postulación DJ) más las altas manuales y las reservas/inscripciones pagadas. Dos ejes
-- INDEPENDIENTES por lead:
--   · embudo (stage) — manual: nuevo → contactado → interesado → ganado / perdido.
--   · nurture — automático: la secuencia de 4 correos (día 2/5/9/14) que ya vive en templates.ts.
-- Más atribución multi-toque (`lead_touches`) y una lista global de supresión de marketing
-- (`email_suppressions`), común a la baja de nurture y a la del newsletter.
--
-- Patrón idéntico al resto: tablas solo-service-role (RLS sin policies), RPCs con search_path
-- fijo, y el scheduler pg_cron → pg_net → /api/cron/outreach con los MISMOS secretos de Vault
-- (site_url, cron_secret) del whatsapp/calendar sync — el dueño no configura nada nuevo.
--
-- EXPANSIVA: ninguna tabla/función viva se modifica salvo `newsletter_unsubscribe` (se amplía para
-- suprimir también). El código que lee estas tablas llega en PR2/PR3, así que esta migración puede
-- aplicarse antes del deploy (ventana del job `migrate`, incidente #183).

-- ── 1. Lista global de supresión de marketing ─────────────────────────────────
-- Única fuente de verdad de "nunca mandar correo de MARKETING a este correo". Los transaccionales
-- (confirmación de reserva, curso) quedan exentos: no consultan esta tabla. La baja de nurture y la
-- del newsletter escriben acá, así una sola baja silencia todo el marketing a esa dirección.
create table email_suppressions (
  email      text primary key
             constraint email_suppressions_email_valid
             check (char_length(email) between 3 and 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  reason     text not null check (char_length(reason) between 1 and 60),
  source     text check (char_length(source) <= 60),
  created_at timestamptz not null default now()
);
alter table email_suppressions enable row level security;   -- sin policies: solo service-role
revoke all on email_suppressions from anon, authenticated;
grant all privileges on email_suppressions to service_role;

-- ── 2. Ficha unificada del lead (CRM) ─────────────────────────────────────────
-- Una fila por correo. `source` es el PRIMER toque (conveniencia); la historia completa vive en
-- lead_touches. `consent_at` null = NO inscrito en nurture (el barrido se apoya en esto).
create table leads (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique
                     constraint leads_email_valid
                     check (char_length(email) between 3 and 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  name               text constraint leads_name_len  check (char_length(name)  <= 160),
  phone              text constraint leads_phone_len check (char_length(phone) <= 40),
  -- Primer toque: 'guia:<slug>' | 'newsletter:<src>' | 'curso' | 'postulacion' | 'reserva' | 'manual'
  source             text constraint leads_source_len check (char_length(source) <= 60),

  -- Embudo manual.
  stage              text not null default 'nuevo'
                     constraint leads_stage_valid
                     check (stage in ('nuevo', 'contactado', 'interesado', 'ganado', 'perdido')),
  stage_updated_at   timestamptz,
  notes              text constraint leads_notes_len check (char_length(notes) <= 2000),
  assignee_member_id uuid references admin_members (id) on delete set null,

  -- Nurture (secuencia automática).
  enrolled_at        timestamptz,
  consent_at         timestamptz,
  unsubscribe_token  text not null unique default encode(extensions.gen_random_bytes(24), 'hex')
                     constraint leads_token_valid check (unsubscribe_token ~ '^[0-9a-f]{48}$'),
  unsubscribed_at    timestamptz,
  tip_sent_at        timestamptz,
  trial_sent_at      timestamptz,
  course_sent_at     timestamptz,
  checkin_sent_at    timestamptz,

  -- Atribución de primer toque (la historia completa, en lead_touches).
  utm_source    text constraint leads_utm_source_len   check (char_length(utm_source)   <= 120),
  utm_medium    text constraint leads_utm_medium_len   check (char_length(utm_medium)   <= 120),
  utm_campaign  text constraint leads_utm_campaign_len check (char_length(utm_campaign) <= 120),
  utm_content   text constraint leads_utm_content_len  check (char_length(utm_content)  <= 120),
  utm_term      text constraint leads_utm_term_len     check (char_length(utm_term)     <= 120),
  referrer_host text constraint leads_referrer_host_len check (char_length(referrer_host) <= 253),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_created_idx       on leads (created_at desc);
create index leads_stage_idx         on leads (stage, created_at desc);
create index leads_assignee_idx      on leads (assignee_member_id) where assignee_member_id is not null;
-- Candidatos del barrido: inscritos (consent), sin baja, con algún paso por mandar.
create index leads_nurture_due_idx   on leads (enrolled_at)
  where consent_at is not null and unsubscribed_at is null;

alter table leads enable row level security;   -- sin policies: solo service-role
revoke all on leads from anon, authenticated;
grant all privileges on leads to service_role;

-- ── 3. Historia de toques (atribución multi-toque) ────────────────────────────
-- Cada interacción se APPEND-ea, nunca se deduplica: un re-pedido de guía o un segundo origen son
-- toques legítimos nuevos. leads.source = origen del toque más antiguo.
create table lead_touches (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads (id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  kind          text not null
                constraint lead_touches_kind_valid
                check (kind in (
                  'guia_download', 'newsletter_subscribe', 'curso_solicitud', 'dj_application',
                  'booking_paid', 'course_enrolled', 'manual', 'nurture_sent', 'unsubscribe',
                  'stage_change', 'enroll'
                )),
  source        text constraint lead_touches_source_len check (char_length(source) <= 60),
  utm_source    text constraint lead_touches_utm_source_len   check (char_length(utm_source)   <= 120),
  utm_medium    text constraint lead_touches_utm_medium_len   check (char_length(utm_medium)   <= 120),
  utm_campaign  text constraint lead_touches_utm_campaign_len check (char_length(utm_campaign) <= 120),
  utm_content   text constraint lead_touches_utm_content_len  check (char_length(utm_content)  <= 120),
  utm_term      text constraint lead_touches_utm_term_len     check (char_length(utm_term)     <= 120),
  referrer_host text constraint lead_touches_referrer_host_len check (char_length(referrer_host) <= 253),
  detail        jsonb
);
create index lead_touches_lead_idx on lead_touches (lead_id, occurred_at desc);

alter table lead_touches enable row level security;   -- sin policies: solo service-role
revoke all on lead_touches from anon, authenticated;
grant all privileges on lead_touches to service_role;

-- ── 4. Supresión ──────────────────────────────────────────────────────────────
create or replace function suppress_email(p_email text, p_reason text, p_source text default null)
returns void language sql
set search_path = public, pg_temp as $$
  insert into email_suppressions (email, reason, source)
  values (lower(p_email), p_reason, p_source)
  on conflict (email) do nothing;
$$;

create or replace function is_email_suppressed(p_email text)
returns boolean language sql stable
set search_path = public, pg_temp as $$
  select exists (select 1 from email_suppressions where email = lower(p_email));
$$;

-- ── 5. Alta / upsert de ficha + toque ─────────────────────────────────────────
-- Upsert por correo: identidad y `source` de primer toque solo cuando faltan; NUNCA pisa
-- stage/notes/assignee/consent. Siempre append-ea un toque. Devuelve el id de la ficha.
create or replace function lead_upsert(
  p_email         text,
  p_name          text default null,
  p_phone         text default null,
  p_source        text default null,
  p_kind          text default 'manual',
  p_utm_source    text default null,
  p_utm_medium    text default null,
  p_utm_campaign  text default null,
  p_utm_content   text default null,
  p_utm_term      text default null,
  p_referrer_host text default null,
  p_detail        jsonb default null
)
returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  insert into leads (
    email, name, phone, source,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host
  )
  values (
    lower(p_email), p_name, p_phone, p_source,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term, p_referrer_host
  )
  on conflict (email) do update
    set name          = coalesce(leads.name, excluded.name),
        phone         = coalesce(leads.phone, excluded.phone),
        source        = coalesce(leads.source, excluded.source),
        utm_source    = coalesce(leads.utm_source,    excluded.utm_source),
        utm_medium    = coalesce(leads.utm_medium,    excluded.utm_medium),
        utm_campaign  = coalesce(leads.utm_campaign,  excluded.utm_campaign),
        utm_content   = coalesce(leads.utm_content,   excluded.utm_content),
        utm_term      = coalesce(leads.utm_term,      excluded.utm_term),
        referrer_host = coalesce(leads.referrer_host, excluded.referrer_host),
        updated_at    = now()
  returning id into v_id;

  insert into lead_touches (
    lead_id, kind, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host, detail
  )
  values (
    v_id, p_kind, p_source, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_referrer_host, p_detail
  );
  return v_id;
end;
$$;

-- Toque suelto para eventos que no son captación (envío de nurture, baja, pago).
create or replace function lead_record_touch(p_email text, p_kind text, p_detail jsonb default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  select id into v_id from leads where email = lower(p_email);
  if v_id is null then return; end if;
  insert into lead_touches (lead_id, kind, detail) values (v_id, p_kind, p_detail);
end;
$$;

-- ── 6. Nurture: inscripción, reclamo de paso, candidatos, baja ────────────────
-- Inscribe (opt-in). Idempotente: conserva el enrolled_at/consent original. No resetea los pasos
-- ya enviados: una re-inscripción reanuda, no re-spamea.
--
-- `p_clear_suppression` separa DOS caminos, porque reactivar un correo es una acción con
-- autoridad: un POST público (newsletter/guía) NUNCA puede revivir la baja de un tercero ni
-- borrar su supresión global —solo inscribe fichas limpias—, mientras que la acción autenticada
-- del admin sí reactiva a propósito. Sin esta separación, cualquiera re-suscribe a una víctima
-- mandando su correo al formulario.
create or replace function nurture_enroll(
  p_email text,
  p_source text,
  p_consent_at timestamptz default now(),
  p_clear_suppression boolean default false
)
returns void language plpgsql
set search_path = public, pg_temp as $$
begin
  if p_clear_suppression then
    -- Admin (autenticado): reactiva una baja previa y limpia la supresión global a propósito.
    update leads
       set consent_at      = coalesce(consent_at, p_consent_at),
           enrolled_at     = coalesce(enrolled_at, now()),
           source          = coalesce(source, p_source),
           unsubscribed_at = null,
           updated_at      = now()
     where email = lower(p_email);
    if found then
      delete from email_suppressions where email = lower(p_email);
    end if;
  else
    -- Público (sin autenticar): respeta la baja y la supresión. Solo inscribe una ficha que
    -- no se dio de baja y no está suprimida; nunca las revierte.
    update leads
       set consent_at  = coalesce(consent_at, p_consent_at),
           enrolled_at = coalesce(enrolled_at, now()),
           source      = coalesce(source, p_source),
           updated_at  = now()
     where email = lower(p_email)
       and unsubscribed_at is null
       and not exists (select 1 from email_suppressions s where s.email = lower(p_email));
  end if;
end;
$$;

-- Reclama UN paso: lo marca enviado solo si estaba null. true = esta corrida lo marcó.
create or replace function nurture_claim_step(p_id uuid, p_step text)
returns boolean language plpgsql
set search_path = public, pg_temp as $$
begin
  update leads
     set tip_sent_at     = case when p_step = 'tip'     then now() else tip_sent_at     end,
         trial_sent_at   = case when p_step = 'trial'   then now() else trial_sent_at   end,
         course_sent_at  = case when p_step = 'course'  then now() else course_sent_at  end,
         checkin_sent_at = case when p_step = 'checkin' then now() else checkin_sent_at end,
         updated_at      = now()
   where id = p_id
     and ((p_step = 'tip'     and tip_sent_at     is null)
       or (p_step = 'trial'   and trial_sent_at   is null)
       or (p_step = 'course'  and course_sent_at  is null)
       or (p_step = 'checkin' and checkin_sent_at is null));
  return found;
end;
$$;

-- Suelta el reclamo si el envío falló (vuelve el paso a null).
create or replace function nurture_release_step(p_id uuid, p_step text)
returns void language plpgsql
set search_path = public, pg_temp as $$
begin
  update leads
     set tip_sent_at     = case when p_step = 'tip'     then null else tip_sent_at     end,
         trial_sent_at   = case when p_step = 'trial'   then null else trial_sent_at   end,
         course_sent_at  = case when p_step = 'course'  then null else course_sent_at  end,
         checkin_sent_at = case when p_step = 'checkin' then null else checkin_sent_at end,
         updated_at      = now()
   where id = p_id;
end;
$$;

-- Candidatos del barrido: inscritos, sin baja, no suprimidos y con AL MENOS un paso pendiente.
-- Qué paso toca lo decide nextStepDue() en TS (fuente única del calendario), igual que el
-- seguimiento de créditos de prueba (liveCandidates + noticeDue).
create or replace function nurture_candidates(p_limit int default 200)
returns setof leads language sql stable
set search_path = public, pg_temp as $$
  select l.*
    from leads l
   where l.consent_at is not null
     and l.unsubscribed_at is null
     and not (l.tip_sent_at is not null and l.trial_sent_at is not null
              and l.course_sent_at is not null and l.checkin_sent_at is not null)
     and not exists (select 1 from email_suppressions s where s.email = l.email)
   order by l.enrolled_at
   limit p_limit;
$$;

-- Baja por token: marca la ficha, la suprime globalmente y deja un toque. Idempotente.
-- Devuelve el correo si el token existe, null si no (misma forma que newsletter_unsubscribe).
create or replace function nurture_unsubscribe(p_token text)
returns text language plpgsql
set search_path = public, pg_temp as $$
declare
  v_id    uuid;
  v_email text;
begin
  update leads
     set unsubscribed_at = coalesce(unsubscribed_at, now()),
         updated_at      = now()
   where unsubscribe_token = p_token
  returning id, email into v_id, v_email;
  if v_id is null then return null; end if;
  perform suppress_email(v_email, 'nurture', 'baja');
  insert into lead_touches (lead_id, kind) values (v_id, 'unsubscribe');
  return v_email;
end;
$$;

-- ── 7. Embudo: stage manual, asignación, avance automático ────────────────────
create or replace function lead_set_stage(p_email text, p_stage text)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_id  uuid;
  v_old text;
begin
  select id, stage into v_id, v_old from leads where email = lower(p_email) for update;
  if v_id is null then return; end if;
  if v_old is distinct from p_stage then
    update leads set stage = p_stage, stage_updated_at = now(), updated_at = now() where id = v_id;
    insert into lead_touches (lead_id, kind, detail)
    values (v_id, 'stage_change', jsonb_build_object('stage_from', v_old, 'stage_to', p_stage));
  end if;
end;
$$;

create or replace function lead_set_notes(p_email text, p_notes text)
returns void language sql
set search_path = public, pg_temp as $$
  update leads set notes = nullif(p_notes, ''), updated_at = now() where email = lower(p_email);
$$;

create or replace function lead_assign(p_email text, p_member_id uuid)
returns void language sql
set search_path = public, pg_temp as $$
  update leads set assignee_member_id = p_member_id, updated_at = now() where email = lower(p_email);
$$;

-- Avance AUTOMÁTICO (pago, primer correo). Solo hacia adelante: avanza si rank(target) > rank(actual)
-- y la etapa actual no es terminal. 'perdido' es solo-manual; nunca degrada un 'ganado' manual.
create or replace function lead_advance_stage(p_email text, p_target text)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_id   uuid;
  v_old  text;
  v_rank_old int;
  v_rank_new int;
begin
  if p_target not in ('contactado', 'interesado', 'ganado') then return; end if;
  select id, stage into v_id, v_old from leads where email = lower(p_email) for update;
  if v_id is null then return; end if;
  if v_old in ('ganado', 'perdido') then return; end if;
  v_rank_old := case v_old when 'nuevo' then 0 when 'contactado' then 1 when 'interesado' then 2 when 'ganado' then 3 else 0 end;
  v_rank_new := case p_target when 'contactado' then 1 when 'interesado' then 2 when 'ganado' then 3 else 0 end;
  if v_rank_new <= v_rank_old then return; end if;
  update leads set stage = p_target, stage_updated_at = now(), updated_at = now() where id = v_id;
  insert into lead_touches (lead_id, kind, detail)
  values (v_id, 'stage_change', jsonb_build_object('stage_from', v_old, 'stage_to', p_target, 'auto', true));
end;
$$;

-- ── 8. Permisos de ejecución ──────────────────────────────────────────────────
revoke execute on function suppress_email(text, text, text)            from public, anon, authenticated;
revoke execute on function is_email_suppressed(text)                   from public, anon, authenticated;
revoke execute on function lead_upsert(text,text,text,text,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function lead_record_touch(text, text, jsonb)        from public, anon, authenticated;
revoke execute on function nurture_enroll(text, text, timestamptz, boolean)     from public, anon, authenticated;
revoke execute on function nurture_claim_step(uuid, text)              from public, anon, authenticated;
revoke execute on function nurture_release_step(uuid, text)            from public, anon, authenticated;
revoke execute on function nurture_candidates(int)                     from public, anon, authenticated;
revoke execute on function nurture_unsubscribe(text)                   from public, anon, authenticated;
revoke execute on function lead_set_stage(text, text)                  from public, anon, authenticated;
revoke execute on function lead_set_notes(text, text)                  from public, anon, authenticated;
revoke execute on function lead_assign(text, uuid)                     from public, anon, authenticated;
revoke execute on function lead_advance_stage(text, text)              from public, anon, authenticated;
grant execute on function suppress_email(text, text, text)            to service_role;
grant execute on function is_email_suppressed(text)                   to service_role;
grant execute on function lead_upsert(text,text,text,text,text,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function lead_record_touch(text, text, jsonb)        to service_role;
grant execute on function nurture_enroll(text, text, timestamptz, boolean)     to service_role;
grant execute on function nurture_claim_step(uuid, text)              to service_role;
grant execute on function nurture_release_step(uuid, text)            to service_role;
grant execute on function nurture_candidates(int)                     to service_role;
grant execute on function nurture_unsubscribe(text)                   to service_role;
grant execute on function lead_set_stage(text, text)                  to service_role;
grant execute on function lead_set_notes(text, text)                  to service_role;
grant execute on function lead_assign(text, uuid)                     to service_role;
grant execute on function lead_advance_stage(text, text)              to service_role;

-- ── 9. Ampliar la baja del newsletter para suprimir también ───────────────────
-- Una baja (de cualquier canal) silencia TODO el marketing. Conserva la firma y el grant.
create or replace function newsletter_unsubscribe(p_token text)
returns text language plpgsql
set search_path = public, pg_temp as $$
declare
  v_email text;
begin
  update newsletter_subscribers
     set unsubscribed_at = coalesce(unsubscribed_at, now()),
         updated_at      = now()
   where unsubscribe_token = p_token
  returning email into v_email;
  if v_email is not null then
    perform suppress_email(v_email, 'newsletter', 'baja');
  end if;
  return v_email;
end;
$$;

-- ── 10. Backfill: una ficha por correo desde las 4 vías existentes ────────────
-- Dedup por correo, el origen del toque más antiguo gana el primer toque, nombre/teléfono más
-- rico se conserva. `on conflict do nothing`: idempotente si la migración se re-aplica.
with src as (
  select lower(email) as email, null::text as name, null::text as phone,
         'guia:' || guide_slug as source, created_at,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host
    from guide_leads
  union all
  select lower(email), null, null, 'newsletter:' || source, created_at,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host
    from newsletter_subscribers
  union all
  select lower(email), name, phone, 'curso', created_at, null, null, null, null, null, null
    from course_leads
  union all
  select lower(email), name, phone, 'postulacion', created_at, null, null, null, null, null, null
    from dj_applications
),
agg as (
  select email,
         (array_agg(name  order by created_at) filter (where name  is not null))[1] as name,
         (array_agg(phone order by created_at) filter (where phone is not null))[1] as phone,
         (array_agg(source order by created_at))[1] as source,
         min(created_at) as created_at,
         (array_agg(utm_source   order by created_at) filter (where utm_source   is not null))[1] as utm_source,
         (array_agg(utm_medium   order by created_at) filter (where utm_medium   is not null))[1] as utm_medium,
         (array_agg(utm_campaign order by created_at) filter (where utm_campaign is not null))[1] as utm_campaign,
         (array_agg(utm_content  order by created_at) filter (where utm_content  is not null))[1] as utm_content,
         (array_agg(utm_term     order by created_at) filter (where utm_term     is not null))[1] as utm_term,
         (array_agg(referrer_host order by created_at) filter (where referrer_host is not null))[1] as referrer_host
    from src
   group by email
)
insert into leads (email, name, phone, source, created_at, updated_at,
                   utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host)
select email, name, phone, source, created_at, created_at,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host
  from agg
on conflict (email) do nothing;

-- Un toque por fila de origen existente (misma fecha + UTM; guía lleva su conteo en detail).
insert into lead_touches (lead_id, kind, source, occurred_at,
                          utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host, detail)
select l.id, t.kind, t.source, t.occurred_at,
       t.utm_source, t.utm_medium, t.utm_campaign, t.utm_content, t.utm_term, t.referrer_host, t.detail
  from (
    select lower(email) as email, 'guia_download' as kind, 'guia:' || guide_slug as source, created_at as occurred_at,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host,
           jsonb_build_object('guide_slug', guide_slug, 'request_count', request_count) as detail
      from guide_leads
    union all
    select lower(email), 'newsletter_subscribe', 'newsletter:' || source, created_at,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host, null
      from newsletter_subscribers
    union all
    select lower(email), 'curso_solicitud', 'curso', created_at, null, null, null, null, null, null,
           jsonb_build_object('plan', plan)
      from course_leads
    union all
    select lower(email), 'dj_application', 'postulacion', created_at, null, null, null, null, null, null, null
      from dj_applications
  ) t
  join leads l on l.email = t.email;

-- Supresión de los que ya se dieron de baja del newsletter.
insert into email_suppressions (email, reason, source, created_at)
select lower(email), 'newsletter', 'backfill', unsubscribed_at
  from newsletter_subscribers
 where unsubscribed_at is not null
on conflict (email) do nothing;

-- ── 11. Permiso RBAC de /admin/leads ──────────────────────────────────────────
-- NO se otorga a ningún rol (como whatsapp.manage/calendar.manage): super_admin lo tiene por definición.
insert into admin_permissions (key, label)
values ('leads.manage', 'Gestionar leads')
on conflict (key) do nothing;

-- ── 12. Scheduler: pg_cron → pg_net → /api/cron/outreach ──────────────────────
-- Copia de run_whatsapp_outbox_cron() con los MISMOS secretos de Vault. Sin ellos, no-op (local).
create extension if not exists pg_net with schema extensions;
create or replace function run_outreach_cron()
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
    url := rtrim(v_url, '/') || '/api/cron/outreach',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 15000
  );
end;
$$;
revoke all on function run_outreach_cron() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('outreach', '*/5 * * * *', 'select public.run_outreach_cron()');
