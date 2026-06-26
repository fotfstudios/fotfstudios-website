-- Endurece el search_path de las funciones (advisor function_search_path_mutable).
-- Fija un search_path no mutable para evitar inyección por search_path.
alter function public.expire_stale_holds(uuid) set search_path = public, pg_temp;
alter function public.create_hold(uuid, timestamptz, timestamptz, interval) set search_path = public, pg_temp;
alter function public.create_checkout(uuid, timestamptz, timestamptz, integer, integer, integer, text, jsonb, jsonb, jsonb, interval) set search_path = public, pg_temp;
alter function public.confirm_payment(uuid, text) set search_path = public, pg_temp;
alter function public.cancel_unpaid_order(uuid) set search_path = public, pg_temp;
alter function public.create_nota_credito(uuid) set search_path = public, pg_temp;
alter function public.cancel_booking(uuid) set search_path = public, pg_temp;
