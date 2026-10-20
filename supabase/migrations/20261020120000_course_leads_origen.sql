-- Origen de cada solicitud del curso: de qué anuncio (o no) llegó la persona.
--
-- Hasta hoy course_leads no guardaba nada de esto, así que no había cómo cruzar una
-- solicitud con Meta Ads o Google Ads: las plataformas cuentan "leads" con sus propias
-- reglas y la bandeja no podía confirmarlos ni desmentirlos.
--
-- Mismo patrón que guide_leads/newsletter_subscribers (5 UTM + host del referente) más
-- los click IDs que agregan las plataformas solas: gclid/gbraid/wbraid (Google Ads,
-- auto-tagging) y fbclid (Meta; ojo, también va en enlaces orgánicos). Todas nullable:
-- retrocompatible con el código anterior, que no las escribe (expand sin contract).

alter table course_leads
  add column utm_source    text constraint course_leads_utm_source_len    check (char_length(utm_source)    <= 120),
  add column utm_medium    text constraint course_leads_utm_medium_len    check (char_length(utm_medium)    <= 120),
  add column utm_campaign  text constraint course_leads_utm_campaign_len  check (char_length(utm_campaign)  <= 120),
  add column utm_content   text constraint course_leads_utm_content_len   check (char_length(utm_content)   <= 120),
  add column utm_term      text constraint course_leads_utm_term_len      check (char_length(utm_term)      <= 120),
  -- Solo el HOST del referente, nunca la URL completa.
  add column referrer_host text constraint course_leads_referrer_host_len check (char_length(referrer_host) <= 253),
  add column gclid         text,
  add column gbraid        text,
  add column wbraid        text,
  add column fbclid        text;

-- Espejo de CLICK_ID_RE / ATTRIBUTION_CAPS en src/domain/course/attribution.ts.
alter table course_leads
  add constraint course_leads_click_ids_charset check (
        (gclid  is null or (char_length(gclid)  <= 512 and gclid  ~ '^[A-Za-z0-9._-]+$'))
    and (gbraid is null or (char_length(gbraid) <= 512 and gbraid ~ '^[A-Za-z0-9._-]+$'))
    and (wbraid is null or (char_length(wbraid) <= 512 and wbraid ~ '^[A-Za-z0-9._-]+$'))
    and (fbclid is null or (char_length(fbclid) <= 512 and fbclid ~ '^[A-Za-z0-9._-]+$'))
  );

comment on column course_leads.gclid  is 'Google Ads click ID (auto-tagging). Prueba de clic pagado.';
comment on column course_leads.fbclid is 'Meta click ID. NO distingue pagado de orgánico: para eso, utm_medium.';
