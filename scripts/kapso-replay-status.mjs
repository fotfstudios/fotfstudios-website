#!/usr/bin/env node
/**
 * Reenvía un webhook de estado de Kapso, FIRMADO, al dev server local. Prueba la ruta real
 * (/api/webhooks/kapso): firma, deduplicación por X-Idempotency-Key y el avance de la fila en
 * whatsapp_outbox, sin depender de que Kapso le pegue a un túnel.
 *
 *   node scripts/kapso-replay-status.mjs --provider-id wamid.X --status delivered
 *   node scripts/kapso-replay-status.mjs --provider-id wamid.X --status failed --code 131026
 *   node scripts/kapso-replay-status.mjs --provider-id wamid.X --status read --key misma-llave   # re-entrega
 *
 * Requiere KAPSO_WEBHOOK_SECRET en .env.local (el mismo que lee el dev server) y `npm run dev`.
 * Para tener un wamid: en Studio (http://127.0.0.1:54423) pon `provider_id` y `status = 'sent'` a
 * una fila de whatsapp_outbox (localmente el worker no manda a clientes: guarda de no-producción).
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const providerId = args["provider-id"];
const status = args.status ?? "delivered";
const url = args.url ?? "http://localhost:3000/api/webhooks/kapso";
const key = args.key ?? randomUUID();
if (!providerId || !["sent", "delivered", "read", "failed"].includes(status)) {
  console.error("uso: --provider-id <wamid> --status sent|delivered|read|failed [--code N] [--key K] [--url U]");
  process.exit(1);
}

/** Solo la variable que hace falta, sin imprimir nada del archivo. */
function secretFromEnvLocal() {
  try {
    const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("KAPSO_WEBHOOK_SECRET="));
    return line?.slice("KAPSO_WEBHOOK_SECRET=".length).trim().replace(/^["']|["']$/g, "") || null;
  } catch {
    return null;
  }
}
const secret = process.env.KAPSO_WEBHOOK_SECRET || secretFromEnvLocal();
if (!secret) {
  console.error("Falta KAPSO_WEBHOOK_SECRET (en el entorno o en .env.local).");
  process.exit(1);
}

const errors = status === "failed" ? [{ code: Number(args.code ?? 131026), title: "Replay local", message: "Replay local" }] : [];
const raw = JSON.stringify({
  message: {
    id: providerId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "template",
    kapso: { direction: "outbound", status, origin: "cloud_api", statuses: [{ id: providerId, status, errors }] },
  },
  phone_number_id: "replay",
});

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-event": `whatsapp.message.${status}`,
    "x-idempotency-key": key,
    "x-webhook-signature": createHmac("sha256", secret).update(raw).digest("hex"),
  },
  body: raw,
});
console.log(res.status, await res.text(), `(X-Idempotency-Key: ${key})`);
