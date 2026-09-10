/**
 * Adaptador Supabase del directorio (SupabaseCustomerRepository): lo que agrega
 * el ADAPTADOR sobre las RPC/tablas de PR1 — mapeo de columnas, el OR de
 * `bookingsForCustomer`, `EnsureCustomerResult` como valor y la traducción de
 * rechazos a sentinelas. La semántica SQL (adopción, idempotencia, cada
 * `raise exception`) ya la prueba `customers-directory.itest.ts` de PR1: no se
 * repite acá. Fixtures por `pg` (como el seed); el adaptador, por supabase-js.
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CustomerService } from "@/src/application/customers/customer-service";
import { SupabaseCustomerRepository } from "./customer-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseCustomerRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

// Usuarios auth propios de este archivo (ids distintos a points/reschedule/directory).
const U1 = "e0000000-0000-4000-a000-000000000201";
const U2 = "e0000000-0000-4000-a000-000000000202"; // lo usa Task 4 (findByAuthUser sin ficha)

const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, booking_events, points_ledger, customers cascade";

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

/** Ficha insertada directo (fixture), sin pasar por las RPC. Devuelve el id. */
async function customer(c: {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  authUserId?: string | null;
}): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `insert into customers (id, name, email, phone, auth_user_id)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5) returning id`,
    [c.id ?? null, c.name ?? null, c.email ?? null, c.phone ?? null, c.authUserId ?? null],
  );
  return r.rows[0].id;
}

let slot = 0;
/** Reserva 'booking' + pedido pending_payment directo; cada llamada usa otro horario (GiST). */
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

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await insertAuthUser(U1, "u1@repo.cl");
  await insertAuthUser(U2, "u2@repo.cl");
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe("getProfile: identidad propia", () => {
  it("mapea authUserId y createdAt; una ficha del directorio no tiene cuenta", async () => {
    const linked = await customer({ id: U1, email: "linked@repo.cl", name: "Titular", authUserId: U1 });
    const guest = await customer({ name: "Pía", phone: "+56912345678" });

    const a = await repo.getProfile(linked);
    expect(a).toMatchObject({ id: U1, authUserId: U1, email: "linked@repo.cl", name: "Titular", pointsBalance: 0 });
    expect(typeof a?.createdAt).toBe("string");

    const b = await repo.getProfile(guest);
    expect(b).toMatchObject({ authUserId: null, email: null, phone: "+56912345678" });
    expect(b?.id).not.toBe(U1); // ficha del directorio: id propio

    expect(await repo.getProfile("e0000000-0000-4000-a000-0000000002ff")).toBeNull();
  });
});

describe("lecturas del directorio", () => {
  it("findByAuthUser resuelve por la cuenta, no por el id (ficha adoptada)", async () => {
    const adopted = await customer({ email: "adoptada@repo.cl", name: "Adoptada", authUserId: U1 });
    expect(adopted).not.toBe(U1);

    const p = await repo.findByAuthUser(U1);
    expect(p?.id).toBe(adopted);
    expect(p?.authUserId).toBe(U1);
    expect(await repo.findByAuthUser(U2)).toBeNull();
  });

  // Fix round 1 (CustomerService), hallazgo importante: `throwDbError` ahora
  // es el ÚNICO camino de error del adaptador — antes solo `ensureForAuthUser`
  // y `updateContact` lo usaban; `getProfile`, `updateProfile`, `movements`,
  // `bookingsForEmail`, `upsertCustomer` y `bookingsForCustomer` relanzaban
  // `error.message` crudo. Un caso representativo de LECTURA (no se duplica
  // la cobertura de escritura que ya existe abajo para `updateContact`).
  it("findByAuthUser también sale genérico ante un error de la DB, con el texto crudo solo en .cause", async () => {
    const err: Error = await repo
      .findByAuthUser("no-es-un-uuid")
      .then(() => {
        throw new Error("se esperaba que rechazara");
      })
      .catch((e: unknown) => e as Error);

    expect(err.message).toBe("No pudimos completar la operación. Intenta de nuevo.");
    expect(err.message).not.toMatch(/uuid|syntax|postgres/i);
    expect(String(err.cause)).toMatch(/invalid input syntax for type uuid/i);
  });

  it("bookingsForCustomer suma las vinculadas Y las huérfanas de su email", async () => {
    const id = await customer({ email: "duena@repo.cl", name: "Dueña" });
    await booking({ email: "duena@repo.cl", customerId: id }); // vinculada
    await booking({ email: "DUENA@repo.cl" }); // huérfana (cortesía / pre-backfill)
    await booking({ email: "ajena@repo.cl" }); // de otra persona
    await booking({ email: "duena@repo.cl", customerId: await customer({ email: "otra@repo.cl" }) }); // vinculada a otra

    const rows = await repo.bookingsForCustomer(id, "duena@repo.cl");
    expect(rows).toHaveLength(2);
    expect(rows.every((b) => b.status === "held")).toBe(true);

    // Sin email (ficha solo-teléfono): solo las vinculadas por FK.
    expect(await repo.bookingsForCustomer(id, null)).toHaveLength(1);
  });
});

// Solo lo que agrega el ADAPTADOR. La semántica de las RPC (adopción con id
// propio, idempotencia, fila legacy, cada rechazo) ya está probada al nivel SQL
// en customers-directory.itest.ts (PR1) — repetirla acá sería duplicar cobertura.
describe("escrituras del directorio (RPC de la migración)", () => {
  it("ensureForAuthUser devuelve { kind: 'ok', id } cuando no hay ficha previa", async () => {
    const r = await repo.ensureForAuthUser(U1, "  U1@Repo.cl ");
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect((await repo.getProfile(r.id))?.email).toBe("u1@repo.cl");
  });

  // Lo que el adaptador agrega sobre el SQL: el conflicto vuelve como VALOR.
  it("ensureForAuthUser devuelve email_conflict (no lanza) cuando el email es de otra ficha", async () => {
    await customer({ id: U1, email: "viejo@repo.cl", authUserId: U1 });
    await customer({ email: "tomado@repo.cl", name: "Ficha ajena" });

    expect(await repo.ensureForAuthUser(U1, "tomado@repo.cl")).toEqual({ kind: "email_conflict" });
    // La ficha del usuario queda intacta con su email viejo.
    expect((await repo.getProfile(U1))?.email).toBe("viejo@repo.cl");
  });

  // Lo que el adaptador agrega sobre el SQL: `raise exception '<literal>'` llega
  // como PostgrestError y sale como sentinela (nunca texto crudo de Postgres).
  it("updateContact relanza los literales de la RPC como sentinelas", async () => {
    const titular = await customer({ id: U1, email: "titular@repo.cl", authUserId: U1 });
    await expect(repo.updateContact(titular, { name: "X", email: "otro@repo.cl", phone: null })).rejects.toThrow(
      "customer_has_account",
    );

    const ficha = await customer({ email: "ficha@repo.cl", name: "Ficha" });
    await expect(repo.updateContact(ficha, { name: "X", email: "no-es-email", phone: null })).rejects.toThrow(
      "customer_email_invalid",
    );
  });

  // Fix round 2, hallazgo CRÍTICO: `update_customer_contact` llama a
  // `customer_sync_snapshots`, que copia los campos de la ficha —NULLs
  // incluidos— sobre cada pedido y reserva del cliente. `validateProfile` manda
  // null por cada campo vacío del formulario y en prod las tres fichas tienen
  // `name`/`phone` en NULL, así que el camino destructivo era el DEFAULT:
  // guardar el perfil con un campo en blanco habría borrado el otro dato en
  // todo el historial (pagado incluido) — justo el dato que el backfill de PR3
  // lee. Este caso FALLA si alguien vuelve a apuntar el guardado de perfil a
  // `updateContact`: la reserva y el pedido perderían el nombre.
  it("el guardado de perfil con un campo en blanco NO borra el otro dato en las reservas del cliente", async () => {
    const id = await customer({
      email: "perfil@repo.cl",
      name: "Nombre Del Historial",
      phone: "+56911111111",
      authUserId: U1,
    });
    expect(id).not.toBe(U1); // ficha adoptada: id propio
    const { orderId, reservationId } = await booking({
      email: "perfil@repo.cl",
      name: "Nombre Del Historial",
      phone: "+56911111111",
      customerId: id,
      status: "confirmed",
    });

    // Lo que hace /cuenta/perfil: el campo Nombre quedó vacío → name null.
    await new CustomerService(repo).updateProfileByUser(U1, { name: null, phone: "+56922222222" });

    // La ficha sí se actualiza…
    expect(await repo.getProfile(id)).toMatchObject({ name: null, phone: "+56922222222" });

    // …y el historial NO se toca: ni el nombre (que se habría perdido) ni el
    // teléfono (que se habría propagado). La propagación llega en PR3.
    const snap = await pg.query<{ customer_name: string | null; customer_phone: string | null }>(
      `select customer_name, customer_phone from reservations where id = $1
       union all
       select customer_name, customer_phone from orders where id = $2`,
      [reservationId, orderId],
    );
    expect(snap.rows).toHaveLength(2);
    for (const row of snap.rows) {
      expect(row.customer_name).toBe("Nombre Del Historial");
      expect(row.customer_phone).toBe("+56911111111");
    }
  });

  // Fix round 1, hallazgo 1: un error SIN sentinela reconocido (acá, uuid
  // inválido → 22P02; en prod también cubre 40P01/57014, ver el comentario de
  // update_customer_contact en la migración) nunca debe filtrar texto crudo de
  // Postgres al `.message` que un toast muestra tal cual — pero el original
  // debe seguir disponible en `.cause` para los logs.
  it("un error sin sentinela conocido sale genérico en .message, con el texto crudo solo en .cause", async () => {
    const err: Error = await repo
      .updateContact("no-es-un-uuid", { name: "X", email: null, phone: null })
      .then(() => {
        throw new Error("se esperaba que rechazara");
      })
      .catch((e: unknown) => e as Error);

    expect(err.message).toBe("No pudimos completar la operación. Intenta de nuevo.");
    expect(err.message).not.toMatch(/uuid|syntax|postgres/i);
    expect(String(err.cause)).toMatch(/invalid input syntax for type uuid/i);
  });
});
