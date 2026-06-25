-- Privilegios para los roles de PostgREST (Supabase no los otorga solo a tablas
-- creadas por migraciones). service_role bypassa RLS pero igual necesita el
-- privilegio de tabla; anon/authenticated leen el catálogo (RLS gatea filas).

grant usage on schema public to anon, authenticated, service_role;

-- service_role: acceso total (es el rol del servidor).
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Lectura pública del catálogo/precios (las políticas RLS ya existen).
grant select on
  locations, resources, opening_hours, schedule_exceptions,
  price_books, rate_plans, rate_tiers, volume_discounts, addons, tax_rates
  to anon, authenticated;

-- Tablas/funciones futuras creadas por el rol de migración heredan privilegios.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
