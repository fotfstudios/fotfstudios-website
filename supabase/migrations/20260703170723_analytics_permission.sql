-- Permiso RBAC para la página de analíticas del admin.
-- super_admin lo hereda automáticamente (el Custom Access Token Hook agrega
-- TODAS las keys de admin_permissions); staff NO lo recibe por defecto —
-- el dueño lo asigna por rol desde /admin/roles si quiere compartirlo.
-- Debe mantener paridad con PERMISSIONS en src/domain/auth/permissions.ts
-- (lo verifica rbac.itest.ts).

insert into admin_permissions (key, label)
values ('analytics.view', 'Ver analíticas')
on conflict (key) do nothing;
