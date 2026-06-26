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
