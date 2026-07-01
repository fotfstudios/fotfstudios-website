-- Add-on de sesión 1:1 guiada: se cobra POR HORA (duración reservada × tarifa del guía).
-- kind='per_hour' hace que el motor de precios multiplique amount_clp por las horas de la
-- reserva (a diferencia de 'flat_service', que es un monto fijo como la grabación).
insert into addons (rate_plan_id, key, name, amount_clp, kind)
select id, 'guided', 'Sesión 1:1 guiada', 14990, 'per_hour'
from rate_plans
on conflict (rate_plan_id, key) do nothing;
