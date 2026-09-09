-- Seed SOLO local (corre en `db:reset`, nunca en prod). Bootstrap del super admin:
-- crea el usuario de auth + su identidad email + la fila admin_members super_admin,
-- para entrar por magic link sin depender de signup público (deshabilitado).
-- En PROD este bootstrap se hace aparte (insertar la fila admin_members del dueño).
do $$
declare
  v_uid  uuid := '00000000-0000-0000-0000-0000000000a1';
  v_role uuid;
begin
  select id into v_role from admin_roles where key = 'super_admin';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'benjamin@fotfstudios.cl', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'benjamin@fotfstudios.cl', 'email_verified', true),
    'email', now(), now(), now()
  ) on conflict do nothing;

  insert into admin_members (email, user_id, role_id, status)
  values ('benjamin@fotfstudios.cl', v_uid, v_role, 'active')
  on conflict (email) do update set user_id = excluded.user_id, role_id = excluded.role_id, status = 'active';
end $$;

-- Datos demo SOLO local: pobla reservas/pedidos/boletas/bloqueos + un miembro
-- staff, para que el panel /admin tenga contenido al probar. Idempotente (UUIDs
-- fijos + on conflict do nothing). Horas ancladas a America/Santiago y relativas
-- a hoy, así las reservas siguen siendo "próximas". Respeta el anti-solape:
-- cada reserva activa (held/confirmed/block) va en un día/hora distinto.
do $$
declare
  v_res    uuid;   -- recurso único (sala)
  v_staff  uuid;   -- rol staff
  v_suid   uuid := '00000000-0000-0000-0000-0000000000a2';  -- usuario auth staff
  v_cuid   uuid := '00000000-0000-0000-0000-0000000000a3';  -- usuario auth del cliente demo con cuenta (Felipe)
begin
  select id into v_res from resources limit 1;
  select id into v_staff from admin_roles where key = 'staff';

  -- ── Cliente con cuenta (auth + identidad) — ANTES de customers (FK auth_user_id) ──
  -- Login local: /cuenta/login con felipe.munoz@outlook.cl → magic link en Mailpit (:54424).
  -- Su ficha lleva id = auth_user_id = v_cuid, como toda fila de titular creada antes del
  -- directorio: el upsert-por-id vigente (hasta PR2) la actualiza sin chocar con el email.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_cuid, 'authenticated', 'authenticated',
    'felipe.munoz@outlook.cl', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), v_cuid::text, v_cuid,
    jsonb_build_object('sub', v_cuid::text, 'email', 'felipe.munoz@outlook.cl', 'email_verified', true),
    'email', now(), now(), now()
  ) on conflict do nothing;

  -- ── Clientes (directorio) — ANTES de pedidos/reservas (FK customer_id) ──
  -- Emails en minúsculas (customers_email_lower); teléfonos como se tipean (phone_digits los deriva).
  -- Felipe (titular) usa v_cuid como id (= auth_user_id); los invitados llevan ids …f1, …f2, …f4..f7.
  -- …f7 es solo-teléfono (sin email → sin puntos hasta que se le agregue uno).
  insert into customers (id, email, name, phone, auth_user_id) values
    ('00000000-0000-0000-0000-0000000000f1','matias.rojas@gmail.com',   'Matías Rojas',   '+56 9 8123 4567', null),
    ('00000000-0000-0000-0000-0000000000f2','catalina.soto@gmail.com',  'Catalina Soto',  '+56 9 7654 3210', null),
    (v_cuid,                                'felipe.munoz@outlook.cl',  'Felipe Muñoz',   '+56 9 9988 7766', v_cuid),
    ('00000000-0000-0000-0000-0000000000f4','valentina.diaz@gmail.com', 'Valentina Díaz', '+56 9 6543 2109', null),
    ('00000000-0000-0000-0000-0000000000f5','ignacio.fuentes@gmail.com','Ignacio Fuentes','+56 9 5512 3344', null),
    ('00000000-0000-0000-0000-0000000000f6','camila.vera@gmail.com',    'Camila Vera',    '+56 9 4433 2211', null),
    ('00000000-0000-0000-0000-0000000000f7', null,                      'Pía Contreras',  '+56912345678',    null)
  on conflict (id) do nothing;

  -- ── Pedidos (snapshot/monto congelados; net+tax=amount, IVA 19% incluido) ──
  -- INVARIANTE: customer_id + snapshot copiados de la ficha (mismo nombre/email/teléfono).
  insert into orders (id, status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot,
                      mp_payment_id, paid_at, created_at, customer_id) values
    -- 1) próxima, pagada
    ('00000000-0000-0000-0000-0000000000c1','paid','CLP',39980,33597,6383,
     'Matías Rojas','matias.rojas@gmail.com','+56 9 8123 4567',
     '{"tier":"puntaSemana","hours":2}'::jsonb,'mp_demo_0001', now() - interval '2 days', now() - interval '2 days',
     '00000000-0000-0000-0000-0000000000f1'),
    -- 2) próxima, pagada
    ('00000000-0000-0000-0000-0000000000c2','paid','CLP',29980,25193,4787,
     'Catalina Soto','catalina.soto@gmail.com','+56 9 7654 3210',
     '{"tier":"valle","hours":2}'::jsonb,'mp_demo_0002', now() - interval '1 day', now() - interval '1 day',
     '00000000-0000-0000-0000-0000000000f2'),
    -- 3) próxima, pagada, con addon audio+video
    ('00000000-0000-0000-0000-0000000000c3','paid','CLP',89970,75605,14365,
     'Felipe Muñoz','felipe.munoz@outlook.cl','+56 9 9988 7766',
     '{"tier":"puntaSemana","hours":2,"addons":["audioVideo"]}'::jsonb,'mp_demo_0003', now() - interval '3 hours', now() - interval '3 hours',
     v_cuid),
    -- 4) pasada, cumplida
    ('00000000-0000-0000-0000-0000000000c4','fulfilled','CLP',19980,16790,3190,
     'Valentina Díaz','valentina.diaz@gmail.com','+56 9 6543 2109',
     '{"tier":"valle","hours":2}'::jsonb,'mp_demo_0004', now() - interval '5 days', now() - interval '5 days',
     '00000000-0000-0000-0000-0000000000f4'),
    -- 5) pendiente de pago (hold activo)
    ('00000000-0000-0000-0000-0000000000c5','pending_payment','CLP',19990,16798,3192,
     'Ignacio Fuentes','ignacio.fuentes@gmail.com','+56 9 5512 3344',
     '{"tier":"puntaSemana","hours":1}'::jsonb, null, null, now(),
     '00000000-0000-0000-0000-0000000000f5'),
    -- 6) cancelada
    ('00000000-0000-0000-0000-0000000000c6','cancelled','CLP',14990,12597,2393,
     'Camila Vera','camila.vera@gmail.com','+56 9 4433 2211',
     '{"tier":"valle","hours":1}'::jsonb, null, null, now() - interval '1 day',
     '00000000-0000-0000-0000-0000000000f6')
  on conflict (id) do nothing;

  -- ── Reservas (UTC; ancladas a la tz de la locación) ──
  insert into reservations (id, resource_id, kind, status, starts_at, ends_at, expires_at,
                            order_id, customer_name, customer_email, customer_phone, notes, customer_id) values
    ('00000000-0000-0000-0000-0000000000b1', v_res,'booking','confirmed',
     ((current_date+1)+time '18:00') at time zone 'America/Santiago',
     ((current_date+1)+time '20:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c1','Matías Rojas','matias.rojas@gmail.com','+56 9 8123 4567', null,
     '00000000-0000-0000-0000-0000000000f1'),
    ('00000000-0000-0000-0000-0000000000b2', v_res,'booking','confirmed',
     ((current_date+2)+time '16:00') at time zone 'America/Santiago',
     ((current_date+2)+time '18:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c2','Catalina Soto','catalina.soto@gmail.com','+56 9 7654 3210', null,
     '00000000-0000-0000-0000-0000000000f2'),
    ('00000000-0000-0000-0000-0000000000b3', v_res,'booking','confirmed',
     ((current_date+4)+time '20:00') at time zone 'America/Santiago',
     ((current_date+4)+time '22:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c3','Felipe Muñoz','felipe.munoz@outlook.cl','+56 9 9988 7766','Sesión con grabación audio + video',
     v_cuid),
    ('00000000-0000-0000-0000-0000000000b4', v_res,'booking','confirmed',
     ((current_date-5)+time '15:00') at time zone 'America/Santiago',
     ((current_date-5)+time '17:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c4','Valentina Díaz','valentina.diaz@gmail.com','+56 9 6543 2109', null,
     '00000000-0000-0000-0000-0000000000f4'),
    ('00000000-0000-0000-0000-0000000000b5', v_res,'booking','held',
     ((current_date+3)+time '19:00') at time zone 'America/Santiago',
     ((current_date+3)+time '20:00') at time zone 'America/Santiago', now() + interval '30 minutes',
     '00000000-0000-0000-0000-0000000000c5','Ignacio Fuentes','ignacio.fuentes@gmail.com','+56 9 5512 3344', null,
     '00000000-0000-0000-0000-0000000000f5'),
    ('00000000-0000-0000-0000-0000000000b6', v_res,'booking','cancelled',
     ((current_date+1)+time '12:00') at time zone 'America/Santiago',
     ((current_date+1)+time '13:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c6','Camila Vera','camila.vera@gmail.com','+56 9 4433 2211','Cancelada por la clienta',
     '00000000-0000-0000-0000-0000000000f6'),
    -- 7) bloqueo administrativo (sin pedido, sin cliente)
    ('00000000-0000-0000-0000-0000000000b7', v_res,'block','confirmed',
     ((current_date+6)+time '09:00') at time zone 'America/Santiago',
     ((current_date+6)+time '13:00') at time zone 'America/Santiago', null,
     null, null, null, null, 'Mantención de equipos', null)
  on conflict (id) do nothing;

  -- ── Líneas de pedido (room_time vinculada a su reserva; addon flat_service) ──
  insert into order_lines (id, order_id, line_type, reservation_id, addon_key, description,
                           quantity, unit_price_clp, subtotal_clp) values
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','room_time','00000000-0000-0000-0000-0000000000b1', null,'Sala de ensayo DJ · 2 h (punta)',1,39980,39980),
    ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c2','room_time','00000000-0000-0000-0000-0000000000b2', null,'Sala de ensayo DJ · 2 h (valle)',1,29980,29980),
    ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000c3','room_time','00000000-0000-0000-0000-0000000000b3', null,'Sala de ensayo DJ · 2 h (punta)',1,39980,39980),
    ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000c3','flat_service', null,'audioVideo','Grabación audio + video',1,49990,49990),
    ('00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000c4','room_time','00000000-0000-0000-0000-0000000000b4', null,'Sala de ensayo DJ · 2 h (valle)',1,19980,19980),
    ('00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000c5','room_time','00000000-0000-0000-0000-0000000000b5', null,'Sala de ensayo DJ · 1 h (punta)',1,19990,19990),
    ('00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000c6','room_time','00000000-0000-0000-0000-0000000000b6', null,'Sala de ensayo DJ · 1 h (valle)',1,14990,14990)
  on conflict (id) do nothing;

  -- ── Boletas (2 emitidas con folio, 2 pendientes) ──
  insert into tax_documents (id, order_id, kind, status, folio, neto, iva, total,
                             receptor_rut, emitted_at, created_at) values
    ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','boleta','emitida','138',33597,6383,39980, null, now() - interval '2 days', now() - interval '2 days'),
    ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c2','boleta','pendiente', null,25193,4787,29980, null, null, now() - interval '1 day'),
    ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3','boleta','pendiente', null,75605,14365,89970, null, null, now() - interval '3 hours'),
    ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c4','boleta','emitida','129',16790,3190,19980,'12.345.678-9', now() - interval '5 days', now() - interval '5 days')
  on conflict (id) do nothing;

  -- ── Puntos: retro por el historial pagado (1.999 / 1.499 / 4.498 / 999); idempotente ──
  perform award_retro_points('00000000-0000-0000-0000-0000000000f1');
  perform award_retro_points('00000000-0000-0000-0000-0000000000f2');
  perform award_retro_points(v_cuid);   -- Felipe
  perform award_retro_points('00000000-0000-0000-0000-0000000000f4');

  -- Smoke de idempotencia del backfill (PR3 lo ejecuta en prod): el demo ya está todo
  -- vinculado y con ficha → no debe insertar nada. Si inserta, el seed falla a propósito.
  if backfill_customers_from_bookings() <> 0 then
    raise exception 'seed: backfill_customers_from_bookings debería ser no-op sobre el demo';
  end if;

  -- ── Miembro staff (bootstrap auth + identidad + fila admin_members) ──
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_suid, 'authenticated', 'authenticated',
    'staff@fotfstudios.cl', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), v_suid::text, v_suid,
    jsonb_build_object('sub', v_suid::text, 'email', 'staff@fotfstudios.cl', 'email_verified', true),
    'email', now(), now(), now()
  ) on conflict do nothing;

  insert into admin_members (email, user_id, role_id, status)
  values ('staff@fotfstudios.cl', v_suid, v_staff, 'active')
  on conflict (email) do update set user_id = excluded.user_id, role_id = excluded.role_id, status = 'active';
end $$;
