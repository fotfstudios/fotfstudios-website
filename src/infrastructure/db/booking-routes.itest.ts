/**
 * Integración de las rutas del flujo de reserva (availability + bookings +
 * status). Ejercita los handlers reales. Requiere Supabase local.
 *
 * Dos bloques: los que llegan hasta Mercado Pago se omiten sin
 * `MP_ACCESS_TOKEN`; el de puntos NO se omite nunca — una reserva 100% puntos
 * vuelve antes de que se construya el servicio de pago y el mailer cae al
 * no-op sin `RESEND_API_KEY`. El flag de reservas se setea en el `beforeAll`
 * porque la ruta lo lee en cada llamada.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as availabilityGET } from "@/app/api/availability/route";
import { POST as bookingsPOST } from "@/app/api/bookings/route";
import { GET as statusGET } from "@/app/api/orders/[id]/status/route";
import { futureDate } from "@/tests/dates";

// Sesión mockeada: variable mutable vía vi.hoisted (la fábrica de vi.mock se
// iza sobre el módulo). Los casos con token no la tocan — solo se consulta con
// `pointsToRedeem > 0`.
const auth = vi.hoisted(() => ({ session: null as { userId: string; email: string } | null }));
vi.mock("@/src/infrastructure/auth/require-customer", () => ({
  currentCustomer: async () => auth.session,
  requireCustomer: async () => {
    if (!auth.session) throw new Error("no autorizado");
    return auth.session;
  },
  assertCustomer: async () => {
    if (!auth.session) throw new Error("no autorizado");
    return auth.session;
  },
}));

const TOKEN = process.env.MP_ACCESS_TOKEN ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, points_ledger, customers cascade";
const MON = futureDate(1); // lunes futuro

// Usuario de auth propio de este archivo (ids distintos a points/customer-repo).
const AUTH_USER = "e0000000-0000-4000-a000-000000000301";
const AUTH_EMAIL = "ruta@bookings.cl";

const insertAuthUser = (id: string, email: string) =>
  pg.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
       $2, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
     ) on conflict (id) do nothing`,
    [id, email],
  );

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await insertAuthUser(AUTH_USER, AUTH_EMAIL);
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
  auth.session = null;
});

describe.skipIf(!TOKEN)("rutas de reserva", () => {
  it("availability → bookings → status (happy path)", async () => {
    const av = await availabilityGET(
      new Request(`http://x/api/availability?resource=${resourceId}&date=${MON}`),
    );
    expect(av.status).toBe(200);
    const avJson = await av.json();
    expect(avJson.openMinute).toBe(540);

    const res = await bookingsPOST(
      new Request("http://x/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId,
          date: MON,
          startMinute: 600,
          durationHours: 1,
          customer: { email: "x@e.cl" },
          termsAccepted: true,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.initPoint).toMatch(/^https:\/\//);
    expect(json.orderId).toBeTruthy();
    // Wallet Brick (onSubmit) necesita el preference id en la respuesta.
    expect(json.preferenceId).toBeTruthy();

    const st = await statusGET(new Request("http://x"), { params: Promise.resolve({ id: json.orderId }) });
    expect(st.status).toBe(200);
    expect((await st.json()).status).toBe("pending_payment");
  });

  it("rechaza horario ya tomado (409)", async () => {
    const make = () =>
      bookingsPOST(
        new Request("http://x/api/bookings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resourceId,
            date: MON,
            startMinute: 660,
            durationHours: 1,
            customer: { email: "y@e.cl" },
            termsAccepted: true,
          }),
        }),
      );
    expect((await make()).status).toBe(200);
    expect((await make()).status).toBe(409);
  });

  it("rechaza sin aceptar los términos (400 terms_required)", async () => {
    const res = await bookingsPOST(
      new Request("http://x/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId,
          date: MON,
          startMinute: 720,
          durationHours: 1,
          customer: { email: "z@e.cl" },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("terms_required");
  });
});

/**
 * Bloque SIN gate de MP: la ruta real, con sesión mockeada y canje 100%.
 *
 * Existe por el hallazgo de la revisión final: la línea que este PR agrega
 * (`customerId = ensured.profile.id`, no `session.userId`) no tenía ningún
 * test que fallara al revertirla — el itest nuevo llama al checkout service
 * directo y el itest de la ruta estaba gateado por el token de MP. Acá se
 * ejercita el handler completo.
 */
describe("POST /api/bookings: identidad del canje (sin MP)", () => {
  const FLAG = "NEXT_PUBLIC_BOOKING_ENABLED";
  const prevFlag = process.env[FLAG];

  beforeAll(() => {
    // La ruta lee el flag en cada llamada (bookingEnabled()); en CI no hay .env.local.
    process.env[FLAG] = "true";
  });
  afterAll(() => {
    if (prevFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prevFlag;
  });

  /** Ficha del directorio ADOPTADA por la cuenta: su id NO es el del usuario de auth. */
  async function adoptedCustomer(balance: number): Promise<string> {
    const r = await pg.query<{ id: string }>(
      "insert into customers (email, name, auth_user_id) values ($1, 'Titular Adoptado', $2) returning id",
      [AUTH_EMAIL, AUTH_USER],
    );
    const id = r.rows[0].id;
    await pg.query("select apply_points($1, null, 'adjust', $2, 'seed-route')", [id, balance]);
    return id;
  }

  const post = (body: Record<string, unknown>) =>
    bookingsPOST(
      new Request("http://x/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  const fullPointsBody = (startMinute: number, over: Record<string, unknown> = {}) => ({
    resourceId,
    date: MON,
    startMinute,
    durationHours: 1,
    customer: { email: AUTH_EMAIL },
    pointsToRedeem: 50_000, // se capa al total del quote → efectivo 0
    termsAccepted: true,
    ...over,
  });

  it("canjea contra la FICHA (id ≠ usuario de auth), nunca contra el usuario", async () => {
    const customerId = await adoptedCustomer(50_000);
    expect(customerId).not.toBe(AUTH_USER);
    auth.session = { userId: AUTH_USER, email: AUTH_EMAIL };

    const res = await post(fullPointsBody(600));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paidWithPoints).toBe(true);
    expect(json.pointsApplied).toBeGreaterThan(0);

    // El asiento de canje del pedido lleva el id del REGISTRO.
    const redeem = await pg.query<{ customer_id: string; amount: number }>(
      "select customer_id, amount from points_ledger where order_id = $1 and kind = 'redeem'",
      [json.orderId],
    );
    expect(redeem.rows).toHaveLength(1);
    expect(redeem.rows[0].customer_id).toBe(customerId);
    expect(redeem.rows[0].amount).toBe(-json.pointsApplied);

    // Y NADA quedó escrito contra el usuario de auth (que no tiene ficha propia).
    const byAuthUser = await pg.query("select 1 from points_ledger where customer_id = $1", [AUTH_USER]);
    expect(byAuthUser.rowCount).toBe(0);
    expect(await pg.query("select 1 from customers where id = $1", [AUTH_USER])).toMatchObject({ rowCount: 0 });

    // El saldo bajó en la ficha, y el pedido quedó sin efectivo que cobrar.
    const bal = await pg.query<{ b: number }>("select points_balance b from customers where id = $1", [customerId]);
    expect(bal.rows[0].b).toBe(50_000 - json.pointsApplied);
    const order = await pg.query<{ amount_clp: number; points_redeemed_clp: number; status: string }>(
      "select amount_clp, points_redeemed_clp, status from orders where id = $1",
      [json.orderId],
    );
    expect(order.rows[0]).toMatchObject({ amount_clp: 0, points_redeemed_clp: json.pointsApplied });
  });

  it("el horario ya tomado sigue siendo 409 por el camino de puntos", async () => {
    await adoptedCustomer(50_000);
    auth.session = { userId: AUTH_USER, email: AUTH_EMAIL };

    expect((await post(fullPointsBody(660))).status).toBe(200);
    const second = await post(fullPointsBody(660));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("slot_taken");
  });

  // PR3: con la ficha vinculada, el snapshot sale del REGISTRO, no del body. Un
  // titular de cuenta conserva su nombre y su email (ni un nombre de 120
  // caracteres se los pisa) y solo un teléfono vacío se llena con lo tipeado.
  it("el snapshot sale de la FICHA vinculada; el teléfono tipeado solo llena el que la ficha no tiene", async () => {
    const customerId = await adoptedCustomer(50_000);
    auth.session = { userId: AUTH_USER, email: AUTH_EMAIL };

    const res = await post(
      fullPointsBody(720, { customer: { email: AUTH_EMAIL, name: "N".repeat(120), phone: "962803298" } }),
    );
    expect(res.status).toBe(200);
    const { orderId } = await res.json();

    const snap = await pg.query<{
      customer_id: string;
      customer_name: string;
      customer_phone: string;
      customer_email: string;
    }>("select customer_id, customer_name, customer_phone, customer_email from orders where id = $1", [orderId]);
    expect(snap.rows[0]).toMatchObject({
      customer_id: customerId,
      customer_name: "Titular Adoptado",
      customer_phone: "+56962803298",
      customer_email: AUTH_EMAIL,
    });

    // La ficha del titular tampoco cambia de nombre por el camino del checkout.
    const rec = await pg.query<{ name: string; phone: string | null }>(
      "select name, phone from customers where id=$1",
      [customerId],
    );
    expect(rec.rows[0]).toEqual({ name: "Titular Adoptado", phone: null });
  });

  // Fix round 2: `name`/`phone` no-string reventaban dentro del try (la ruta
  // les llama trim/slice) y salían como 503. Un cuerpo malformado es 400.
  it.each([{ name: 12345 }, { phone: { n: 1 } }, { name: ["a"] }])(
    "un %o no-string en el customer es 400, no 503",
    async (bad) => {
      const res = await post({
        resourceId,
        date: MON,
        startMinute: 780,
        durationHours: 1,
        customer: { email: AUTH_EMAIL, ...bad },
        termsAccepted: true,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("datos incompletos");
    },
  );
});
