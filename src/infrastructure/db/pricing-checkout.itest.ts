/**
 * Integración: PricingService (carga price book activo) + CheckoutService
 * (re-cotiza en servidor y persiste hold + pedido + líneas atómicamente).
 * Requiere Supabase local + envs (ver test:integration). Corre fuera del CI.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { futureDate } from "@/tests/dates";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { SupabaseRescheduleRepository } from "./reschedule-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const pricing = new PricingService(new SupabaseRatePlanRepository(db));
const checkout = new CheckoutService(pricing, new SupabaseCheckoutRepository(db));
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

const MON = futureDate(1); // lunes futuro (satisface lead-time)

beforeAll(async () => {
  await pg.connect();
  const r = await pg.query<{ id: string }>("select id from resources limit 1");
  resourceId = r.rows[0].id;
});

afterAll(async () => {
  await pg.query("truncate reservations, orders, order_lines, customers cascade");
  await pg.end();
});

beforeEach(async () => {
  await pg.query("truncate reservations, orders, order_lines, customers cascade");
});

describe("PricingService.quoteBooking", () => {
  it("cotiza desde el price book activo (2h Lun = $22.480)", async () => {
    const r = await pricing.quoteBooking({ resourceId, date: MON, startMinute: 960, durationHours: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.quote.total).toBe(22480);
      expect(r.value.currency).toBe("CLP");
    }
  });
});

describe("CheckoutService.createBooking", () => {
  it("crea pedido + líneas + hold y cuadra el desglose", async () => {
    const r = await checkout.createBooking({
      resourceId,
      date: MON,
      startMinute: 960,
      durationHours: 2,
      customer: { name: "Test", email: "t@e.cl" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const order = await pg.query<{ amount_clp: number }>("select amount_clp from orders where id=$1", [r.value.orderId]);
    expect(order.rows[0].amount_clp).toBe(22480);

    // las líneas suman exactamente el total cobrado
    const sum = await pg.query<{ s: string }>(
      "select coalesce(sum(subtotal_clp),0)::text s from order_lines where order_id=$1",
      [r.value.orderId],
    );
    expect(Number(sum.rows[0].s)).toBe(22480);

    const held = await pg.query<{ n: string }>(
      "select count(*)::text n from reservations where order_id=$1 and status='held'",
      [r.value.orderId],
    );
    expect(Number(held.rows[0].n)).toBe(1);
  });

  it("persiste el consentimiento T&C en el pedido (source/version/at)", async () => {
    const r = await checkout.createBooking({
      resourceId,
      date: MON,
      startMinute: 960,
      durationHours: 1,
      customer: { email: "consent@e.cl" },
      termsSource: "customer",
      termsVersion: "2026-07-06",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const o = await pg.query<{ terms_source: string | null; terms_version: string | null; terms_accepted_at: string | null }>(
      "select terms_source, terms_version, terms_accepted_at from orders where id=$1",
      [r.value.orderId],
    );
    expect(o.rows[0].terms_source).toBe("customer");
    expect(o.rows[0].terms_version).toBe("2026-07-06");
    expect(o.rows[0].terms_accepted_at).not.toBeNull();
  });

  it("sin consentimiento: columnas terms_* quedan NULL", async () => {
    const r = await checkout.createBooking({
      resourceId,
      date: MON,
      startMinute: 960,
      durationHours: 1,
      customer: { email: "noconsent@e.cl" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const o = await pg.query<{ terms_source: string | null; terms_accepted_at: string | null }>(
      "select terms_source, terms_accepted_at from orders where id=$1",
      [r.value.orderId],
    );
    expect(o.rows[0].terms_source).toBeNull();
    expect(o.rows[0].terms_accepted_at).toBeNull();
  });

  it("rechaza un segundo booking que se traslapa (slot_taken)", async () => {
    const first = await checkout.createBooking({
      resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: "a@e.cl" },
    });
    expect(first.ok).toBe(true);

    const second = await checkout.createBooking({
      resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: "b@e.cl" },
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("slot_taken");
  });
});

/**
 * Descuento manual del admin contra el price book real. El caso es el que motivó
 * la feature: Vie 19:00, 2h punta finde + grabación audio+video, con un descuento
 * pactado por WhatsApp. Lo que se verifica acá y no en los unit tests es que la
 * BOLETA salga bien sola: `create_boleta_amount` deriva el neto de la razón
 * net_clp/amount_clp del pedido, así que basta con que el pedido nazca cuadrado.
 */
describe("CheckoutService.createBooking — descuento manual", () => {
  const VIE = futureDate(5);
  const base = {
    date: VIE,
    startMinute: 1140, // 19:00
    durationHours: 2,
    addonKeys: ["audioVideo"],
    customer: { name: "Test", email: "t@e.cl" },
  };

  it("sin descuento, el caso base cotiza $75.970", async () => {
    const r = await checkout.createBooking({ resourceId, ...base });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amount).toBe(75970);
  });

  it("modo monto: cobra EXACTAMENTE el total prometido y cuadra líneas, neto e IVA", async () => {
    const r = await checkout.createBooking({
      resourceId,
      ...base,
      manualDiscount: { target: { kind: "total" }, mode: "amount", value: 7994, reason: "primera reserva" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.amount).toBe(67976);

    const order = await pg.query<{ amount_clp: number; net_clp: number; tax_clp: number }>(
      "select amount_clp, net_clp, tax_clp from orders where id=$1",
      [r.value.orderId],
    );
    const { amount_clp, net_clp, tax_clp } = order.rows[0];
    expect(amount_clp).toBe(67976);
    expect(net_clp + tax_clp).toBe(67976);

    const lines = await pg.query<{ s: string }>(
      "select coalesce(sum(subtotal_clp),0)::text s from order_lines where order_id=$1",
      [r.value.orderId],
    );
    expect(Number(lines.rows[0].s)).toBe(67976);

    const disc = await pg.query<{ description: string; subtotal_clp: number }>(
      "select description, subtotal_clp from order_lines where order_id=$1 and line_type='discount' and subtotal_clp=-7994",
      [r.value.orderId],
    );
    expect(disc.rows[0].description).toBe("Descuento · primera reserva");
  });

  it("modo porcentaje: 20% de la sala se suma al 10% de volumen (no se compone)", async () => {
    const r = await checkout.createBooking({
      resourceId,
      ...base,
      manualDiscount: { target: { kind: "room" }, mode: "pct", value: 20, reason: "primera reserva" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // sala 39.980 × 20% = 7.996 → $8.000; total 75.970 − 8.000
    expect(r.value.amount).toBe(67970);

    const disc = await pg.query<{ description: string }>(
      "select description from order_lines where order_id=$1 and line_type='discount' and subtotal_clp=-8000",
      [r.value.orderId],
    );
    expect(disc.rows[0].description).toBe("Descuento 20% sala · primera reserva");
  });

  it("regalar la grabación descuenta justo ese add-on", async () => {
    const r = await checkout.createBooking({
      resourceId,
      ...base,
      manualDiscount: { target: { kind: "addon", key: "audioVideo" }, mode: "pct", value: 100, reason: "" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amount).toBe(35980); // 75.970 − 39.990
  });

  it("la boleta se emite por el total ya descontado y cuadra neto + IVA", async () => {
    const r = await checkout.createBooking({
      resourceId,
      ...base,
      manualDiscount: { target: { kind: "total" }, mode: "amount", value: 7994, reason: "primera reserva" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await pg.query("select confirm_payment($1,$2)", [r.value.orderId, "pay-descuento"]);

    const bol = await pg.query<{ neto: number; iva: number; total: number; status: string }>(
      "select neto, iva, total, status from tax_documents where order_id=$1 and kind='boleta'",
      [r.value.orderId],
    );
    expect(bol.rows).toHaveLength(1);
    const { neto, iva, total } = bol.rows[0];
    expect(total).toBe(67976);
    expect(neto + iva).toBe(67976);
  });

  it("un descuento que se come el total se rechaza sin crear nada", async () => {
    const r = await checkout.createBooking({
      resourceId,
      ...base,
      manualDiscount: { target: { kind: "total" }, mode: "pct", value: 100, reason: "gratis" },
    });
    expect(r.ok).toBe(false);
    const orders = await pg.query<{ n: string }>("select count(*)::text n from orders");
    expect(orders.rows[0].n).toBe("0");
  });
});

/**
 * El descuento manual tiene que sobrevivir al reagendamiento. Antes de este
 * arreglo, `loadContext` leía solo las líneas con `addon_key`, así que la
 * concesión desaparecía y el motor re-cotizaba a tarifa de lista: mover una
 * reserva al MISMO precio le pedía al cliente exactamente el descuento que se le
 * había dado. Reserva real que lo destapó: Patricio, 2026-08-24.
 */
describe("descuento manual → contexto de reagendamiento", () => {
  // Mismo caso real que el bloque de arriba: Vie 19:00, 2h punta finde + grabación.
  const base = {
    date: futureDate(5),
    startMinute: 1140, // 19:00
    durationHours: 2,
    addonKeys: ["audioVideo"],
    customer: { name: "Test", email: "t@e.cl" },
  };

  it("rescata la concesión del pedido, con su glosa, desde las líneas reales", async () => {
    const r = await checkout.createBooking({
      resourceId,
      ...base,
      manualDiscount: { target: { kind: "room" }, mode: "pct", value: 20, reason: "primera reserva" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.amount).toBe(67970);

    const res = await pg.query<{ id: string }>("select id from reservations where order_id=$1", [r.value.orderId]);
    const ctx = await new SupabaseRescheduleRepository(db).loadContext(res.rows[0].id);
    expect(ctx?.concessionClp).toBe(8000);
    expect(ctx?.concessionLabel).toBe("Descuento 20% sala · primera reserva");
    // Los add-ons se siguen leyendo igual que antes (no se rompió lo que funcionaba).
    expect(ctx?.addonKeys).toEqual(["audioVideo"]);
  });

  it("la concesión es exactamente la brecha entre el quote del motor y lo cobrado", async () => {
    const r = await checkout.createBooking({
      resourceId,
      ...base,
      manualDiscount: { target: { kind: "room" }, mode: "pct", value: 20, reason: "primera reserva" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const o = await pg.query<{ snapshot_total: number; amount_clp: number }>(
      "select (pricing_snapshot->>'total')::int snapshot_total, amount_clp from orders where id=$1",
      [r.value.orderId],
    );
    const { snapshot_total, amount_clp } = o.rows[0];
    expect(snapshot_total).toBe(75970);
    expect(amount_clp).toBe(67970);

    const res = await pg.query<{ id: string }>("select id from reservations where order_id=$1", [r.value.orderId]);
    const ctx = await new SupabaseRescheduleRepository(db).loadContext(res.rows[0].id);
    expect(ctx?.concessionClp).toBe(snapshot_total - amount_clp);
  });

  it("sin descuento manual la concesión es 0 (la línea de volumen no cuenta)", async () => {
    const r = await checkout.createBooking({ resourceId, ...base });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const res = await pg.query<{ id: string }>("select id from reservations where order_id=$1", [r.value.orderId]);
    const ctx = await new SupabaseRescheduleRepository(db).loadContext(res.rows[0].id);
    expect(ctx?.concessionClp).toBe(0);
    expect(ctx?.concessionLabel).toBe("");
  });
});

/**
 * Descuento manual + canje de puntos en la MISMA reserva, que es lo que estrena
 * la consola del admin. El orden importa y es el del servidor: el descuento baja
 * el total primero y los puntos se descuentan sobre ESE total. Al revés se
 * "perderían" puntos contra un total que el descuento iba a bajar igual.
 */
describe("CheckoutService.createBooking — descuento + canje", () => {
  const VIE = futureDate(5);
  const base = {
    date: VIE,
    startMinute: 1140, // 19:00
    durationHours: 2,
    addonKeys: ["audioVideo"],
    customer: { name: "Test", email: "canje@fotf.cl" },
  };

  /** Ficha con saldo, como la que el picker entrega a la consola. */
  async function fichaConSaldo(points: number): Promise<string> {
    const c = await pg.query<{ id: string }>(
      "insert into customers (name, email, phone) values ('Canje Test', 'canje@fotf.cl', null) returning id",
    );
    const id = c.rows[0].id;
    if (points > 0) {
      await pg.query("select apply_points($1, null, 'adjust', $2, 'fixture')", [id, points]);
    }
    return id;
  }

  it("el canje se descuenta DESPUÉS del descuento manual", async () => {
    const customerId = await fichaConSaldo(20_000);
    const r = await checkout.createBooking({
      resourceId,
      ...base,
      customerId,
      manualDiscount: { target: { kind: "room" }, mode: "pct", value: 20, reason: "primera reserva" },
      pointsToRedeem: 10_000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 75.970 − 8.000 (descuento) − 10.000 (puntos) = 57.970 de efectivo.
    expect(r.value.amount).toBe(57_970);
    expect(r.value.pointsApplied).toBe(10_000);

    const o = await pg.query<{ amount_clp: number; net_clp: number; tax_clp: number; points_redeemed_clp: number }>(
      "select amount_clp, net_clp, tax_clp, points_redeemed_clp from orders where id=$1",
      [r.value.orderId],
    );
    expect(o.rows[0].amount_clp).toBe(57_970);
    expect(o.rows[0].points_redeemed_clp).toBe(10_000);
    // amount_clp sigue siendo EFECTIVO: neto + IVA cuadran con lo que cobra MP.
    expect(o.rows[0].net_clp + o.rows[0].tax_clp).toBe(57_970);

    // Las líneas suman el efectivo, con su línea propia de canje.
    const lines = await pg.query<{ s: string }>(
      "select coalesce(sum(subtotal_clp),0)::text s from order_lines where order_id=$1",
      [r.value.orderId],
    );
    expect(Number(lines.rows[0].s)).toBe(57_970);

    // Y el saldo bajó exactamente lo canjeado.
    const bal = await pg.query<{ points_balance: number }>("select points_balance from customers where id=$1", [
      customerId,
    ]);
    expect(bal.rows[0].points_balance).toBe(10_000);
  });

  it("canje que cubre todo: confirma sola, sin MP y sin boleta", async () => {
    const customerId = await fichaConSaldo(200_000);
    const r = await checkout.createBooking({ resourceId, ...base, customerId, pointsToRedeem: 200_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.amount).toBe(0);
    expect(r.value.paidWithPoints).toBe(true);
    // Se capó al total: no se gastan más puntos que el precio de la reserva.
    expect(r.value.pointsApplied).toBe(75_970);

    const o = await pg.query<{ status: string; mp_payment_id: string | null }>(
      "select status, mp_payment_id from orders where id=$1",
      [r.value.orderId],
    );
    expect(o.rows[0].status).toBe("paid");
    expect(o.rows[0].mp_payment_id).toBe("offline:puntos");

    // $0 no emite boleta.
    const bol = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='boleta'",
      [r.value.orderId],
    );
    expect(Number(bol.rows[0].n)).toBe(0);
  });

  it("sin saldo suficiente falla y NO deja la reserva a medias", async () => {
    const customerId = await fichaConSaldo(1_000);
    const r = await checkout.createBooking({ resourceId, ...base, customerId, pointsToRedeem: 50_000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("insufficient_points");

    // La transacción entera se revirtió: ni reserva, ni pedido, ni saldo tocado.
    const res = await pg.query<{ n: string }>("select count(*)::text n from reservations");
    expect(Number(res.rows[0].n)).toBe(0);
    const bal = await pg.query<{ points_balance: number }>("select points_balance from customers where id=$1", [
      customerId,
    ]);
    expect(bal.rows[0].points_balance).toBe(1_000);
  });

  it("canjear sin ficha se rechaza en la capa de aplicación", async () => {
    const r = await checkout.createBooking({ resourceId, ...base, pointsToRedeem: 5_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("points_session");
  });
});
