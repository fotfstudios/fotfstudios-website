-- run_access_code_cron (20260911150000) es SECURITY DEFINER y solo se revocó de `public`:
-- anon y authenticated conservaban EXECUTE por el grant explícito de Supabase, así que
-- cualquiera con la anon key podía llamar /rpc/run_access_code_cron y disparar el barrido
-- de PINs y recordatorios fuera de hora (sin fuga de datos: el endpoint exige CRON_SECRET,
-- que lee la propia función desde Vault). Los otros run_*_cron ya lo revocaban bien.
revoke all on function run_access_code_cron() from public, anon, authenticated;
