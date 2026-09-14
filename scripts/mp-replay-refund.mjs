#!/usr/bin/env node
/**
 * Replay LOCAL del webhook de reembolso de Mercado Pago (leg MP → app).
 *
 * Por qué existe: el sandbox de MP NO permite reembolsar por API con credenciales de
 * prueba (401 "Unauthorized use of live credentials") y NO entrega webhooks reales de
 * pagos de prueba a la URL test-mode del panel. Lo que SÍ se puede ejercitar local es
 * todo lo que hay entre esas dos puntas: la ruta `/api/webhooks/mercadopago` con firma
 * válida, la lectura REAL del pago en la API de MP, `mark_refunded` (NC, cupo, puntos,
 * timeline), el email y la idempotencia del inbox ante re-entregas.
 *
 * Cómo: toma un pago sandbox YA reembolsado (p. ej. desde el panel de MP como vendedor
 * de prueba), crea un pedido pagado en la DB local con el id = `external_reference` de
 * ese pago (la ruta localiza el pedido por ahí), y le manda N notificaciones firmadas
 * al dev server, como las manda el panel (`?data.id=&type=payment` + `x-signature`).
 *
 * Uso (con `npm run db:start` y `npm run dev` corriendo):
 *   node scripts/mp-replay-refund.mjs --payment 166015846979
 *   node scripts/mp-replay-refund.mjs --payment 166015846979 --times 3 --email ana@e.cl
 *   node scripts/mp-replay-refund.mjs --list            # pagos sandbox reembolsados
 *
 * Esperado tras N entregas: orden `refunded`, reserva `cancelled`, UNA NC, puntos
 * revocados, `refund:{id}` UNA vez en el inbox y UN solo email `[email:noop]` en el log.
 * Al terminar: `npm run db:reset` (el pedido queda en la seed local).
 *
 * Lee `.env.local` (MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, SUPABASE_DB_URL). Se niega a
 * correr contra una DB que no sea local.
 */
import { createHmac, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const { values: args } = parseArgs({
  options: {
    payment: { type: "string" },
    times: { type: "string", default: "2" },
    base: { type: "string", default: "http://localhost:3000" },
    email: { type: "string" },
    list: { type: "boolean", default: false },
    "skip-fixture": { type: "boolean", default: false },
    "skip-replay": { type: "boolean", default: false },
  },
});

const MP_API = "https://api.mercadopago.com";
const token = process.env.MP_ACCESS_TOKEN;
const secret = process.env.MP_WEBHOOK_SECRET;
const dbUrl = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!token) fail("Falta MP_ACCESS_TOKEN en .env.local");
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl)) {
  fail(`SUPABASE_DB_URL no es local (${dbUrl.replace(/:[^:@]+@/, ":***@")}). Este script solo corre contra la DB local.`);
}

async function mp(path) {
  const res = await fetch(`${MP_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) fail(`MP ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ── --list: pagos sandbox reembolsados, candidatos para el replay ────────────────
if (args.list) {
  const { results = [] } = await mp("/v1/payments/search?status=refunded&sort=date_created&criteria=desc&limit=20");
  if (results.length === 0) console.log("No hay pagos reembolsados en esta cuenta sandbox.");
  for (const p of results) {
    const refunds = (p.refunds ?? []).map((r) => `${r.id}:${r.status}:${r.amount}`).join(",");
    console.log(`${p.id}  ${p.transaction_amount}  ${p.external_reference ?? "-"}  [${refunds}]  ${p.date_created.slice(0, 10)}`);
  }
  process.exit(0);
}

if (!args.payment) fail("Falta --payment <id>. Con --list ves los pagos sandbox reembolsados.");
if (!secret && !args["skip-replay"]) fail("Falta MP_WEBHOOK_SECRET en .env.local (necesario para firmar el replay)");

// ── El pago real en MP: de ahí salen el pedido (external_reference) y el monto ─────
const payment = await mp(`/v1/payments/${args.payment}`);
const orderId = payment.external_reference;
const amount = Math.round(payment.transaction_amount);
const approvedRefunds = (payment.refunds ?? []).filter((r) => r.status === "approved");
console.log(`pago ${payment.id}: ${payment.status}, $${amount}, external_reference=${orderId ?? "-"}`);
console.log(`reembolsos: ${(payment.refunds ?? []).map((r) => `${r.id}:${r.status}:${r.amount}`).join(", ") || "ninguno"}`);
if (!orderId || !/^[0-9a-f-]{36}$/.test(orderId)) fail("El pago no tiene un external_reference uuid: no se puede ligar a un pedido.");
if (approvedRefunds.length === 0) console.warn("⚠ Sin reembolsos approved: el replay no asentará nada (útil solo para probar in_process/rejected).");

const db = new pg.Client({ connectionString: dbUrl });
await db.connect();

try {
  // ── Fixture: hold real → confirm_payment → re-id al external_reference ─────────
  if (!args["skip-fixture"]) {
    const exists = (await db.query("select status from orders where id=$1", [orderId])).rows[0];
    if (exists) {
      console.log(`fixture: el pedido ${orderId} ya existe (${exists.status}); se reutiliza. Para rehacerlo: npm run db:reset`);
    } else {
      await buildFixture();
    }
  }

  // ── Replay: N notificaciones firmadas, forma Webhooks del panel ──────────────────
  if (!args["skip-replay"]) {
    const times = Number(args.times);
    for (let i = 1; i <= times; i++) {
      const status = await deliver(payment.id);
      console.log(`entrega ${i}/${times} → HTTP ${status}`);
    }
    // El asiento corre dentro del request; un respiro para que el log/email se escriba.
    await new Promise((r) => setTimeout(r, 1500));
  }

  await summary();
} finally {
  await db.end();
}

async function buildFixture() {
  const resource = (await db.query("select id from resources order by created_at limit 1")).rows[0]?.id;
  if (!resource) fail("No hay resources en la DB local (¿corriste npm run db:reset?).");

  // Cliente con ficha si existe (así el flujo de puntos también corre); si no, sin ficha.
  const cust = args.email
    ? (await db.query("select id, name, email, phone from customers where email=$1", [args.email])).rows[0]
    : (await db.query("select id, name, email, phone from customers where email is not null order by created_at limit 1")).rows[0];
  const customer = cust
    ? { name: cust.name, email: cust.email, phone: cust.phone }
    : { name: "Replay MP", email: args.email ?? "replay-mp@example.com", phone: null };
  if (args.email && !cust) console.warn(`⚠ No hay ficha para ${args.email}; se crea el pedido sin customer_id (sin puntos).`);

  const net = Math.round(amount / 1.19);
  const lines = [{ line_type: "room_time", description: "Replay MP · 1 h", quantity: 1, unit_price_clp: amount, subtotal_clp: amount }];

  // Un lunes a ≥2 semanas, 10:00 America/Santiago; si el slot está tomado, corre una hora.
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + ((8 - day.getUTCDay()) % 7 || 7) + 7);
  const tzOffset = santiagoOffsetHours(day);
  let oldId = null;
  for (let hour = 10; hour <= 18 && !oldId; hour++) {
    const starts = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + tzOffset, 0, 0));
    const ends = new Date(starts.getTime() + 3_600_000);
    try {
      const { rows } = await db.query(
        `select create_checkout($1,$2,$3,$4,$5,$6,'CLP',$7::jsonb,$8::jsonb,$9::jsonb, interval '10 minutes', $10, 0, 'v1', 'staff') as id`,
        [resource, starts.toISOString(), ends.toISOString(), amount, net, amount - net, JSON.stringify(customer), JSON.stringify({ tier: "replay", hours: 1 }), JSON.stringify(lines), cust?.id ?? null],
      );
      oldId = rows[0].id;
      console.log(`fixture: hold ${starts.toISOString()} → pedido ${oldId}`);
    } catch (e) {
      if (!/exclusion|23P01|overlap|conflict/i.test(String(e.message))) throw e; // mismo criterio que CheckoutService
    }
  }
  if (!oldId) fail("No se encontró un slot libre ese lunes entre 10:00 y 18:00.");

  const st = (await db.query("select confirm_payment($1, $2) as st", [oldId, String(payment.id)])).rows[0].st;
  console.log(`fixture: confirm_payment → ${st}`);

  // La ruta localiza el pedido por external_reference: se clona la fila con ese id y
  // se re-apuntan las FKs (todas las tablas que cuelgan de orders).
  await db.query("begin");
  try {
    await db.query(
      `insert into orders select (jsonb_populate_record(null::orders, to_jsonb(o) || jsonb_build_object('id', $2::uuid))).* from orders o where id = $1`,
      [oldId, orderId],
    );
    const fks = [
      ["reservations", "order_id"], ["order_lines", "order_id"], ["payment_intents", "order_id"],
      ["tax_documents", "order_id"], ["tax_documents", "settlement_order_id"], ["points_ledger", "order_id"],
      ["booking_events", "order_id"],
    ];
    for (const [table, col] of fks) await db.query(`update ${table} set ${col} = $2 where ${col} = $1`, [oldId, orderId]);
    await db.query("delete from orders where id = $1", [oldId]);
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
  console.log(`fixture: pedido re-identificado como ${orderId} (pagado, boleta emitida)`);
}

/** Firma como el panel de MP: HMAC-SHA256 del manifiesto `id:{data.id};request-id:{rid};ts:{ts};`. */
async function deliver(paymentId) {
  const ts = String(Date.now());
  const rid = randomUUID();
  const v1 = createHmac("sha256", secret).update(`id:${paymentId};request-id:${rid};ts:${ts};`).digest("hex");
  const res = await fetch(`${args.base}/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": rid, "x-signature": `ts=${ts},v1=${v1}` },
    body: JSON.stringify({ action: "payment.updated", api_version: "v1", type: "payment", live_mode: true, date_created: new Date().toISOString(), data: { id: String(paymentId) } }),
  }).catch((e) => fail(`No se pudo llegar a ${args.base} (${e.message}). ¿Está corriendo npm run dev?`));
  return res.status;
}

async function summary() {
  const q = async (sql) => (await db.query(sql, [orderId])).rows;
  const show = (title, rows) => {
    console.log(`\n## ${title}`);
    if (rows.length === 0) console.log("(sin filas)");
    else console.table(rows);
  };
  show("orders", await q("select status, amount_clp, refunded_amount_clp, mp_payment_id, mp_refund_id from orders where id=$1"));
  show("reservations", await q("select status, cancelled_at is not null as cancelled from reservations where order_id=$1"));
  show("tax_documents", await q("select kind, total, reversed_clp from tax_documents where order_id=$1 order by created_at"));
  show("points_ledger", await q("select kind, amount, ref from points_ledger where order_id=$1 order by created_at"));
  show("booking_events", await q("select seq, type, amount_clp, payment_ref from booking_events where order_id=$1 order by seq"));
  show("webhook_events (inbox, TODA la tabla)", await q("select event_id, topic from webhook_events where $1::text is not null order by event_id"));
  console.log("\nEn el log del dev server: `firma ok (forma=webhooks)` por entrega y UN solo `[email:noop] … cancelada`.");
  console.log("Al terminar: npm run db:reset");
}

/** Horas que hay que SUMAR a la hora local de Santiago para obtener UTC (3 en verano, 4 en invierno). */
function santiagoOffsetHours(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", timeZoneName: "shortOffset" }).formatToParts(date);
  const m = /GMT([+-]\d+)/.exec(parts.find((p) => p.type === "timeZoneName")?.value ?? "");
  return m ? -Number(m[1]) : 3;
}
