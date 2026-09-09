/**
 * Directorio de clientes (migración customer_directory): identidad propia de customers,
 * customer_id en reservas/pedidos y las RPC del directorio. Solo `pg` (sin supabase-js):
 * las RPC se ejercen directo y las fixtures se insertan como en el seed. Invariante en
 * cada escenario con puntos: customers.points_balance === sum(points_ledger).
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
const pg2 = new Client({ connectionString: DB_URL }); // segunda conexión: carreras
let resourceId: string;

// Usuarios auth de prueba (persisten entre archivos; ids distintos a points/reschedule.itest).
const U1 = "e0000000-0000-4000-a000-000000000101";
const U2 = "e0000000-0000-4000-a000-000000000102";
const U_HOLDER = "e0000000-0000-4000-a000-000000000103";
const ACTOR = "e0000000-0000-4000-a000-0000000000aa"; // created_by del evento (columna sin FK)

const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, " +
  "reschedules, booking_events, points_ledger, customers cascade";

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

type Snapshot = {
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

/** Ficha insertada directo (fixture), sin pasar por las RPC. Devuelve el id. */
async function customer(c: {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  authUserId?: string | null;
}): Promise<string> {
  const { rows } = await pg.query<{ id: string }>(
    `insert into customers (id, name, email, phone, auth_user_id)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5) returning id`,
    [c.id ?? null, c.name ?? null, c.email ?? null, c.phone ?? null, c.authUserId ?? null],
  );
  return rows[0].id;
}

let slot = 0;
/**
 * Reserva 'booking' + pedido pending_payment insertados directo (como el seed). Cada llamada
 * usa un slot horario distinto, dos semanas adelante (GiST anti-solape).
 */
async function booking(c: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customerId?: string | null;
  amount?: number;
  status?: "held" | "confirmed" | "cancelled";
}): Promise<{ orderId: string; reservationId: string }> {
  slot += 1;
  const starts = new Date(Date.now() + (24 * 14 + slot) * 3_600_000);
  const ends = new Date(starts.getTime() + 3_600_000);
  const amount = c.amount ?? 9990;
  const net = Math.round(amount / 1.19);
  const status = c.status ?? "held";
  const o = await pg.query<{ id: string }>(
    `insert into orders (status, amount_clp, net_clp, tax_clp, customer_name, customer_email, customer_phone, customer_id)
       values ('pending_payment', $1, $2, $3, $4, $5, $6, $7) returning id`,
    [amount, net, amount - net, c.name ?? null, c.email ?? null, c.phone ?? null, c.customerId ?? null],
  );
  const r = await pg.query<{ id: string }>(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at, order_id,
                               customer_name, customer_email, customer_phone, customer_id)
       values ($1, 'booking', $2::reservation_status, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [
      resourceId,
      status,
      starts.toISOString(),
      ends.toISOString(),
      status === "held" ? new Date(Date.now() + 1_800_000).toISOString() : null,
      o.rows[0].id,
      c.name ?? null,
      c.email ?? null,
      c.phone ?? null,
      c.customerId ?? null,
    ],
  );
  return { orderId: o.rows[0].id, reservationId: r.rows[0].id };
}

/** confirm_payment directo: paid + confirmed + earn (si el email tiene ficha) + boleta. */
const pay = (orderId: string, paymentId: string) => pg.query("select confirm_payment($1, $2)", [orderId, paymentId]);

const snapshot = async (table: "orders" | "reservations", id: string): Promise<Snapshot> =>
  (
    await pg.query<Snapshot>(
      `select customer_id, customer_name, customer_email, customer_phone from ${table} where id=$1`,
      [id],
    )
  ).rows[0];

const balance = async (id: string) =>
  (await pg.query<{ b: number }>("select points_balance b from customers where id=$1", [id])).rows[0].b;
const ledgerSum = async (id: string) =>
  Number(
    (await pg.query<{ s: string }>("select coalesce(sum(amount),0)::text s from points_ledger where customer_id=$1", [id]))
      .rows[0].s,
  );
/** El invariante contable del sistema. */
const expectBalanceConsistent = async (id: string) => expect(await balance(id)).toBe(await ledgerSum(id));
const count = async (fromClause: string, params: unknown[] = []) =>
  Number((await pg.query<{ n: string }>(`select count(*)::text n from ${fromClause}`, params)).rows[0].n);

beforeAll(async () => {
  await pg.connect();
  await pg2.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await insertAuthUser(U1, "u1@dir.cl");
  await insertAuthUser(U2, "u2@dir.cl");
  await insertAuthUser(U_HOLDER, "titular@dir.cl");
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
  await pg2.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe("esquema: identidad propia, constraints, phone_digits y customer_id", () => {
  it("una ficha ya no necesita usuario auth: id por default y FK a auth.users eliminada", async () => {
    const { rows } = await pg.query<{ id: string; auth_user_id: string | null }>(
      "insert into customers (email) values ('sin-auth@dir.cl') returning id, auth_user_id",
    );
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].auth_user_id).toBeNull();
  });

  it("phone_digits se deriva del teléfono ('+56 9 8123 4567' → '56981234567'); email opcional si hay teléfono", async () => {
    const { rows } = await pg.query<{ phone_digits: string | null; email: string | null }>(
      "insert into customers (name, phone) values ('Pía Contreras', '+56 9 8123 4567') returning phone_digits, email",
    );
    expect(rows[0]).toEqual({ phone_digits: "56981234567", email: null });
    const none = await pg.query<{ phone_digits: string | null }>(
      "insert into customers (email, phone) values ('sin-fono@dir.cl', null) returning phone_digits",
    );
    expect(none.rows[0].phone_digits).toBeNull();
  });

  it("constraints: minúsculas, contacto obligatorio, largo de nombre/teléfono, email único, auth_user_id único y con FK", async () => {
    await expect(pg.query("insert into customers (email) values ('MiXeD@dir.cl')")).rejects.toMatchObject({
      code: "23514",
      constraint: "customers_email_lower",
    });
    await expect(pg.query("insert into customers (name) values ('Solo Nombre')")).rejects.toMatchObject({
      code: "23514",
      constraint: "customers_contact_required",
    });
    await expect(
      pg.query("insert into customers (email, name) values ('largo@dir.cl', $1)", ["N".repeat(81)]),
    ).rejects.toMatchObject({ code: "23514", constraint: "customers_name_len" });
    await expect(pg.query("insert into customers (email, phone) values ('corto@dir.cl', '12345')")).rejects.toMatchObject({
      code: "23514",
      constraint: "customers_phone_len",
    });
    await pg.query("insert into customers (email) values ('unico@dir.cl')");
    await expect(pg.query("insert into customers (email) values ('unico@dir.cl')")).rejects.toMatchObject({
      code: "23505",
      constraint: "customers_email_key",
    });
    await expect(
      pg.query("insert into customers (email, auth_user_id) values ('fantasma@dir.cl', 'e0000000-0000-4000-a000-0000000000ff')"),
    ).rejects.toMatchObject({ code: "23503", constraint: "customers_auth_user_id_fkey" });
    await pg.query("insert into customers (email, auth_user_id) values ('u1@dir.cl', $1)", [U1]);
    await expect(
      pg.query("insert into customers (email, auth_user_id) values ('u1-bis@dir.cl', $1)", [U1]),
    ).rejects.toMatchObject({ code: "23505", constraint: "customers_auth_user_id_key" });
  });

  it("reservations/orders.customer_id: FK a customers con on delete set null; índices parciales presentes", async () => {
    const c = await customer({ name: "Link", email: "link@dir.cl" });
    const b = await booking({ name: "Link", email: "link@dir.cl", customerId: c });
    expect((await snapshot("orders", b.orderId)).customer_id).toBe(c);
    expect((await snapshot("reservations", b.reservationId)).customer_id).toBe(c);
    await pg.query("delete from customers where id=$1", [c]);
    expect((await snapshot("orders", b.orderId)).customer_id).toBeNull();
    expect((await snapshot("reservations", b.reservationId)).customer_id).toBeNull();
    const idx = await pg.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where indexname in ('customers_phone_digits_idx','customers_created_idx','reservations_customer_idx','orders_customer_idx')
        order by 1`,
    );
    expect(idx.rows.map((r) => r.indexname)).toEqual([
      "customers_created_idx",
      "customers_phone_digits_idx",
      "orders_customer_idx",
      "reservations_customer_idx",
    ]);
  });
});

describe("upsert_guest_customer (escritor único de invitados)", () => {
  const upsert = async (name: string | null, email: string | null, phone: string | null) =>
    (await pg.query<{ id: string | null }>("select upsert_guest_customer($1, $2, $3) id", [name, email, phone])).rows[0].id;

  it("la puerta de forma acepta un email normal (normalizado) y devuelve null ante 'a@b' y otras basuras", async () => {
    const id = await upsert("  Matías Rojas ", " Matias.Rojas@Gmail.com ", "+56 9 8123 4567");
    expect(id).not.toBeNull();
    const row = await pg.query<{ name: string; email: string; phone: string; phone_digits: string }>(
      "select name, email, phone, phone_digits from customers where id=$1",
      [id],
    );
    expect(row.rows[0]).toEqual({
      name: "Matías Rojas",
      email: "matias.rojas@gmail.com",
      phone: "+56 9 8123 4567",
      phone_digits: "56981234567",
    });
    for (const bad of ["a@b", "", null, "sin-arroba.cl", "dos@@x.cl", "con espacio@x.cl", `${"a".repeat(116)}@x.cl`]) {
      expect(await upsert("X", bad, null)).toBeNull();
    }
    expect(await upsert("Y", `${"a".repeat(110)}@x.cl`, null)).not.toBeNull(); // 115 chars: dentro del tope 120
    expect(await count("customers")).toBe(2);
  });

  it("nombre vacío y teléfono fuera de 6–40 se guardan como null (basta el email)", async () => {
    const id = await upsert("   ", "solo-email@dir.cl", "123");
    const row = await pg.query<{ name: string | null; phone: string | null }>("select name, phone from customers where id=$1", [id]);
    expect(row.rows[0]).toEqual({ name: null, phone: null });
  });

  it("para fichas de invitado ganan los datos tipeados; los vacíos no pisan lo existente", async () => {
    const g = await upsert("Ana", "ana@dir.cl", "+56911111111");
    expect(await upsert("Ana María", "ANA@dir.cl", "+56922222222")).toBe(g);
    expect((await pg.query("select name, phone from customers where id=$1", [g])).rows[0]).toEqual({
      name: "Ana María",
      phone: "+56922222222",
    });
    expect(await upsert(null, "ana@dir.cl", null)).toBe(g);
    expect((await pg.query("select name, phone from customers where id=$1", [g])).rows[0]).toEqual({
      name: "Ana María",
      phone: "+56922222222",
    });
    expect(await count("customers")).toBe(1);
  });

  it("titular de cuenta: conserva nombre y email; solo se rellena un teléfono vacío", async () => {
    const h = await customer({ name: "Titular Real", email: "titular@dir.cl", phone: null, authUserId: U_HOLDER });
    expect(await upsert("Otro Nombre", "titular@dir.cl", "+56933333333")).toBe(h);
    expect((await pg.query("select name, phone from customers where id=$1", [h])).rows[0]).toEqual({
      name: "Titular Real",
      phone: "+56933333333",
    });
    expect(await upsert("Otro", "titular@dir.cl", "+56944444444")).toBe(h);
    expect((await pg.query<{ phone: string }>("select phone from customers where id=$1", [h])).rows[0].phone).toBe(
      "+56933333333", // ya tenía teléfono → no se pisa
    );
  });
});

describe("ensure_customer_for_user (login → ficha)", () => {
  const ensure = async (user: string, email: string, client: Client = pg) =>
    (await client.query<{ id: string }>("select ensure_customer_for_user($1, $2) id", [user, email])).rows[0].id;

  it("adopta la ficha del directorio conservando su id (normaliza el email) y es idempotente", async () => {
    const guest = await customer({ name: "Uno", email: "u1@dir.cl", phone: "+56911111111" });
    expect(await ensure(U1, " U1@dir.cl ")).toBe(guest);
    expect((await pg.query("select auth_user_id, name from customers where id=$1", [guest])).rows[0]).toEqual({
      auth_user_id: U1,
      name: "Uno",
    });
    expect(await ensure(U1, "u1@dir.cl")).toBe(guest);
    expect(await count("customers")).toBe(1);
  });

  it("sin ficha previa crea una con id = usuario auth", async () => {
    expect(await ensure(U1, "u1@dir.cl")).toBe(U1);
    expect((await pg.query("select auth_user_id, email from customers where id=$1", [U1])).rows[0]).toEqual({
      auth_user_id: U1,
      email: "u1@dir.cl",
    });
  });

  it("reclama la fila legacy (id = usuario, auth_user_id null) aunque el email de auth haya cambiado", async () => {
    await customer({ id: U1, email: "viejo@dir.cl" }); // creada por el upsert-por-id anterior a PR2
    expect(await ensure(U1, "u1@dir.cl")).toBe(U1);
    expect((await pg.query("select auth_user_id, email from customers where id=$1", [U1])).rows[0]).toEqual({
      auth_user_id: U1,
      email: "u1@dir.cl",
    });
  });

  it("refresca el email si cambió en auth y está libre; si otra ficha lo tiene, levanta", async () => {
    await ensure(U1, "u1@dir.cl");
    await ensure(U1, "nuevo@dir.cl");
    expect((await pg.query<{ email: string }>("select email from customers where id=$1", [U1])).rows[0].email).toBe("nuevo@dir.cl");
    await customer({ name: "Otra", email: "ocupado@dir.cl" });
    await expect(ensure(U1, "ocupado@dir.cl")).rejects.toThrow("customer_email_owned_by_other_user");
    expect((await pg.query<{ email: string }>("select email from customers where id=$1", [U1])).rows[0].email).toBe("nuevo@dir.cl");
  });

  it("dos usuarios auth con el mismo email: el segundo levanta (nunca se fusiona)", async () => {
    await ensure(U1, "mismo@dir.cl");
    await expect(ensure(U2, "mismo@dir.cl")).rejects.toThrow("customer_email_owned_by_other_user");
    expect(await count("customers")).toBe(1);
  });

  it("email vacío levanta customer_email_required", async () => {
    await expect(ensure(U1, "  ")).rejects.toThrow("customer_email_required");
  });

  it("carrera: dos llamadas concurrentes del mismo usuario → una sola ficha", async () => {
    const [a, b] = await Promise.all([ensure(U1, "u1@dir.cl", pg), ensure(U1, "u1@dir.cl", pg2)]);
    expect(a).toBe(b);
    expect(await count("customers where auth_user_id=$1", [U1])).toBe(1);
  });

  it("al refrescar el email de auth propaga el snapshot: mark_refunded sigue revocando del MISMO cliente", async () => {
    const c = await customer({ name: "Uno", email: "u1@dir.cl", authUserId: U1 });
    const b = await booking({ name: "Uno", email: "u1@dir.cl", customerId: c });
    await pay(b.orderId, "ens1"); // earn 499 a c (join por email)
    expect(await balance(c)).toBe(499);
    expect(await ensure(U1, "nuevo@dir.cl")).toBe(c);
    const expected = { customer_id: c, customer_name: "Uno", customer_email: "nuevo@dir.cl", customer_phone: null };
    expect(await snapshot("orders", b.orderId)).toEqual(expected);
    expect(await snapshot("reservations", b.reservationId)).toEqual(expected);
    await pg.query("select mark_refunded($1, 'ens1-rf', null)", [b.orderId]);
    expect(await balance(c)).toBe(0);
    await expectBalanceConsistent(c);
  });
});

describe("backfill_customers_from_bookings (definido en PR1, se ejecuta en PR3)", () => {
  const backfill = async () => (await pg.query<{ n: number }>("select backfill_customers_from_bookings() n")).rows[0].n;

  it("una ficha por email en minúsculas; nombre/teléfono por independiente (pagada > abandonada, luego más reciente); sucias sin vincular; re-corrida → 0", async () => {
    // Mismo email con mayúsculas en dos pedidos: el pagado (viejo, nombre bueno) gana al abandonado (nuevo, nombre basura),
    // pero el abandonado aporta el teléfono porque el pagado no tiene.
    const paid = await booking({ name: "Matías Rojas", email: "MiXeD@Case.cl", phone: null });
    await pay(paid.orderId, "bf1");
    await pg.query("update orders set created_at = now() - interval '10 days' where id=$1", [paid.orderId]);
    await pg.query("update reservations set created_at = now() - interval '10 days' where id=$1", [paid.reservationId]);
    const abandoned = await booking({ name: "asdf", email: "mixed@case.cl", phone: "+56 9 1111 2222" });
    const padded = await booking({ name: "Padded", email: " padded@case.cl ", phone: null });
    const junk = await booking({ name: "Junk", email: "a@b", phone: null });
    const clamped = await booking({ name: "N".repeat(120), email: "largo@case.cl", phone: "123" }); // teléfono corto → null
    const inherit = await booking({ name: "Hereda", email: "hereda@case.cl", phone: null });
    await pg.query("update reservations set customer_email = null where id=$1", [inherit.reservationId]); // solo el pedido tiene email

    expect(await backfill()).toBe(3); // mixed@case.cl, largo@case.cl, hereda@case.cl

    const mixed = (await pg.query<{ id: string; name: string; phone: string }>("select id, name, phone from customers where email='mixed@case.cl'")).rows[0];
    expect(mixed).toMatchObject({ name: "Matías Rojas", phone: "+56 9 1111 2222" });
    expect((await pg.query("select name, phone from customers where email='largo@case.cl'")).rows[0]).toEqual({
      name: "N".repeat(80),
      phone: null,
    });

    // Vínculos: por email (pedido + reserva) y por herencia del pedido; las sucias quedan sin vincular y sin ficha.
    expect((await snapshot("orders", paid.orderId)).customer_id).toBe(mixed.id);
    expect((await snapshot("orders", abandoned.orderId)).customer_id).toBe(mixed.id);
    expect((await snapshot("reservations", paid.reservationId)).customer_id).toBe(mixed.id);
    expect((await snapshot("reservations", abandoned.reservationId)).customer_id).toBe(mixed.id);
    const hereda = (await pg.query<{ id: string }>("select id from customers where email='hereda@case.cl'")).rows[0].id;
    expect((await snapshot("reservations", inherit.reservationId)).customer_id).toBe(hereda);
    expect((await snapshot("orders", padded.orderId)).customer_id).toBeNull();
    expect((await snapshot("orders", junk.orderId)).customer_id).toBeNull();
    expect((await snapshot("orders", clamped.orderId)).customer_id).not.toBeNull();
    expect(await count("customers where email in (' padded@case.cl ', 'padded@case.cl', 'a@b')")).toBe(0);
    expect(await count("customers")).toBe(3);

    expect(await backfill()).toBe(0); // idempotente: nada nuevo que insertar ni vincular
    expect(await count("customers")).toBe(3);
  });

  it("una ficha existente (login) solo recibe los NULL rellenados; su nombre no se pisa", async () => {
    const existing = await customer({ name: "Ya Existe", email: "existe@case.cl", phone: null });
    const b = await booking({ name: "Otro Nombre", email: "EXISTE@case.cl", phone: "+56 9 3333 4444" });
    expect(await backfill()).toBe(0);
    expect((await pg.query("select name, phone from customers where id=$1", [existing])).rows[0]).toEqual({
      name: "Ya Existe",
      phone: "+56 9 3333 4444",
    });
    expect((await snapshot("orders", b.orderId)).customer_id).toBe(existing);
  });

  it("un pedido vinculado por el backfill se reembolsa con claw-back (retro → mark_refunded → 0)", async () => {
    const b = await booking({ name: "Retro", email: "retro@case.cl" });
    await pay(b.orderId, "bfr1"); // sin ficha → no gana en vivo
    expect(await count("points_ledger")).toBe(0);
    await backfill();
    const c = (await pg.query<{ id: string }>("select id from customers where email='retro@case.cl'")).rows[0].id;
    expect((await pg.query<{ n: number }>("select award_retro_points($1) n", [c])).rows[0].n).toBe(499); // lo que hará PR3
    await pg.query("select mark_refunded($1, 'bfr1-rf', null)", [b.orderId]);
    expect(await balance(c)).toBe(0);
    await expectBalanceConsistent(c);
  });
});
