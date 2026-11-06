/**
 * Integración: columnas de atribución + guardia de conversión en orders (migración
 * 20261106120000). PR1 todavía no tiene código que las escriba, así que probamos la DB
 * directo: que acepte las señales, que el CHECK de charset sea la última línea de defensa
 * (espejo de CLICK_ID_RE), y que landing_path quede FUERA de ese charset (lleva "/?&=").
 */
import { Client } from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

/** Inserta una orden mínima (solo las NOT NULL sin default) con las columnas extra dadas. */
async function insertOrder(cols: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = { amount_clp: 10000, net_clp: 8403, tax_clp: 1597, ...cols };
  const keys = Object.keys(base);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await raw(
    `insert into orders (${keys.join(", ")}) values (${placeholders}) returning id, conversions_sent_at`,
    keys.map((k) => base[k]),
  );
  return rows[0] as { id: string; conversions_sent_at: string | null };
}

const created: string[] = [];

afterEach(async () => {
  if (created.length) {
    await raw(`delete from orders where id = any($1::uuid[])`, [created.splice(0)]);
  }
});

afterAll(async () => {
  if (connected) await pg.end();
});

describe("orders — atribución (migración 20261106120000)", () => {
  it("guarda UTM, click IDs, cookies de Meta y GA4; conversions_sent_at nace null", async () => {
    const row = await insertOrder({
      utm_source: "meta",
      utm_medium: "paid",
      utm_campaign: "reservar-2026-11",
      referrer_host: "l.instagram.com",
      landing_path: "/reservar?utm_source=meta&utm_medium=paid",
      gclid: "Cj0KCQ-abc_123",
      fbclid: "IwAR1abc-_x",
      fbc: "fb.1.1699999999999.IwAR1abc",
      fbp: "fb.1.1699999999999.1234567890",
      ga_client_id: "GA1.1.1234567890.1699999999",
      ga_session_id: "1699999999",
    });
    created.push(row.id);
    expect(row.conversions_sent_at).toBeNull();

    const { rows } = await raw("select landing_path, gclid, fbc, ga_client_id from orders where id = $1", [row.id]);
    expect(rows[0]).toMatchObject({
      landing_path: "/reservar?utm_source=meta&utm_medium=paid",
      gclid: "Cj0KCQ-abc_123",
      fbc: "fb.1.1699999999999.IwAR1abc",
      ga_client_id: "GA1.1.1234567890.1699999999",
    });
  });

  it("acepta sellar conversions_sent_at con un timestamp", async () => {
    const row = await insertOrder({ conversions_sent_at: new Date().toISOString() });
    created.push(row.id);
    expect(row.conversions_sent_at).not.toBeNull();
  });

  it("rechaza un gclid con caracteres raros (espejo de CLICK_ID_RE)", async () => {
    await expect(insertOrder({ gclid: "a b" })).rejects.toThrow(/orders_attribution_charset/);
  });

  it("rechaza un ga_client_id con caracteres raros", async () => {
    await expect(insertOrder({ ga_client_id: "has space" })).rejects.toThrow(/orders_attribution_charset/);
  });

  it("rechaza un gclid sobre el tope de 512", async () => {
    await expect(insertOrder({ gclid: "a".repeat(513) })).rejects.toThrow(/orders_attribution_charset/);
  });

  it("landing_path NO cae en el charset de click IDs (acepta '/', '?', '&', '=')", async () => {
    const row = await insertOrder({ landing_path: "/reservar?a=1&b=2%20c" });
    created.push(row.id);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rechaza un landing_path sobre el tope de 512", async () => {
    await expect(insertOrder({ landing_path: "/" + "x".repeat(512) })).rejects.toThrow(/orders_landing_path_len/);
  });
});
