-- RBAC del admin: roles, permisos y miembros gestionados desde el panel.
-- Reemplaza el allowlist estático por ADMIN_EMAILS. El rol y los permisos viajan en
-- el JWT vía el Custom Access Token Hook (enforcement sin lookup a DB por request).

-- Catálogo de permisos: fuente de verdad de "qué permisos existen". Debe coincidir
-- con src/domain/auth/permissions.ts (hay test de paridad).
create table admin_permissions (
  key   text primary key,
  label text not null
);
insert into admin_permissions (key, label) values
  ('reservations.view',   'Ver reservas'),
  ('reservations.create', 'Crear reserva manual'),
  ('reservations.cancel', 'Cancelar / reembolsar'),
  ('reservations.access', 'Marcar acceso'),
  ('reservations.boleta', 'Registrar boleta'),
  ('blocks.manage',       'Gestionar bloqueos'),
  ('members.manage',      'Gestionar miembros'),
  ('roles.manage',        'Gestionar roles');

create table admin_roles (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  name       text not null,
  is_system  boolean not null default false,  -- protege roles del sistema (super_admin)
  created_at timestamptz not null default now()
);

create table admin_role_permissions (
  role_id    uuid not null references admin_roles (id) on delete cascade,
  permission text not null references admin_permissions (key),
  primary key (role_id, permission)
);

create table admin_members (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,                         -- minúsculas
  user_id    uuid references auth.users (id) on delete set null,
  role_id    uuid not null references admin_roles (id),
  status     text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  invited_by uuid,
  created_at timestamptz not null default now()
);
create index admin_members_user_id_idx on admin_members (user_id);

alter table admin_permissions      enable row level security;
alter table admin_roles            enable row level security;
alter table admin_role_permissions enable row level security;
alter table admin_members          enable row level security;
grant all privileges on admin_permissions, admin_roles, admin_role_permissions, admin_members to service_role;

-- Roles semilla (estructural, igual en local y prod).
insert into admin_roles (key, name, is_system) values
  ('super_admin', 'Super admin', true),
  ('staff',       'Staff',       false);

-- Permisos por defecto del rol staff. super_admin NO lleva filas: tiene TODO implícito.
insert into admin_role_permissions (role_id, permission)
  select r.id, p.key
  from admin_roles r, admin_permissions p
  where r.key = 'staff'
    and p.key in ('reservations.view', 'reservations.create', 'reservations.access', 'reservations.boleta');

-- ── Custom Access Token Hook ────────────────────────────────────────────────
-- Inyecta app_role y app_permissions en el JWT según el miembro activo. super_admin
-- recibe el catálogo completo (cualquier permiso nuevo le aplica solo).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
set search_path = public as $$
declare
  v_user  uuid := (event ->> 'user_id')::uuid;
  v_role  text;
  v_perms text[];
  claims  jsonb := event -> 'claims';
begin
  select r.key into v_role
  from admin_members m
  join admin_roles r on r.id = m.role_id
  where m.user_id = v_user and m.status = 'active';

  if v_role is not null then
    if v_role = 'super_admin' then
      select array_agg(key) into v_perms from admin_permissions;
    else
      select coalesce(array_agg(rp.permission), '{}') into v_perms
      from admin_members m
      join admin_role_permissions rp on rp.role_id = m.role_id
      where m.user_id = v_user;
    end if;
    claims := jsonb_set(claims, '{app_role}', to_jsonb(v_role));
    claims := jsonb_set(claims, '{app_permissions}', to_jsonb(coalesce(v_perms, '{}'::text[])));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- El hook corre como supabase_auth_admin: darle acceso de lectura a las tablas RBAC.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on admin_members, admin_roles, admin_role_permissions, admin_permissions to supabase_auth_admin;
create policy auth_admin_read_members    on admin_members          for select to supabase_auth_admin using (true);
create policy auth_admin_read_roles      on admin_roles            for select to supabase_auth_admin using (true);
create policy auth_admin_read_role_perms on admin_role_permissions for select to supabase_auth_admin using (true);
create policy auth_admin_read_perms      on admin_permissions      for select to supabase_auth_admin using (true);

-- ── Anti-lockout: no borrar/degradar al último super_admin activo ────────────
create or replace function public.protect_last_super_admin()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_super uuid;
  v_left  int;
begin
  select id into v_super from admin_roles where key = 'super_admin';
  if (tg_op = 'DELETE' and old.role_id = v_super and old.status = 'active')
     or (tg_op = 'UPDATE' and old.role_id = v_super and old.status = 'active'
         and (new.role_id <> v_super or new.status <> 'active')) then
    select count(*) into v_left
      from admin_members
      where role_id = v_super and status = 'active' and id <> old.id;
    if v_left = 0 then
      raise exception 'No se puede quitar al último super admin';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger trg_protect_last_super_admin
  before update or delete on admin_members
  for each row execute function public.protect_last_super_admin();
