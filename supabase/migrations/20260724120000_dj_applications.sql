-- Postulaciones de DJs ("Súmate al equipo", /unete).
--
-- Solo servidor (service-role): el route handler público /api/applications valida
-- y normaliza con parseApplication() y luego inserta. RLS habilitada SIN policies →
-- nada fuera de service_role toca la tabla (mismo patrón que customers/points).
--
-- Triage mínimo para el dueño: nueva → contactada | descartada, reversible, sin
-- máquina de estados (text + check como admin_members.status; un enum no aporta).
-- Los CHECK de largo espejan APPLICATION_CAPS (defensa en profundidad: la DB es la
-- última línea si un caller futuro se salta la validación).

-- El equipo da CLASES grupales y sesiones guiadas 1:1: session_format captura qué
-- puede ofrecer el postulante (uno de clases/uno_a_uno/ambas) y availability su
-- disponibilidad en texto libre. Ambos requeridos: son el núcleo del triage docente.
create table dj_applications (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  email          text not null check (char_length(email) between 1 and 120),
  phone          text not null check (char_length(phone) between 1 and 40),
  session_format text not null check (session_format in ('clases', 'uno_a_uno', 'ambas')),
  availability   text not null check (char_length(availability) between 1 and 200),
  mix_url        text not null check (char_length(mix_url) between 1 and 300),
  instagram      text check (char_length(instagram) <= 200),
  genres         text check (char_length(genres) <= 120),
  pitch          text not null check (char_length(pitch) between 1 and 1000),
  status         text not null default 'nueva'
                 check (status in ('nueva', 'contactada', 'descartada')),
  created_at     timestamptz not null default now()
);

-- La lista del admin filtra por estado y ordena por fecha desc dentro de cada tab.
create index dj_applications_status_created_idx on dj_applications (status, created_at desc);

alter table dj_applications enable row level security;   -- sin policies: solo service-role
grant all privileges on dj_applications to service_role;

-- Permiso RBAC (uno solo: ver + cambiar estado son el mismo trabajo). Paridad con
-- src/domain/auth/permissions.ts, verificada por rbac.itest.ts. super_admin lo hereda;
-- el staff NO lo recibe por defecto (igual que analytics.view).
insert into admin_permissions (key, label)
values ('applications.manage', 'Gestionar postulaciones')
on conflict (key) do nothing;
