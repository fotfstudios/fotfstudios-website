/**
 * Toda función SECURITY DEFINER del esquema public corre con los permisos de su dueño:
 * si anon o authenticated pueden ejecutarla, PostgREST la expone en /rpc a cualquiera con
 * la anon key. Ninguna debe quedar abierta (run_access_code_cron lo estuvo hasta
 * 20261015120000). Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres" });
beforeAll(() => pg.connect());
afterAll(() => pg.end());

it("ninguna función SECURITY DEFINER de public es ejecutable por anon ni authenticated", async () => {
  const { rows } = await pg.query<{ proname: string }>(
    `select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
      order by 1`,
  );
  expect(rows.map((r) => r.proname)).toEqual([]);
});
