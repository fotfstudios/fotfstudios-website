/**
 * Canal WhatsApp contra la DB real (migración 20261003120000): consentimiento por cliente, la
 * cola de salida (reclamo con lease, vencimiento, backoff, terminal), el estado monótono que
 * aplica el webhook, la bandeja idempotente del webhook y la bitácora por canal. Kapso no
 * participa: lo que se prueba acá es el modelo de datos. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SupabaseNotificationLogRepository } from "./notification-log-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const pg = new Client({ connectionString: DB_URL });
const cleanup = "truncate whatsapp_outbox, whatsapp_webhook_inbox, notification_log";

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function enqueue(o: { key: string; expiresAt?: string; next?: string; to?: string }) {
  const r = await pg.query<{ id: string }>(
    `insert into whatsapp_outbox (dedupe_key, event, recipient, template_name, template_params, expires_at, next_attempt_at)
       values ($1, 'booking_confirmed', $2, 'fotf_reserva_confirmada', '{"nombre":"Ana"}', $3, coalesce($4::timestamptz, now()))
     returning id`,
    [o.key, o.to ?? "56912345678", o.expiresAt ?? inHours(48), o.next ?? null],
  );
  return r.rows[0].id;
}
const row = async (id: string) =>
  (await pg.query("select status, attempts, locked_at, provider_id, failed_code, last_error, next_attempt_at from whatsapp_outbox where id = $1", [id])).rows[0];
const claim = async (limit = 25) => (await pg.query<{ id: string }>("select id from whatsapp_outbox_claim($1)", [limit])).rows.map((r) => r.id);

beforeAll(async () => {
  await pg.connect();
});
beforeEach(async () => {
  await pg.query(cleanup);
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.query("delete from customers where email like '%@wa-itest.cl'");
  await pg.end();
});

describe("consentimiento", () => {
  async function customer(email: string) {
    return (await pg.query<{ id: string }>("insert into customers (email, name, phone) values ($1, 'Ana', '+56912345678') returning id", [email])).rows[0].id;
  }
  const consent = async (id: string) =>
    (await pg.query("select whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_opt_in_source, whatsapp_opt_out_at from customers where id = $1", [id])).rows[0];

  it("una ficha nueva parte sin consentimiento", async () => {
    const id = await customer("nueva@wa-itest.cl");
    expect(await consent(id)).toMatchObject({ whatsapp_opt_in: false, whatsapp_opt_in_at: null, whatsapp_opt_in_source: null });
  });

  it("alta registra fecha y origen; baja guarda la fecha de baja y conserva la historia del alta", async () => {
    const id = await customer("alta@wa-itest.cl");
    await pg.query("select set_whatsapp_opt_in($1, true, 'customer')", [id]);
    const on = await consent(id);
    expect(on).toMatchObject({ whatsapp_opt_in: true, whatsapp_opt_in_source: "customer", whatsapp_opt_out_at: null });
    expect(on.whatsapp_opt_in_at).not.toBeNull();

    await pg.query("select set_whatsapp_opt_in($1, false, 'account')", [id]);
    const off = await consent(id);
    expect(off.whatsapp_opt_in).toBe(false);
    expect(off.whatsapp_opt_out_at).not.toBeNull();
    expect(off.whatsapp_opt_in_source).toBe("customer");
  });

  it("bajar a alguien que nunca se dio de alta no inventa una fecha de baja", async () => {
    const id = await customer("nunca@wa-itest.cl");
    await pg.query("select set_whatsapp_opt_in($1, false, 'staff')", [id]);
    expect((await consent(id)).whatsapp_opt_out_at).toBeNull();
  });

  it("un origen desconocido lo rechaza el CHECK", async () => {
    const id = await customer("raro@wa-itest.cl");
    await expect(pg.query("select set_whatsapp_opt_in($1, true, 'bot')", [id])).rejects.toThrow(/whatsapp_opt_in_source/);
  });

  it("por pedido: resuelve la ficha del pedido; sin ficha devuelve false", async () => {
    const id = await customer("pedido@wa-itest.cl");
    const order = async (cust: string | null) =>
      (
        await pg.query<{ id: string }>(
          `insert into orders (status, currency, amount_clp, net_clp, tax_clp, customer_email, customer_id)
             values ('pending_payment', 'CLP', 1000, 840, 160, 'pedido@wa-itest.cl', $1) returning id`,
          [cust],
        )
      ).rows[0].id;
    const linked = await order(id);
    const orphan = await order(null);
    try {
      expect((await pg.query("select set_whatsapp_opt_in_for_order($1, true, 'customer') as ok", [linked])).rows[0].ok).toBe(true);
      expect((await consent(id)).whatsapp_opt_in).toBe(true);
      expect((await pg.query("select set_whatsapp_opt_in_for_order($1, true, 'customer') as ok", [orphan])).rows[0].ok).toBe(false);
    } finally {
      await pg.query("delete from orders where id = any($1)", [[linked, orphan]]);
    }
  });
});

describe("cola: encolado y reclamo", () => {
  it("la dedupe_key impide encolar dos veces el mismo aviso", async () => {
    await enqueue({ key: "booking_confirmed:1" });
    await expect(enqueue({ key: "booking_confirmed:1" })).rejects.toThrow(/duplicate key/);
  });

  it("el destinatario y el nombre de plantilla tienen forma", async () => {
    await expect(enqueue({ key: "a", to: "+56 9 1234" })).rejects.toThrow(/recipient/);
  });

  it("reclama lo debido, toma el lease y no lo vuelve a entregar mientras está tomado", async () => {
    const a = await enqueue({ key: "a" });
    const later = await enqueue({ key: "b", next: inHours(1) });
    expect(await claim()).toEqual([a]);
    expect((await row(a)).locked_at).not.toBeNull();
    expect(await claim()).toEqual([]);
    expect((await row(later)).locked_at).toBeNull();
  });

  it("un lease vencido (worker muerto) se puede volver a reclamar", async () => {
    const a = await enqueue({ key: "a" });
    await claim();
    await pg.query("update whatsapp_outbox set locked_at = now() - interval '6 minutes' where id = $1", [a]);
    expect(await claim()).toEqual([a]);
  });

  it("respeta el límite y el orden por next_attempt_at", async () => {
    const first = await enqueue({ key: "a", next: new Date(Date.now() - 60_000).toISOString() });
    await enqueue({ key: "b" });
    expect(await claim(1)).toEqual([first]);
  });

  it("lo vencido pasa a 'expired' sin reclamarse (nunca un PIN tarde)", async () => {
    const stale = await enqueue({ key: "a", expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await claim()).toEqual([]);
    expect((await row(stale)).status).toBe("expired");
  });

  it("dos reclamos concurrentes no toman la misma fila (SKIP LOCKED)", async () => {
    for (let i = 0; i < 10; i++) await enqueue({ key: `k${i}` });
    const other = new Client({ connectionString: DB_URL });
    await other.connect();
    try {
      const [x, y] = await Promise.all([
        claim(6),
        other.query<{ id: string }>("select id from whatsapp_outbox_claim(6)").then((r) => r.rows.map((z) => z.id)),
      ]);
      expect(x.filter((id) => y.includes(id))).toEqual([]);
      expect(x.length + y.length).toBe(10);
    } finally {
      await other.end();
    }
  });
});

describe("cola: cierre de un intento", () => {
  it("mark_sent guarda el wamid, cuenta el intento y suelta el lease", async () => {
    const a = await enqueue({ key: "a" });
    await claim();
    await pg.query("select whatsapp_outbox_mark_sent($1, 'wamid.1')", [a]);
    expect(await row(a)).toMatchObject({ status: "sent", provider_id: "wamid.1", attempts: 1, locked_at: null });
  });

  it("fallo reintentable: vuelve a pending con el próximo intento y no se reclama antes", async () => {
    const a = await enqueue({ key: "a" });
    await claim();
    const next = inHours(0.1);
    await pg.query("select whatsapp_outbox_mark_failed($1, 'HTTP 503', null, $2, false)", [a, next]);
    expect(await row(a)).toMatchObject({ status: "pending", attempts: 1, locked_at: null, last_error: "HTTP 503" });
    expect(await claim()).toEqual([]);
  });

  it("fallo terminal: queda failed con el código y nunca se reclama", async () => {
    const a = await enqueue({ key: "a" });
    await claim();
    await pg.query("select whatsapp_outbox_mark_failed($1, '(#132001) Template does not exist', 132001, now(), true)", [a]);
    expect(await row(a)).toMatchObject({ status: "failed", failed_code: 132001 });
    expect(await claim()).toEqual([]);
  });

  it("reintentar fallidos devuelve a pending solo lo que todavía no venció", async () => {
    const alive = await enqueue({ key: "a" });
    const dead = await enqueue({ key: "b" });
    await claim();
    for (const id of [alive, dead]) await pg.query("select whatsapp_outbox_mark_failed($1, 'x', 1, now(), true)", [id]);
    await pg.query("update whatsapp_outbox set expires_at = now() - interval '1 minute' where id = $1", [dead]);
    expect((await pg.query("select whatsapp_outbox_retry_failed() as n")).rows[0].n).toBe(1);
    expect(await row(alive)).toMatchObject({ status: "pending", attempts: 0, failed_code: null });
    expect((await row(dead)).status).toBe("failed");
  });
});

describe("estado desde el webhook", () => {
  async function sent(key: string, wamid: string) {
    const id = await enqueue({ key });
    await claim();
    await pg.query("select whatsapp_outbox_mark_sent($1, $2)", [id, wamid]);
    return id;
  }
  const apply = async (wamid: string, status: string, code: number | null = null, msg: string | null = null) =>
    (await pg.query("select whatsapp_outbox_apply_status($1, $2, $3, $4) as ok", [wamid, status, code, msg])).rows[0].ok as boolean;

  it("avanza sent → delivered → read y nunca retrocede", async () => {
    const id = await sent("a", "wamid.a");
    expect(await apply("wamid.a", "delivered")).toBe(true);
    expect(await apply("wamid.a", "read")).toBe(true);
    expect(await apply("wamid.a", "delivered")).toBe(false);
    expect(await apply("wamid.a", "sent")).toBe(false);
    expect((await row(id)).status).toBe("read");
  });

  it("failed es terminal y guarda el código de Meta", async () => {
    const id = await sent("a", "wamid.a");
    expect(await apply("wamid.a", "failed", 131026, "Message undeliverable")).toBe(true);
    expect(await row(id)).toMatchObject({ status: "failed", failed_code: 131026, last_error: "Message undeliverable" });
    expect(await apply("wamid.a", "delivered")).toBe(false);
    expect(await apply("wamid.a", "failed", 1, "otra")).toBe(false);
  });

  it("un wamid ajeno (mensaje escrito desde la app Business) no toca nada", async () => {
    await sent("a", "wamid.a");
    expect(await apply("wamid.otro", "delivered")).toBe(false);
  });

  it("mark_sent tardío no pisa un estado que el webhook ya avanzó", async () => {
    const id = await enqueue({ key: "a" });
    await claim();
    await pg.query("update whatsapp_outbox set provider_id = 'wamid.a' where id = $1", [id]);
    await apply("wamid.a", "delivered");
    await pg.query("select whatsapp_outbox_mark_sent($1, 'wamid.a')", [id]);
    expect((await row(id)).status).toBe("delivered");
  });

  it("estadísticas de 24 h por estado", async () => {
    await sent("a", "wamid.a");
    await apply("wamid.a", "delivered");
    await sent("b", "wamid.b");
    await apply("wamid.b", "failed", 131047, "Re-engagement");
    await enqueue({ key: "c", next: inHours(1) });
    const s = (await pg.query("select pending::int, sent::int, delivered::int, failed::int, expired::int from whatsapp_outbox_stats(24)")).rows[0];
    expect(s).toEqual({ pending: 1, sent: 1, delivered: 1, failed: 1, expired: 0 });
  });
});

describe("bandeja del webhook", () => {
  it("la misma X-Idempotency-Key se procesa una sola vez", async () => {
    const first = await pg.query("select whatsapp_webhook_claim('k-1', 'whatsapp.message.delivered') as ok");
    const again = await pg.query("select whatsapp_webhook_claim('k-1', 'whatsapp.message.delivered') as ok");
    expect(first.rows[0].ok).toBe(true);
    expect(again.rows[0].ok).toBe(false);
  });
});

describe("bitácora por canal", () => {
  it("el repositorio vivo (5 parámetros con nombre) sigue funcionando y queda como email", async () => {
    const repo = new SupabaseNotificationLogRepository(createServiceClient(URL, KEY));
    await repo.record({ template: "customerConfirmation", recipient: "a@e.cl", subject: "ok", ok: true, error: null });
    expect((await pg.query("select channel from notification_log")).rows).toEqual([{ channel: "email" }]);
  });

  it("acepta whatsapp y rechaza un canal desconocido", async () => {
    await pg.query("select notification_log_record('fotf_prueba', '56912345678', 'test_ping', true, null, 'whatsapp')");
    expect((await pg.query("select channel from notification_log")).rows).toEqual([{ channel: "whatsapp" }]);
    await expect(pg.query("select notification_log_record('t', 'r', 's', true, null, 'sms')")).rejects.toThrow(/notification_log_channel_check/);
  });
});

describe("scheduler y permiso", () => {
  it("el job de pg_cron existe y corre cada minuto", async () => {
    const r = await pg.query("select schedule from cron.job where jobname = 'whatsapp-outbox'");
    expect(r.rows).toEqual([{ schedule: "* * * * *" }]);
  });

  it("whatsapp.manage está en el catálogo de permisos y sin rol asignado", async () => {
    expect((await pg.query("select 1 from admin_permissions where key = 'whatsapp.manage'")).rowCount).toBe(1);
    expect((await pg.query("select 1 from admin_role_permissions where permission = 'whatsapp.manage'")).rowCount).toBe(0);
  });
});

describe("repositorio de la bitácora con canal", () => {
  it("un registro de WhatsApp manda p_channel y queda como whatsapp", async () => {
    await pg.query(cleanup);
    const repo = new SupabaseNotificationLogRepository(createServiceClient(URL, KEY));
    await repo.record({ template: "fotf_prueba", recipient: "56912345678", subject: "WhatsApp · fotf_prueba", ok: false, error: "HTTP 400", channel: "whatsapp" });
    expect((await pg.query("select channel, ok, error from notification_log")).rows).toEqual([{ channel: "whatsapp", ok: false, error: "HTTP 400" }]);
  });
});
