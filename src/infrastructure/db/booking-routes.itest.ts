/**
 * Integración de las rutas del flujo de reserva (availability + bookings +
 * status). Ejercita los handlers reales. Requiere Supabase local + MP token +
 * NEXT_PUBLIC_BOOKING_ENABLED=true en .env.local. Se omite sin token.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as availabilityGET } from "@/app/api/availability/route";
import { POST as bookingsPOST } from "@/app/api/bookings/route";
import { GET as statusGET } from "@/app/api/orders/[id]/status/route";

const TOKEN = process.env.MP_ACCESS_TOKEN ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup = "truncate reservations, orders, order_lines, payment_intents cascade";

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe.skipIf(!TOKEN)("rutas de reserva", () => {
  it("availability → bookings → status (happy path)", async () => {
    const av = await availabilityGET(
      new Request(`http://x/api/availability?resource=${resourceId}&date=2024-01-01`),
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
          date: "2024-01-01",
          startMinute: 600,
          durationHours: 1,
          customer: { email: "x@e.cl" },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.initPoint).toMatch(/^https:\/\//);
    expect(json.orderId).toBeTruthy();

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
            date: "2024-01-01",
            startMinute: 660,
            durationHours: 1,
            customer: { email: "y@e.cl" },
          }),
        }),
      );
    expect((await make()).status).toBe(200);
    expect((await make()).status).toBe(409);
  });
});
