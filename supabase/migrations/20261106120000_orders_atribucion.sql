-- Atribución y guardia de conversión en orders (PR1 de "conversiones de reserva").
--
-- Hasta hoy el embudo de reserva (orders/reservations) no guardaba NADA del origen:
-- ni UTM, ni click IDs, ni el client_id de GA4. Por eso una reserva pagada no se podía
-- acreditar al anuncio que la trajo, y la conversión servidor (GA4 + Google Ads + Meta,
-- que se dispara desde el webhook/confirmación) no tenía con qué atribuir. Los leads del
-- curso/guías ya guardan esto (ver course_leads); acá espejamos el mismo patrón para orders
-- y le sumamos las señales que la conversión servidor necesita: fbc/fbp, ga_client_id/
-- ga_session_id y la landing.
--
-- Todo nullable y aditivo (expand sin contract): retrocompatible con el código actual que
-- no escribe estas columnas. PR2 las empieza a llenar; PR3 las lee en emitBookingConversion.
--
-- conversions_sent_at es la GUARDIA DE IDEMPOTENCIA de PR3: se sella la primera vez que una
-- orden pagada emite su conversión, para que las re-entregas del webhook de Mercado Pago y
-- los múltiples puntos que marcan una orden como pagada (webhook, confirmación de transfer,
-- pago con puntos, flip del polling en /reserva/estado, cron de reconcile) emitan a lo sumo
-- una vez. Va en esta migración a propósito, para no partir el esquema en dos PR con
-- compuerta: PR3 es solo código.

alter table orders
  add column utm_source    text constraint orders_utm_source_len    check (char_length(utm_source)    <= 120),
  add column utm_medium    text constraint orders_utm_medium_len    check (char_length(utm_medium)    <= 120),
  add column utm_campaign  text constraint orders_utm_campaign_len  check (char_length(utm_campaign)  <= 120),
  add column utm_content   text constraint orders_utm_content_len   check (char_length(utm_content)   <= 120),
  add column utm_term      text constraint orders_utm_term_len      check (char_length(utm_term)      <= 120),
  -- Solo el HOST del referente, nunca la URL completa.
  add column referrer_host text constraint orders_referrer_host_len check (char_length(referrer_host) <= 253),
  -- Path + query de la landing (p. ej. "/reservar?utm_source=meta"). Lleva "/", "?", "&",
  -- "=", "%"… así que solo se limita el largo, nunca el charset de los click IDs.
  add column landing_path  text constraint orders_landing_path_len  check (char_length(landing_path)  <= 512),
  -- Click IDs de plataforma (prueba de clic). gclid/gbraid/wbraid: Google Ads. fbclid: Meta.
  add column gclid         text,
  add column gbraid        text,
  add column wbraid        text,
  add column fbclid        text,
  -- Cookies de Meta para la Conversions API: _fbc ("fb.1.<ts>.<fbclid>") y _fbp.
  add column fbc           text,
  add column fbp           text,
  -- GA4 Measurement Protocol: client_id (cookie _ga) + session_id para coser la sesión.
  add column ga_client_id  text,
  add column ga_session_id text,
  -- Idempotencia de la conversión servidor (PR3). Null = aún no emitida.
  add column conversions_sent_at timestamptz;

-- Espejo de CLICK_ID_RE / ATTRIBUTION_CAPS en src/domain/course/attribution.ts, extendido a
-- las señales nuevas. Todas son base64url + punto (fb.1.… y GA1.1.… también encajan). Un valor
-- raro o demasiado largo ya no sirve para atribuir: se rechaza al escribir, nunca se trunca.
alter table orders
  add constraint orders_attribution_charset check (
        (gclid         is null or (char_length(gclid)         <= 512 and gclid         ~ '^[A-Za-z0-9._-]+$'))
    and (gbraid        is null or (char_length(gbraid)        <= 512 and gbraid        ~ '^[A-Za-z0-9._-]+$'))
    and (wbraid        is null or (char_length(wbraid)        <= 512 and wbraid        ~ '^[A-Za-z0-9._-]+$'))
    and (fbclid        is null or (char_length(fbclid)        <= 512 and fbclid        ~ '^[A-Za-z0-9._-]+$'))
    and (fbc           is null or (char_length(fbc)           <= 512 and fbc           ~ '^[A-Za-z0-9._-]+$'))
    and (fbp           is null or (char_length(fbp)           <= 512 and fbp           ~ '^[A-Za-z0-9._-]+$'))
    and (ga_client_id  is null or (char_length(ga_client_id)  <= 128 and ga_client_id  ~ '^[A-Za-z0-9._-]+$'))
    and (ga_session_id is null or (char_length(ga_session_id) <=  64 and ga_session_id ~ '^[A-Za-z0-9._-]+$'))
  );

comment on column orders.gclid               is 'Google Ads click ID (auto-tagging). Prueba de clic pagado.';
comment on column orders.fbclid              is 'Meta click ID. NO distingue pagado de orgánico.';
comment on column orders.ga_client_id        is 'GA4 client_id (cookie _ga). Lo exige Measurement Protocol; si falta, PR3 acuña uno sintético por orden.';
comment on column orders.conversions_sent_at is 'Sellada al emitir la conversión servidor (GA4+Ads+Meta). Guardia de idempotencia; null = aún no emitida.';
