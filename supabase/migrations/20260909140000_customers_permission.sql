-- Permiso `customers.manage` — gestionar el directorio de clientes (/admin/clientes).
--
-- NO se otorga a ningún rol acá, por decisión del dueño: el staff no administra
-- fichas hasta que él lo habilite desde /admin/roles. `super_admin` lo tiene por
-- definición (hasPermission cortocircuita ese rol), así que el dueño puede usar
-- la sección desde el primer deploy sin tocar nada.
--
-- Mismo patrón que 20260724120000_dj_applications.sql:40 — solo el catálogo, con
-- `on conflict do nothing` para que re-aplicar la migración sea inocuo.
insert into admin_permissions (key, label)
values ('customers.manage', 'Gestionar clientes')
on conflict (key) do nothing;
