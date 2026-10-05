/**
 * Avisos por WhatsApp de punta a punta contra la DB local: lo que el repositorio de la cola
 * escribe y lee, los datos de WhatsApp de un pedido (celular + consentimiento de la ficha), el
 * encolado desde NotificationService, el worker con la guarda fuera de producción (nunca llama a
 * Kapso: el destinatario no es el dueño) y el webhook de estado firmado. Requiere Supabase local.
 */
import { createHmac } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as kapsoPOST } from "@/app/api/webhooks/kapso/route";
import { GET as outboxCronGET } from "@/app/api/cron/whatsapp-outbox/route";
import { notificationService, whatsappOutboxService } from "@/src/composition";
import { SupabaseNotificationRepository } from "./notification-repository";
import { createServiceClient } from "./supabase-client";
import { SupabaseWhatsAppOutboxRepository } from "./whatsapp-outbox-repository";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseWhatsAppOutboxRepository(db);
const pg = new Client({ connectionString: DB_URL });
const cleanup = "truncate whatsapp_outbox, whatsapp_webhook_inbox, notification_log";
const SECRET = "itest-kapso-secret";
const ENV_KEYS = ["KAPSO_API_KEY", "KAPSO_PHONE_NUMBER_ID", "KAPSO_WEBHOOK_SECRET", "OWNER_WHATSAPP", "VERCEL_ENV", "CRON_SECRET"] as const;
const envBefore: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

let resourceId: string;
let slot = 0;
const created = { orders: [] as string[], customers: [] as string[] };

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

/** Pedido pagado con reserva y ficha; la ficha con o sin consentimiento. */
async function paidOrder(o: { optIn: boolean; phone?: string | null }) {
  const email = `wa-${Math.random().toString(36).slice(2)}@fanout-itest.cl`;
  const cust = (
    await pg.query<{ id: string }>("insert into customers (email, name, phone) values ($1, 'Ana', $2) returning id", [email, o.phone ?? "+56912345678"])
  ).rows[0].id;
  if (o.optIn) await pg.query("select set_whatsapp_opt_in($1, true, 'customer')", [cust]);
  const order = (
    await pg.query<{ id: string }>(
      `insert into orders (status, currency, amount_clp, net_clp, tax_clp, customer_email, customer_name, customer_phone, customer_id, kind)
         values ('paid', 'CLP', 30000, 25210, 4790, $1, 'Ana', '+56900000000', $2, 'booking') returning id`,
      [email, cust],
    )
  ).rows[0].id;
  // Un horario por pedido: la exclusion constraint no deja solapar reservas.
  const starts = new Date(Date.now() + (200 + slot++) * 86400_000);
  const res = (
    await pg.query<{ id: string }>(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at, customer_name, customer_email, customer_id, order_id)
         values ($1, 'booking', 'confirmed', $2, $3, 'Ana', $4, $5, $6) returning id`,
      [resourceId, starts.toISOString(), new Date(starts.getTime() + 2 * 3600_000).toISOString(), email, cust, order],
    )
  ).rows[0].id;
  created.orders.push(order);
  created.customers.push(cust);
  return { order, cust, res };
}

function signed(body: unknown, event: string, key = `k-${Math.random()}`, secret = SECRET) {
  const raw = JSON.stringify(body);
  return new Request("http://x/api/webhooks/kapso", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-event": event,
      "x-idempotency-key": key,
      "x-webhook-signature": createHmac("sha256", secret).update(raw).digest("hex"),
    },
    body: raw,
  });
}
const statusBody = (wamid: string, status: string, errors: unknown[] = []) => ({
  message: { id: wamid, to: "56912345678", kapso: { direction: "outbound", status, statuses: [{ id: wamid, status, errors }] } },
  phone_number_id: "123",
});

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  for (const k of ENV_KEYS) envBefore[k] = process.env[k];
});
beforeEach(async () => {
  await pg.query(cleanup);
  // Kapso "configurado" con valores falsos: la guarda de no-producción impide cualquier llamada real
  // (OWNER_WHATSAPP es otro número que el de las fichas de prueba).
  process.env.KAPSO_API_KEY = "itest-key";
  process.env.KAPSO_PHONE_NUMBER_ID = "000000000000000";
  process.env.KAPSO_WEBHOOK_SECRET = SECRET;
  process.env.OWNER_WHATSAPP = "56911112222";
  process.env.CRON_SECRET = "itest-cron";
  delete process.env.VERCEL_ENV;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBefore[k] === undefined) delete process.env[k];
    else process.env[k] = envBefore[k];
  }
});
afterAll(async () => {
  await pg.query(cleanup);
  if (created.orders.length) {
    await pg.query("delete from reservations where order_id = any($1)", [created.orders]);
    await pg.query("delete from orders where id = any($1)", [created.orders]);
  }
  if (created.customers.length) await pg.query("delete from customers where id = any($1)", [created.customers]);
  await pg.end();
});

describe("repositorio de la cola", () => {
  const entry = (key: string) => ({
    event: "booking_confirmed" as const,
    to: "56912345678",
    template: { name: "fotf_reserva_confirmada", language: "es" as const, params: { nombre: "Ana" }, buttonSuffix: "o1" },
    dedupeKey: key,
    expiresAt: inHours(24),
  });

  it("encolar dos veces la misma clave deja una fila (no es error)", async () => {
    await repo.enqueue(entry("k1"));
    await repo.enqueue(entry("k1"));
    expect((await pg.query("select count(*)::int n from whatsapp_outbox")).rows[0].n).toBe(1);
  });

  it("claim devuelve la fila mapeada; sent → applyStatus → stats", async () => {
    await repo.enqueue(entry("k1"));
    const [row] = await repo.claim(5);
    expect(row).toMatchObject({ recipient: "56912345678", templateName: "fotf_reserva_confirmada", templateParams: { nombre: "Ana" }, buttonSuffix: "o1", attempts: 0 });
    await repo.markSent(row.id, "wamid.x");
    expect(await repo.applyStatus("wamid.x", "delivered", null, null)).toBe(true);
    expect(await repo.stats(24)).toEqual({ pending: 0, sent: 1, delivered: 1, failed: 0, expired: 0 });
  });

  it("fallo terminal visible en recentFailures y recuperable con retryFailed", async () => {
    await repo.enqueue(entry("k1"));
    const [row] = await repo.claim(5);
    await repo.markFailed(row.id, { error: "template does not exist", code: 132001, next: new Date(), terminal: true });
    expect(await repo.recentFailures()).toEqual([expect.objectContaining({ id: row.id, failedCode: 132001, lastError: "template does not exist" })]);
    expect(await repo.retryFailed()).toBe(1);
    expect(await repo.recentFailures()).toEqual([]);
  });
});

describe("datos de WhatsApp del pedido", () => {
  it("getOrderForEmail trae la reserva, el celular de la FICHA y su consentimiento", async () => {
    const { order, res } = await paidOrder({ optIn: true, phone: "+56977776666" });
    const o = await new SupabaseNotificationRepository(db).getOrderForEmail(order);
    expect(o).toMatchObject({ reservationId: res, phone: "+56977776666", whatsappOptIn: true });
  });

  it("sin consentimiento → whatsappOptIn false", async () => {
    const { order } = await paidOrder({ optIn: false });
    expect((await new SupabaseNotificationRepository(db).getOrderForEmail(order))?.whatsappOptIn).toBe(false);
  });
});

describe("encolado desde NotificationService y worker", () => {
  it("notifyOrder encola cliente + dueño con la configuración real", async () => {
    const { order, res } = await paidOrder({ optIn: true });
    await notificationService(db).notifyOrder(order);
    const rows = (await pg.query("select event, recipient, button_suffix, dedupe_key from whatsapp_outbox order by event")).rows;
    expect(rows).toEqual([
      { event: "booking_confirmed", recipient: "56912345678", button_suffix: order, dedupe_key: `booking_confirmed:${order}` },
      { event: "owner_new_booking", recipient: "56911112222", button_suffix: res, dedupe_key: `owner_new_booking:${order}` },
    ]);
  });

  it("sin Kapso configurado no se encola nada", async () => {
    delete process.env.KAPSO_API_KEY;
    const { order } = await paidOrder({ optIn: true });
    await notificationService(db).notifyOrder(order);
    expect((await pg.query("select count(*)::int n from whatsapp_outbox")).rows[0].n).toBe(0);
  });

  it("fuera de producción el worker bloquea al cliente (terminal, sin llamar a Kapso) y lo deja en la bitácora", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await repo.enqueue({
      event: "booking_confirmed",
      to: "56912345678",
      template: { name: "fotf_reserva_confirmada", language: "es", params: { nombre: "Ana" }, buttonSuffix: "o1" },
      dedupeKey: "guard",
      expiresAt: inHours(24),
    });
    const r = await whatsappOutboxService(db).sweep();
    expect(r).toMatchObject({ configured: true, claimed: 1, failed: 1, sent: 0 });
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("kapso"))).toEqual([]);
    const row = (await pg.query("select status, last_error from whatsapp_outbox")).rows[0];
    expect(row.status).toBe("failed");
    expect(row.last_error).toMatch(/bloqueado fuera de producción/);
    expect((await pg.query("select channel, ok from notification_log")).rows).toEqual([{ channel: "whatsapp", ok: false }]);
    fetchSpy.mockRestore();
    err.mockRestore();
  });
});

describe("cron /api/cron/whatsapp-outbox", () => {
  const get = (auth?: string) => outboxCronGET(new Request("http://x/api/cron/whatsapp-outbox", auth ? { headers: { authorization: auth } } : {}));

  it("sin el Bearer correcto → 401", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("Bearer otro")).status).toBe(401);
  });

  it("sin Kapso responde configured:false sin tocar la cola", async () => {
    delete process.env.KAPSO_API_KEY;
    await repo.enqueue({
      event: "test_ping",
      to: "56911112222",
      template: { name: "fotf_prueba", language: "es", params: { fecha: "hoy" } },
      dedupeKey: "cron",
      expiresAt: inHours(1),
    });
    const res = await get("Bearer itest-cron");
    expect(await res.json()).toMatchObject({ configured: false, claimed: 0 });
    expect((await pg.query("select status, locked_at from whatsapp_outbox")).rows[0]).toEqual({ status: "pending", locked_at: null });
  });
});

describe("webhook /api/webhooks/kapso", () => {
  async function sentRow(wamid: string) {
    await repo.enqueue({
      event: "booking_confirmed",
      to: "56912345678",
      template: { name: "fotf_reserva_confirmada", language: "es", params: { nombre: "Ana" }, buttonSuffix: "o1" },
      dedupeKey: wamid,
      expiresAt: inHours(24),
    });
    const [row] = await repo.claim(5);
    await repo.markSent(row.id, wamid);
    return row.id;
  }
  const status = async (id: string) => (await pg.query("select status, failed_code, last_error from whatsapp_outbox where id = $1", [id])).rows[0];

  it("delivered firmado → la fila avanza; la misma entrega repetida no cambia nada", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const id = await sentRow("wamid.d");
    const first = await kapsoPOST(signed(statusBody("wamid.d", "delivered"), "whatsapp.message.delivered", "same"));
    expect(await first.json()).toEqual({ ok: true, applied: true });
    const again = await kapsoPOST(signed(statusBody("wamid.d", "delivered"), "whatsapp.message.delivered", "same"));
    expect(await again.json()).toEqual({ ok: true, applied: false });
    expect((await status(id)).status).toBe("delivered");
    expect((await pg.query("select count(*)::int n from whatsapp_webhook_inbox")).rows[0].n).toBe(1);
    info.mockRestore();
  });

  it("failed guarda el código de Meta", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const id = await sentRow("wamid.f");
    await kapsoPOST(
      signed(statusBody("wamid.f", "failed", [{ code: 131026, title: "Message undeliverable", message: "Message undeliverable" }]), "whatsapp.message.failed"),
    );
    expect(await status(id)).toEqual({ status: "failed", failed_code: 131026, last_error: "Message undeliverable" });
    info.mockRestore();
  });

  it("firma inválida → 401 y no toca nada", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = await sentRow("wamid.s");
    const res = await kapsoPOST(signed(statusBody("wamid.s", "delivered"), "whatsapp.message.delivered", "k", "otro-secreto"));
    expect(res.status).toBe(401);
    expect((await status(id)).status).toBe("sent");
    warn.mockRestore();
  });

  it("sin KAPSO_WEBHOOK_SECRET → 503", async () => {
    delete process.env.KAPSO_WEBHOOK_SECRET;
    expect((await kapsoPOST(signed(statusBody("wamid.x", "delivered"), "whatsapp.message.delivered"))).status).toBe(503);
  });

  it("un mensaje entrante u otro evento → 200 ignorado", async () => {
    const inbound = { message: { id: "wamid.in", kapso: { direction: "inbound" } } };
    expect(await (await kapsoPOST(signed(inbound, "whatsapp.message.received"))).json()).toEqual({ ok: true, ignored: true });
  });
});
