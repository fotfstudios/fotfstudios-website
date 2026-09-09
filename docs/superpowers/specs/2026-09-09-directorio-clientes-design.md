# Directorio de clientes + elegir/crear cliente al agendar — diseño

- **Date:** 2026-09-09
- **Status:** Design approved
- **Scope:** Identidad propia de cliente (tabla `customers` independiente del login),
  vínculo `customer_id` en `reservations` y `orders` con backfill por email histórico,
  control "elegir o crear cliente" en la consola `/admin/reservas/nueva`, directorio
  `/admin/clientes` (lista + ficha + edición) y "Cambiar cliente" en la ficha de reserva.
  Siete PRs pequeños que respetan la regla expand/contract de `DEPLOY.md`.

Diseño producido por panel de 3 diseñadores / 6 jueces, sintetizado y verificado por un crítico
de código (11 problemas + 9 faltantes, todos resueltos aquí). El plan aprobado por el dueño
(`~/.claude/plans/in-the-admin-s-page-zazzy-graham.md`) manda sobre la síntesis donde difieran.

## Decisiones del dueño

No se relitigan.

1. **Directorio real.** Los clientes tienen identidad propia, independiente del login. Hoy
   `customers.id` ES `auth.users.id` (`20260704113000_customers_points.sql:18-26`) y solo un
   login en `/cuenta` crea filas; reservas y pedidos guardan solo texto libre
   `customer_name/email/phone`. Pasa a: `customers.id` propio (los ids existentes no se
   renumeran), `auth_user_id` nullable, y `customer_id` en `reservations` y `orders`.
2. **Alcance en cadena de PRs chicos:** backend + migración; picker en la consola nueva
   reserva; `/admin/clientes` lista + ficha + edición; "Cambiar cliente" en la ficha de reserva.
3. **Identidad:** nombre + al menos uno de email/teléfono. Email opcional, único y en
   minúsculas cuando existe. Teléfono normalizado. **Los puntos siguen colgando del email.**
4. **Backfill** por `lower(email)` desde el historial de `orders`/`reservations`.
5. **Sin canje de puntos desde el admin** (tampoco ajustes manuales).
6. El walk-in "Solo nombre, sin ficha" sigue siendo legal. `customers.manage` **NO** se
   otorga al staff por defecto. "Cambiar cliente" exige `reservations.create`.

Dos refinamientos deliberados sobre estas decisiones, marcados para firma del dueño (aplican
por defecto): ver **Refinamientos flagged** al final.

## Invariante central

**Todo escritor de `customer_id` reescribe también las columnas snapshot
(`customer_name/customer_email/customer_phone`) de la reserva/pedido desde la fila de
`customers`.**

Como `customers.email` está siempre en minúsculas, la join histórica
`c.email = lower(o.customer_email)` resuelve siempre al cliente vinculado. Por eso las ocho
funciones de puntos quedan **byte-idénticas**: `apply_points`, `confirm_payment`
(`20260707240000:86-87`), `mark_refunded` (`20260824160000:53-54`), `reschedule_down`
(`20260707230000:126-127`), `apply_reschedule_charge` (`20260707230000:229-230`),
`award_retro_points` (`20260704113000:435-436`), `release_order_redemption`,
`refund_points_order`. El FK y la join por email nunca discrepan.

Escritores del vínculo (todos cumplen el invariante): `create_checkout` (PR3),
`create_reschedule_charge` (PR3, copia al pedido delta), `createCourtesyBooking` (PR3),
`backfill_customers_from_bookings`, `update_customer_contact`, `assign_booking_customer`.

El invariante también obliga a quien reescribe **`customers.email`** de una ficha que ya puede
estar vinculada (`ensure_customer_for_user` al refrescar el email de auth,
`update_customer_contact`): si los pedidos pagados se quedaran con el email viejo, el claw-back
de `mark_refunded` / `reschedule_down` / `apply_reschedule_charge` resolvería a nadie (los
puntos quedarían) o — si otra ficha tomara ese email — al cliente equivocado. Ambas pasan por el
helper privado **`customer_sync_snapshots(p_customer uuid, p_old_email text)`** (PR1): relee la
ficha y reescribe `customer_id/name/email/phone` en los pedidos/reservas vinculados
(`customer_id = p_customer`) y en los huérfanos (`customer_id is null`) cuyo
`lower(customer_email)` sea el email viejo o el actual.

Corolario (crítico #6): la edición de perfil en `/cuenta` pasa por el **mismo** camino que la
edición del admin (`update_customer_contact`), así los dos escritores de `customers` nunca
derivan: cambiar el teléfono en `/cuenta/perfil` actualiza el snapshot de la reserva próxima
que el staff usa para WhatsApp.

## Esquema y migraciones

### PR1 — `20260909120000_customer_directory.sql` (expand; tolerado por el código vivo)

El código vivo (`upsertCustomer({id,email}, onConflict id)`) sigue funcionando sobre este
esquema: id explícito, email ya en minúsculas, `auth_user_id` queda null (lo reclama
`ensure_customer_for_user` paso 2 en PR2).

```sql
-- Guarda: nunca fusionar en silencio.
do $$ begin
  if exists (select 1 from customers group by lower(trim(email)) having count(*) > 1) then
    raise exception 'customers: emails que difieren solo por mayúsculas/espacios; resolver a mano antes de migrar.';
  end if;
end $$;

-- Normalización previa a los CHECK.
update customers
   set email = lower(trim(email)),
       name  = nullif(left(trim(name), 80), ''),
       phone = case when char_length(trim(phone)) between 6 and 40 then trim(phone) end;

-- Identidad propia sin renumerar: el nombre del FK se resuelve en pg_constraint, no se asume.
do $$ declare v text; begin
  select conname into v from pg_constraint
   where conrelid = 'public.customers'::regclass and contype = 'f'
     and confrelid = 'auth.users'::regclass;
  if v is not null then execute format('alter table public.customers drop constraint %I', v); end if;
end $$;
alter table customers alter column id set default gen_random_uuid();
alter table customers add column auth_user_id uuid unique references auth.users (id) on delete set null;
update customers c set auth_user_id = c.id
 where exists (select 1 from auth.users u where u.id = c.id);

alter table customers alter column email drop not null;
alter table customers
  add constraint customers_email_lower      check (email is null or email = lower(email)),   -- auditoría C6
  add constraint customers_contact_required check (email is not null or phone is not null),
  add constraint customers_name_len         check (name  is null or char_length(name)  between 1 and 80),
  add constraint customers_phone_len        check (phone is null or char_length(phone) between 6 and 40);
-- SIN check de forma de email (ver Reglas de higiene SQL).

alter table customers add column phone_digits text generated always as
  (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored;
create index customers_phone_digits_idx on customers (phone_digits) where phone_digits is not null;
create index customers_created_idx      on customers (created_at desc);

alter table reservations add column customer_id uuid references customers (id) on delete set null;
alter table orders       add column customer_id uuid references customers (id) on delete set null;
create index reservations_customer_idx on reservations (customer_id, starts_at desc) where customer_id is not null;
create index orders_customer_idx       on orders (customer_id) where customer_id is not null;
```

Notas:
- `customers_email_key` (unique sobre `email`, creado en `20260704113000`) se conserva: por
  eso `on conflict (email)` es válido en todos los escritores.
- `name` sigue nullable en la DB (las filas de login no lo tienen); la app lo exige al crear
  desde staff o invitado.
- RLS sigue habilitado con **cero policies** (solo service_role), convención del repo.
- Sin índice sobre `lower(name)`: no sirve a `ilike '%q%'`; pg_trgm/citext son no-objetivos.
- `auth.users` → `customers` ya no cascadea el borrado (`on delete set null`); hoy no existe
  flujo de borrado de cuentas.

**`booking_events`** (misma migración, patrón `20260824120000_curso_dj.sql:205-225`:
constraint y función juntas, porque `booking_event_category()` devuelve null para un tipo
desconocido y `log_booking_event()` levanta excepción):

```sql
alter table booking_events drop constraint booking_events_type_check;
alter table booking_events add constraint booking_events_type_check
  check (type in ( /* …la lista vigente… */ , 'customer_changed'));

create or replace function booking_event_category(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_type in ('created', 'courtesy_confirmed', 'reschedule_moved', 'cancelled',
                    'curso_session_scheduled', 'curso_session_moved', 'curso_session_cancelled',
                    'customer_changed') then 'Reservas'
    /* …resto idéntico… */
  end
$$;
```

Firma vigente que usan las funciones nuevas (`20260707225000_booking_events.sql`):

```sql
log_booking_event(p_reservation uuid, p_type text,
  p_order uuid default null, p_reschedule uuid default null, p_tax_doc uuid default null,
  p_amount int default null, p_payment_ref text default null,
  p_detail jsonb default null, p_occurred_at timestamptz default null, p_created_by uuid default null)
returns uuid
```

#### Funciones nuevas (definidas en PR1, **ninguna se ejecuta** en PR1)

Todas `language plpgsql set search_path = public, pg_temp`, como el resto del repo.

**`upsert_guest_customer(p_name text, p_email text, p_phone text) returns uuid`** — el
escritor de invitados usado por `create_checkout` (PR3) y por la cortesía (PR3); el backfill
comparte su normalización y su gate de forma (mismo literal de regex).

- Normaliza: `v_email := nullif(lower(trim(p_email)), '')`,
  `v_name := nullif(left(trim(p_name), 80), '')`,
  `v_phone := case when char_length(trim(p_phone)) between 6 and 40 then trim(p_phone) end`.
- Devuelve **null** (sin escribir nada) si `v_email` no pasa el gate
  `v_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(v_email) <= 120`. Un
  invitado con email inválido reserva igual y queda sin vincular, como hoy.
- `insert into customers (email, name, phone) values (v_email, v_name, v_phone)
  on conflict (email) do update set …` donde:
  - fila **invitada** (`customers.auth_user_id is null`): **ganan los valores tipeados**
    (`name = coalesce(excluded.name, customers.name)`, `phone = coalesce(excluded.phone,
    customers.phone)`) — crítico #5: el teléfono nuevo de un invitado que vuelve alimenta el
    link de WhatsApp y el payer de MP; no se descarta.
  - fila **con cuenta** (`auth_user_id is not null`): conserva su nombre y email; **solo se
    rellena el teléfono si estaba en null** (`phone = coalesce(customers.phone, excluded.phone)`).
  - siempre `updated_at = now()`. Devuelve el id.

**`ensure_customer_for_user(p_user uuid, p_email text) returns uuid`** — login → ficha.
Orden de resolución (crítico #11 añade el paso 2):

1. Fila con `auth_user_id = p_user`. Si el email de auth cambió y el nuevo está libre, lo
   refresca **y llama `customer_sync_snapshots(id, <email viejo>)`** (los pedidos/reservas
   vinculados y los huérfanos del email viejo/nuevo pasan a llevar el email nuevo; el
   claw-back sigue resolviendo a esta ficha); si otro cliente ya lo tiene, `raise exception
   'customer_email_owned_by_other_user'`. Devuelve el id.
2. **Fila legacy `id = p_user and auth_user_id is null`** (creada por el upsert-por-id viejo en
   la ventana entre el migrate de PR1 y el deploy de PR2) → la reclama (`set auth_user_id =
   p_user`) y aplica la misma regla de refresco de email del paso 1.
3. Fila sin reclamar por email (`email = v_email and auth_user_id is null`) → la adopta
   (`set auth_user_id = p_user`); **conserva su id** (≠ `p_user`).
4. `insert into customers (id, email, auth_user_id) values (p_user, v_email, p_user) on
   conflict do nothing`. Si no insertó (carrera por PK o por email), re-lee por
   `auth_user_id = p_user`; si sigue sin aparecer, `raise 'customer_email_owned_by_other_user'`.

`v_email := nullif(lower(trim(p_email)), '')`; null → `raise 'customer_email_required'`;
`p_user` null → `raise 'customer_user_required'` (ninguno alcanzable desde una sesión real;
PR2 los mapea igual). Idempotente: llamadas repetidas devuelven el mismo id.

**`backfill_customers_from_bookings() returns int`** — idempotente y re-ejecutable.

Regla de dedupe (decisión 4): un cliente por `lower(customer_email)` distinto — **sin
`trim`**, exactamente la misma clave que las joins de puntos — que pase el gate de forma.
Nombre y teléfono se eligen **de forma independiente**: primero filas
pagadas/cumplidas/reembolsadas (`orders.status in ('paid','fulfilled','refunded')`) o
confirmadas (`reservations.status = 'confirmed'`), luego la más reciente (`created_at desc`).
Las filas existentes (de login) **solo reciben los NULL rellenados** — a diferencia de
`upsert_guest_customer`, aquí el dato histórico es más viejo que lo que el titular escribió en
`/cuenta`, así que nunca lo pisa. Emails sin forma válida, con espacios o vacíos quedan sin
vincular: son exactamente las filas que tampoco ganaron puntos en vivo.

```sql
create function backfill_customers_from_bookings() returns int
language plpgsql set search_path = public, pg_temp as $$
declare v_n int;
begin
  with seen as (
    select lower(customer_email) as email,
           nullif(left(trim(customer_name), 80), '') as name,
           case when char_length(trim(customer_phone)) between 6 and 40 then trim(customer_phone) end as phone,
           case when status in ('paid', 'fulfilled', 'refunded') then 0 else 1 end as rk, created_at
      from orders where customer_email is not null
    union all
    select lower(customer_email), nullif(left(trim(customer_name), 80), ''),
           case when char_length(trim(customer_phone)) between 6 and 40 then trim(customer_phone) end,
           case when status = 'confirmed' then 0 else 1 end, created_at
      from reservations where kind = 'booking' and customer_email is not null),
  valid as (select * from seen
             where email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(email) <= 120),
  best_name  as (select distinct on (email) email, name  from valid where name  is not null
                 order by email, rk, created_at desc),
  best_phone as (select distinct on (email) email, phone from valid where phone is not null
                 order by email, rk, created_at desc),
  people as (select distinct email from valid),
  ins as (
    insert into customers (email, name, phone)
      select p.email, n.name, ph.phone from people p
        left join best_name n using (email) left join best_phone ph using (email)
    on conflict (email) do update
      set name = coalesce(customers.name, excluded.name),
          phone = coalesce(customers.phone, excluded.phone), updated_at = now()
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted) into v_n from ins;   -- solo INSERTADOS (crítico #10)

  update orders o set customer_id = c.id from customers c
   where o.customer_id is null and o.customer_email is not null and c.email = lower(o.customer_email);
  update reservations r set customer_id = c.id from customers c
   where r.customer_id is null and r.customer_email is not null and c.email = lower(r.customer_email);
  update reservations r set customer_id = o.customer_id from orders o
   where r.order_id = o.id and r.customer_id is null and o.customer_id is not null;
  return v_n;
end $$;
```

Devuelve el conteo de **insertados** vía `xmax = 0` (una fila actualizada por `on conflict`
tiene `xmax <> 0`); `get diagnostics row_count` contaría insertadas + actualizadas y rompería la
aserción "segunda corrida → 0". Vincula pedidos, reservas y reservas a través de su pedido.
Cubre también pedidos de curso por email (`orders.kind <> 'booking'`), sin excluirlos.

**`update_customer_contact(p_customer uuid, p_name text, p_email text, p_phone text) returns void`**
— edición desde `/admin/clientes` y desde `/cuenta/perfil`.

- `select … for update`; `customer_not_found` si no existe.
- Normaliza como `upsert_guest_customer` (`v_name := nullif(left(trim(p_name), 80), '')`,
  `v_email := nullif(lower(trim(p_email)), '')`, `v_phone := nullif(trim(p_phone), '')`) y
  aplica el **mismo gate de forma** al email: `v_email is not null` y no pasa el regex o supera
  120 → `raise 'customer_email_invalid'` (la app ya lo filtró con `parseCustomerInput`; el gate
  SQL es la última línea).
- Titular de cuenta (`auth_user_id is not null`) y `v_email is distinct from c.email` →
  `raise 'customer_has_account'` (su email es su acceso).
- **Quitar el email a una ficha con puntos** (`v_email is null and c.email is not null and
  exists (select 1 from points_ledger where customer_id = c.id)`) →
  `raise 'customer_email_in_use'`: sus pedidos pagados perderían el email por el que
  `mark_refunded` / `reschedule_*` revocan (espejo de `customer_assign_needs_email`).
- `update customers set name, email = v_email, phone, updated_at` (un 23505 sobre
  `customers_email_key` lo mapea la app a `email_taken`; 23514 a la frase del CHECK).
- `perform customer_sync_snapshots(p_customer, c.email)`: reescribe snapshots en pedidos y
  reservas **vinculados** (`customer_id = c.id`) **y vincula + reescribe los huérfanos** que la
  join por email ya atribuía a esta ficha:
  `customer_id is null and lower(customer_email) in (c.email, v_email)`.
- Si `v_email is not null` → `perform award_retro_points(p_customer)` (idempotente). Así un
  cliente solo-teléfono que gana email absorbe su historial y sus puntos.

**`assign_booking_customer(p_reservation uuid, p_customer uuid, p_created_by uuid default null) returns void`**
— "Cambiar cliente". El ledger es append-only → el earn neto se **mueve** con un par `adjust`.

Rechazos (todos `raise exception` con ese literal):
- `customer_assign_not_booking`: no existe o `kind <> 'booking'`.
- `customer_assign_inactive`: `status not in ('held','confirmed')`.
- `customer_not_found`: destino inexistente.
- `customer_assign_points_order`: el pedido tiene `points_redeemed_clp > 0` o cualquier fila
  del ledger con `kind in ('redeem','redeem_release','redeem_restore')` (misma postura que
  `reschedule_*` con `points_order`).
- `customer_assign_needs_email`: pedido `paid/fulfilled/refunded` y destino sin email (un
  claw-back posterior debe encontrar al titular; decisión 3).
- `r.customer_id = p_customer` → no-op silencioso, sin evento.

Efectos, en orden:
1. `select … for update` sobre la reserva y su pedido.
2. Reescribe snapshot (invariante) en la reserva, su pedido y los pedidos delta:
   `id in (select delta_order_id from reschedules where reservation_id = r.id and delta_order_id is not null)`.
3. `v_evt := log_booking_event(r.id, 'customer_changed', p_order => r.order_id, p_created_by
   => p_created_by, p_detail => jsonb_build_object('from_customer_id', …, 'from_name', …,
   'from_email', …, 'to_customer_id', c.id, 'to_name', c.name, 'to_email', c.email,
   'points_moved', v_moved))`.
4. Mueve el earn neto del pedido: por cada `customer_id <> c.id` con
   `sum(amount) <> 0` sobre `kind in ('earn','earn_revoke','adjust')`,
   `apply_points(old, r.order_id, 'adjust', -net, 'reassign:' || v_evt || ':out:' || old)` y
   `apply_points(c.id, r.order_id, 'adjust', net, 'reassign:' || v_evt || ':in:' || old)`. El
   `having sum <> 0` respeta `points_ledger_sign` (`adjust` exige `amount <> 0`); los refs
   con el id del evento respetan `points_ledger_once (order_id, kind, ref)`.
5. Si el pedido está pagado → `perform award_retro_points(c.id)`: un pedido pagado sin earn
   previo (sin ficha o email inválido en su momento) otorga el 5 % al nuevo cliente; para
   pedidos ya ganados es no-op por la clave única.

Por qué es seguro con las funciones de puntos intactas: tras A→B, las filas
`earn`/`earn_revoke` del pedido siguen sumando el mismo `v_earn_net` que `mark_refunded`,
`reschedule_down` y `apply_reschedule_charge` calculan sin mirar al cliente; la revocación o el
earn extra se aplica al cliente que resuelve el email reescrito — B, que ya tiene el neto vía
`adjust`. Netear también `adjust` hace que A→B→A restaure a A y A→B→C deje a B en 0.

### PR1 — `supabase/seed.sql`

Orden por FK dentro del segundo bloque `do $$` (crítico faltante #4):

1. `auth.users` + `auth.identities` `…00a3` = `felipe.munoz@outlook.cl` (patrón `seed.sql:136-153`).
2. `customers` con ids fijos `…f1, …f2, …f4, …f5, …f6` para Matías / Catalina / Valentina /
   Ignacio / Camila (emails en minúsculas, teléfonos tal como están); Felipe con
   **`id = auth_user_id = …00a3`** (como toda fila de titular creada antes del directorio: el
   `upsert({id, email}, onConflict id)` vigente hasta PR2 la actualiza sin chocar con
   `customers_email_key`, así el login local en `/cuenta` funciona ya en PR1);
   `…f7` = `('Pía Contreras', null, '+56912345678')` solo-teléfono.
3. Los `insert into orders` (`:51`) y `insert into reservations` (`:81`) existentes ganan
   `customer_id`.
4. `perform award_retro_points(id)` para Matías / Catalina / Felipe / Valentina → 1.999 /
   1.499 / 4.498 / 999 pts.
5. `perform backfill_customers_from_bookings();` como smoke de idempotencia (no vincula nada nuevo).

Todo `on conflict do nothing`. El super admin (`…00a1`) y el staff (`…00a2`) **no** reciben
fila en `customers`: solo los logins de `/cuenta` la crean.

### PR1 — tipos y puerto

`npm run db:reset && npm run db:types` → `customers.Row.email` pasa a `string | null` y `npm run
build` (type-check) rompería en `customer-repository.ts:34`. Para dejar PR1 verde (crítico #2):
en el mismo PR se ensancha `CustomerProfile.email` a `string | null` en
`src/application/ports/customers.ts`; con el puerto ensanchado el mapper `email: data.email`
compila tal cual (`string | null` → `string | null`), así que `customer-repository.ts` **no se
toca** en PR1. Ninguna página lee `profile.email` (`/cuenta` y `/reservar` usan `session.email`).

### PR3 — `20260909130000_customer_directory_activate.sql` (tras PR2 en vivo)

```sql
select backfill_customers_from_bookings();

-- Retro para todos los backfilled (refinamiento flagged): idempotente por points_ledger_once.
do $$ declare r record; begin
  for r in select id from customers where email is not null loop
    perform award_retro_points(r.id);
  end loop;
end $$;
```

**`create_checkout`** — `create or replace` con la **misma firma de 15 parámetros** de
`20260707240000:8-15` (sin `drop`; `checkout-repository.ts` no se toca):

```sql
create or replace function create_checkout(
  p_resource uuid, p_starts timestamptz, p_ends timestamptz,
  p_amount int, p_net int, p_tax int, p_currency text,
  p_customer jsonb, p_snapshot jsonb, p_lines jsonb,
  p_ttl interval default interval '10 minutes',
  p_customer_id uuid default null, p_points int default 0,
  p_terms_version text default null, p_terms_source text default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_res uuid; v_order uuid; v_line jsonb; v_balance int;
  v_cust  uuid := p_customer_id;
  v_name  text := nullif(left(trim(p_customer ->> 'name'), 80), '');
  v_email text := nullif(lower(trim(p_customer ->> 'email')), '');
  v_phone text := case when char_length(trim(p_customer ->> 'phone')) between 6 and 40
                       then trim(p_customer ->> 'phone') end;
begin
  perform expire_stale_holds(p_resource);

  if v_cust is not null then
    if not exists (select 1 from customers where id = v_cust) then raise exception 'customer_not_found'; end if;
  else
    v_cust := upsert_guest_customer(v_name, v_email, v_phone);   -- null si el email no pasa el gate
  end if;

  if v_cust is not null then   -- INVARIANTE: snapshot desde la fila DESPUÉS del upsert
    select coalesce(c.name, v_name), c.email, coalesce(c.phone, v_phone)
      into v_name, v_email, v_phone from customers c where c.id = v_cust;
  end if;

  insert into reservations (…, customer_name, customer_email, customer_phone, customer_id)
    values (…, v_name, v_email, v_phone, v_cust) returning id into v_res;
  insert into orders (…, customer_name, customer_email, customer_phone, pricing_snapshot,
                      terms_accepted_at, terms_version, terms_source, customer_id)
    values (…, v_name, v_email, v_phone, p_snapshot, …, v_cust) returning id into v_order;

  -- Resto IDÉNTICO a 20260707240000: update reservations.order_id, bloque de canje con
  -- p_customer_id/p_points, líneas, log_booking_event 'created', confirmación $0.
  …
end $$;
```

Semántica:
- Invitado (`v_cust` null al entrar): `upsert_guest_customer` crea o actualiza la ficha **en la
  misma transacción** (un `slot_taken` por GiST revierte también la ficha); `on conflict
  (email)` la hace segura ante carreras. El snapshot se lee de la fila resultante: para un
  invitado que vuelve, sus valores tipeados ya ganaron en la fila; para un titular de cuenta,
  el snapshot lleva nombre/email del registro y el teléfono tipeado solo si el registro no
  tenía.
- Email inválido → `v_cust` null → reserva sin vincular, con el snapshot tipeado (como hoy).
- Admin: pasa `p_customer_id` con `p_points = 0` → solo vínculo. `checkout-service.ts:62`
  sigue impidiendo el canje sin sesión → el canje desde el admin sigue siendo imposible
  (decisión 5). `p_customer_id` sigue siendo además el row lock del canje.
- Consecuencia: **`orders.customer_email` se guarda en minúsculas** (antes: tal como se
  tipeó). `metrics.ts:280-295` (`priorCustomerEmails`, nuevo vs recurrente) y
  `notification-repository` leen ese campo y siguen funcionando; el itest lo asegura.

**`create_reschedule_charge`** — `create or replace` con la misma firma de
`20260707240000:126-130` (`p_reservation, p_starts, p_ends, p_snapshot, p_lines, p_delta,
p_delta_net, p_delta_tax, p_created_by default null`): el `select` del pedido original lee
también `customer_id` y el `insert into orders` del pedido delta lo copia junto a
`customer_name/email/phone` (una columna más en `:147-149`).

**Cortesía** (`admin-repository.ts:849` `createCourtesyBooking(resourceId, startsAt, endsAt,
customer, notes?, customerId?)`, insert directo que no pasa por `create_checkout`):
- con `customerId` → snapshot desde el registro;
- **sin id pero con email → `rpc('upsert_guest_customer', …)` primero** (crítico #4: la
  cortesía no puede divergir del checkout) → snapshot desde el registro;
- escribe `customer_id`. Son dos sentencias (rpc + insert): un `slot_taken` en el insert deja
  la ficha creada — aceptable, es dato válido de directorio.

**`create_checkout` en la app:** `checkout-service.ts:121-127` gana la rama
`customer_not_found` → `nueva/actions.ts` muestra "El cliente ya no existe. Vuelve a
seleccionarlo." (crítico faltante #3: cubre la carrera entre `get()` y el RPC).

PR3 no cambia esquema → **`npm run db:types` no debe producir diff** (se asegura en el script
manual).

### PR4 — `20260909140000_customers_permission.sql`

```sql
insert into admin_permissions (key, label)
values ('customers.manage', 'Gestionar clientes')
on conflict (key) do nothing;
```

Patrón `20260724120000_dj_applications.sql:40-42`; **no** se otorga al staff por defecto
(regla de la casa, `20260707130000_reschedule.sql:163-166`). `src/domain/auth/permissions.ts`
gana la key ("Gestionar clientes"); `permissions.test.ts:24` pasa de 13 a 14;
`rbac.itest.ts` verifica la paridad. Sin nav, sin diff de `db:types`.

## Reglas de higiene SQL

Crítico #1, #7, #10 — aplican a toda migración de esta cadena.

1. **Backslash simple en los regex de archivos de migración.** Con
   `standard_conforming_strings = on` (default de Postgres/Supabase) el literal `'\D'` es el
   patrón `\D`; `'\\D'` sería la cadena de tres caracteres `\\D` y `[^\\s@]` significaría
   "ni backslash, ni la letra s, ni @" → `matias.rojas@gmail.com` **no** pasaría el gate y
   `phone_digits` no quitaría nada. Los dos literales exactos, tal como deben aparecer en
   los archivos:
   - `'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'`
   - `regexp_replace(coalesce(phone, ''), '\D', '', 'g')`

   Ninguna migración existente tiene un regex del cual copiar (`grep "~ '"` no encuentra
   nada). El itest asegura que `'matias.rojas@gmail.com'` pasa el gate y que una fila
   sembrada tiene `phone_digits = '56981234567'`.
2. **Sin CHECK de forma de email en `customers`.** Un check `NOT VALID` se sigue aplicando en
   UPDATE, y `apply_points` hace `update customers set points_balance …`
   (`20260704113000:73-74`): una fila legacy con email raro abortaría `confirm_payment` /
   `mark_refunded` / `reschedule_*` con 23514 y el webhook reintentaría para siempre. La
   forma se exige **solo en los escritores**: `parseCustomerInput` (app),
   `upsert_guest_customer`, el backfill y `update_customer_contact` (gate SQL). Se conservan
   `customers_email_lower`, `customers_email_key`, `customers_contact_required` y los checks
   de largo.
3. **Conteo de insertados con `xmax = 0`** en `backfill_customers_from_bookings` (ver arriba).
4. El mismo literal de regex aparece en exactamente cuatro lugares: `upsert_guest_customer`,
   el CTE `valid` del backfill, el gate `customer_email_invalid` de `update_customer_contact` y
   las consultas de pre-flight; no se reformula en ninguno.

## Dominio y aplicación

### Módulos puros

**`src/domain/contact/contact.ts`** (+ `contact.test.ts`) — único hogar de:
- `EMAIL_RE` (espejo del gate SQL), `normalizeEmail(raw): string | null` (trim + lower +
  forma, tope 120).
- `normalizePhone(raw): string | null`: solo dígitos; quita `00` inicial; 9 dígitos que
  empiezan en 9 → `+56…`; 11 dígitos que empiezan en `56` → `+56…`; si no, 8–15 dígitos →
  `(+)?dígitos`; si no, null.
- `phoneDigits(raw)`, `normalizePhoneCl(raw)` (se mueve desde `lib/whatsapp.ts:15`, que lo
  re-exporta; acepta `+dígitos`, así el teléfono normalizado del registro alimenta `waLink`).
- Se re-apuntan `src/domain/applications/application.ts:75-84`, `src/domain/course/lead.ts:54-62`
  (comportamiento y tests intactos) y `lib/profile.ts` (`PHONE_RE` → `normalizePhone`,
  crítico #6).

**`src/domain/customers/customer-input.ts`** (+ test):
- `CUSTOMER_CAPS = { name: 80, email: 120, phone: 40 }`.
- `parseCustomerInput(raw): Result<{ name: string; email: string | null; phone: string | null }, string>`
  con frases completas: "El nombre es obligatorio.", "El nombre no puede superar los 80
  caracteres.", "Email no válido.", "Teléfono no válido. Usa 8 a 15 dígitos, con o sin +.",
  "Ingresa un email o un teléfono.".
- `customerSearchNeedle(q): { text: string; digits: string | null }` — tope 80, `escapeIlike`
  de `src/domain/admin/reservas-list.ts:73`, `digits` cuando hay ≥ 3.
- `customerLabel(c)`.
- `customerDbErrorMessage(code, constraint): string | null` (crítico faltante #2): mapea
  23505 (`customers_email_key`) y 23514 (`customers_contact_required` / `customers_name_len` /
  `customers_phone_len`) a las **mismas** frases de `parseCustomerInput`, para que `runData`
  nunca muestre un mensaje crudo de Postgres en un toast.

**`src/domain/admin/clientes-list.ts`** (+ test), espejo de `reservas-list.ts`:
`CLIENTES_PER_PAGE = 25`, `ClientesListQuery { q; orden: "recientes" | "nombre"; page; perPage }`,
`parseClientesSearchParams(sp)` (MAX_Q 80, MAX_PAGE 10 000), `clientesHref(base, patch)`
(resetea `page` al cambiar filtro).

**`lib/manual-booking.ts`** (+ test): el tipo raw (`:73-81`) gana `customerId?: unknown;
walkInName?: unknown`; `ManualBookingFields` gana `customerId: string | null` (uuid o null →
"Cliente inválido.") y `walkInName: string | null` (≤ 80 → "El nombre no puede superar los 80
caracteres.").

### Puerto `src/application/ports/customers.ts`

```ts
export interface CustomerProfile {
  id: string;                 // customers.id — ya NO es auth.users.id
  authUserId: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  pointsBalance: number;
  createdAt: string;
}
export type CustomerHit = Pick<CustomerProfile, "id" | "name" | "email" | "phone" | "pointsBalance">
  & { hasAccount: boolean };

export interface CustomerRepository {
  ensureForAuthUser(userId: string, email: string): Promise<{ kind: "ok"; id: string } | { kind: "email_conflict" }>; // rpc ensure_customer_for_user
  awardRetroPoints(customerId: string): Promise<number>;
  getProfile(customerId: string): Promise<CustomerProfile | null>;
  findByAuthUser(userId: string): Promise<CustomerProfile | null>;     // índice único auth_user_id
  findByEmail(email: string): Promise<CustomerProfile | null>;         // .eq("email", lower) exacto
  findByPhoneDigits(digits: string): Promise<CustomerHit[]>;
  search(needle: { text: string; digits: string | null }, limit: number): Promise<CustomerHit[]>;
  list(q: ClientesListQuery): Promise<{ rows: CustomerHit[]; total: number }>;
  create(d: { name: string; email: string | null; phone: string | null }): Promise<CustomerProfile>; // 23505 → throw "email_taken"
  updateContact(customerId: string, d: { name: string | null; email: string | null; phone: string | null }): Promise<void>; // rpc update_customer_contact
  movements(customerId: string, limit: number): Promise<PointsMovement[]>;
  bookingsForCustomer(customerId: string, email: string | null): Promise<CustomerBooking[]>;
  bookingsForEmail(email: string): Promise<CustomerBooking[]>;         // /cuenta, sin cambios
  assignToBooking(reservationId: string, customerId: string, actor: string | null): Promise<void>; // rpc assign_booking_customer
}
```

- `upsertCustomer` y `updateProfile` desaparecen en PR2 (los reemplazan `ensureForAuthUser`
  y `updateContact`).
- `bookingsForCustomer(id, email)` implementa la regla del dueño (crítico #4):
  `customer_id = id OR (customer_id is null AND lower(customer_email) = email)`. Las filas sin
  vincular con email válido **siguen siendo alcanzables**: cortesías con email creadas entre
  el migrate de PR3 y la consola de PR5, emails con espacios que el backfill filtró, etc.
- `search` = `.or("name.ilike.%t%,email.ilike.%t%" + (digits ? ",phone_digits.ilike.%d%" : ""))
  .order("updated_at", { ascending: false }).limit(8)` (precedente `admin-repository.ts:297`).
- `list` ordena por `created_at desc` o `name asc`, con `count: "exact"` y `range`.

### `CustomerService` (sesión → cliente)

Conserva su doc "nunca con input del cliente". Resolución sesión → cliente: la sesión aporta
`userId` y `email`; la ficha se encuentra por `auth_user_id` (índice único), **nunca**
asumiendo `customers.id = userId` (una ficha adoptada del directorio tiene id distinto).

- `ensureCustomer(userId, email): Promise<{ kind: "ok"; profile: CustomerProfile } | { kind: "email_conflict" }>`
  = `ensureForAuthUser` → `awardRetroPoints(id)` → `getProfile(id)`. Resultado discriminado
  (crítico #3): los `error.tsx` del repo jamás muestran `error.message`, y un layout no es
  capturado por el boundary de su propio segmento, así que un throw nunca llegaría al usuario
  con copy legible.
- `profileByUser(userId)`, `movementsByUser(userId, limit)` resuelven vía `findByAuthUser`.
- `updateProfileByUser(userId, { name, phone })` → `updateContact(id, { name, email:
  profile.email, phone })`, es decir `update_customer_contact(id, name, <email actual>,
  phone)`: propaga snapshots (corolario del invariante); la función ya rechaza cambios de
  email para titulares, y aquí el email no cambia.
- `bookings(email)` / `bookingsForEmail` sin cambios para `/cuenta/reservas`.

Call sites (8, verificados):
- `app/cuenta/(panel)/layout.tsx:21`: ante `email_conflict` renderiza un `EmptyState` con "Tu
  correo cambió y ya existe otro cliente con ese email. Escríbenos para unificar tu cuenta."
  y no monta el shell; con `ok` usa `profile.pointsBalance` para el chip.
- `page.tsx`, `perfil/page.tsx`, `perfil/actions.ts:16` → métodos `*ByUser`.
- `app/reservar/page.tsx:29-33`: usa el `profile` devuelto por `ensureCustomer` (crítico #9:
  `profile(userId)` devolvería null para fichas adoptadas y el widget mostraría 0 pts).
- `app/auth/callback/route.ts:38`: conserva su `.catch` (el login nunca falla por esto).
- `app/api/bookings/route.ts:62-73`: normaliza el `customer` del body con el módulo de
  dominio (un email inválido reserva igual, sin vincular); con `points > 0` usa
  `profile.id` como `customerId` y `profile.email ?? session.email` — **nunca `session.userId`**.

### `CustomerDirectoryService` (admin)

`src/application/customers/customer-directory-service.ts` (+ test),
`composition.customerDirectory()`, llamado solo detrás de `requirePermission`:

- `search(q)`, `list(query)`, `get(id)`, `bookings(id)` (usa `bookingsForCustomer(id, email)`),
  `movements(id)`, `lookupPhone(digits)`.
- `create(raw): Promise<{ kind: "created" | "exists"; customer: CustomerHit }>`: parse →
  `findByEmail` → `exists`; si no, `create`; un 23505 por carrera → re-lee → `exists`.
- `update(id, raw)`: mapea `email_taken` → "Ese email ya pertenece a otro cliente.",
  `customer_has_account` → "Este cliente tiene cuenta: su email es su acceso y no se puede
  cambiar desde el panel.", `customer_email_in_use` → "Este cliente tiene puntos: necesita un
  email.", `customer_email_invalid` → "Email no válido." (misma frase que `parseCustomerInput`),
  23514 vía `customerDbErrorMessage`. (`CustomerService.updateProfileByUser` en PR2 reenvía el
  email actual, así que `/cuenta` nunca llega a `customer_email_in_use`.)
- `assign(reservationId, customerId, actor)`: `customer_assign_points_order` → "Esta reserva
  usó Puntos FOTF y no se puede reasignar; cancélala y vuelve a crearla.",
  `customer_assign_needs_email` → "Ese cliente no tiene email; agrégalo antes de reasignar una
  reserva pagada.", `customer_assign_inactive` → "Solo se puede cambiar el cliente de una
  reserva vigente.", `customer_not_found` → "El cliente ya no existe.".

**Política de duplicados.** Email: resultado `exists` con el registro existente — "Ese email ya
pertenece a {nombre}." + botón "Usar ese cliente"; nunca se crea un segundo. Teléfono:
permitido; advertencia blanda al salir del campo "Ya existe otro cliente con ese teléfono:
{nombre}." + "Usar ese cliente" (dos personas pueden compartir un teléfono; un email no).

## UX admin

### Componentes compartidos `components/admin/customers/` (PR5)

- **`CustomerPicker.tsx`** (`"use client"`; props `search(q): Promise<ActionDataResult<CustomerHit[]>>`,
  `onSelect(hit)`, `onCreateNew?(prefill)`, `maxRows = 6`). Input con `inputCls`,
  `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`,
  `aria-activedescendant`, `aria-busy`, `inputMode="search"`, `enterKeyHint="search"`,
  `autoComplete="off"`, placeholder "Nombre, email o teléfono…". Debounce 250 ms, mínimo 2
  letras o 3 dígitos, contador monotónico en `useRef` (patrón `loadDay`,
  `BookingConsole.tsx:144-167`; las server actions no se pueden abortar). Resultados **en
  flujo** (no overlay) como `role="listbox"` (`min-h-11`): nombre (`text-bone`), `font-mono
  text-xs text-bone-dim` email · teléfono, `label-sm text-gold/70` "1.250 pts" si > 0, chip "Con
  cuenta". Línea de estado `aria-live="polite"`: "Escribe al menos 2 letras o 3 dígitos." /
  "Buscando…" / "Sin coincidencias para “{q}”." / "No se pudo buscar." + Reintentar. Teclas:
  ArrowUp/Down con wrap, Enter selecciona, Escape limpia lista y luego input, Tab sale. Última
  fila "Nuevo cliente…" con prefill por forma: contiene "@" → email; ≥ 8 dígitos → teléfono;
  si no → nombre.
- **`NuevoClienteForm.tsx`**: Nombre (autoFocus, maxLength 80) / Email (hint "Opcional si hay
  teléfono", maxLength 120) / Teléfono (hint "Opcional si hay email. +56 9 …", `inputMode="tel"`,
  maxLength 40). Llama la action tipada `create` dentro de `useTransition` (`ActionForm` no
  devuelve datos). `exists` → "Ese email ya pertenece a {nombre}." + `btn("secondary","sm")`
  "Usar ese cliente"; búsqueda por teléfono en blur → advertencia + "Usar ese cliente". Pie:
  Cancelar / "Crear y seleccionar" (pendiente "Creando…"). Toast "Cliente creado." →
  `onDone(hit)`. Vive como paso dentro del diálogo anfitrión; **nunca** un Dialog anidado.
- **`CustomerSummary.tsx`**: chip del seleccionado (nombre, email · teléfono o "Sin email" /
  "Sin teléfono", pts, "Con cuenta"), "Ver ficha →" solo con `canManageCustomers`, botones
  Cambiar / Quitar.
- **`components/admin/ui/Dialog.tsx`**: el cuerpo gana `max-h-[80vh] overflow-y-auto` (sin
  cambio de comportamiento para los diálogos existentes).

### Consola `/admin/reservas/nueva` (PR5)

- `types.ts`: `ManualBookingInput.customer` se reemplaza por `customerId: string | null;
  walkInName?: string`; `ManualBookingResult` gana `customer: { name: string | null; phone:
  string | null }` (snapshot del servidor para SuccessPanel/WhatsApp; `phone` = teléfono
  normalizado del registro, que `normalizePhoneCl` acepta).
- `_components/BookingConsole.tsx`: `customer: CustomerHit | null`, `walkInName`. La `Card
  "Cliente"` muestra `CustomerPicker` o `CustomerSummary` y, debajo, un `btn("ghost","sm")`
  "Solo nombre (sin ficha)" que revela un único input Nombre, usable solo sin cliente
  seleccionado (sin email/teléfono ahí: dato de contacto implica ficha). Notas + attestation
  intactos. `submit` (`:330-367`) envía `customerId` / `walkInName` y **deja de enviar** la
  tripleta libre; `resetForAnother` (`:369-384`) limpia ambos. `canSubmit` no cambia: una
  reserva sin cliente sigue siendo legal.
- `nueva/page.tsx`: `?c=<uuid>` validado → `customerDirectory().get(c)` → `initialCustomer`;
  `canManageCustomers = hasPermission(await currentClaims(), "customers.manage")`.
- `nueva/actions.ts`: `searchCustomersAction(q)` y `createCustomerAction(raw)` bajo
  `requirePermission("reservations.create")` dentro de `runData` (forma de
  `curso/actions.ts:389-398`). `createManualBookingAction`: con `customerId` →
  `customerDirectory().get()`; ausente → "El cliente ya no existe. Vuelve a seleccionarlo.";
  snapshot **desde el registro** (el cliente jamás lo aporta); si no, `{ name: walkInName }`.
  Cortesía → `createCourtesyBooking(…, notes, rec?.id)`; pendiente/efectivo/transferencia →
  `createBooking({ …, customer, customerId: rec?.id })` con `pointsToRedeem` nunca seteado.
  Devuelve `customer: { name, phone }`.

### `/admin/clientes` (PR6, `customers.manage`)

- Primer commit: `SearchBox` (prop `basePath`) y `Pagination` genérico (`{ page, perPage,
  total, hrefFor }`) suben de `reservas/_components/` a `components/admin/ui/`; reservas los usa.
- `app/admin/(panel)/clientes/page.tsx` (`force-dynamic`): `PageHeader kicker="Operación"
  title="Clientes" editorial="Quién pasa por la sala."`; acción `NuevoClienteButton` (Dialog +
  `NuevoClienteForm` → `router.push('/admin/clientes/{id}')`); `SearchBox`; `DataTable` Cliente
  · Contacto · Puntos · Cuenta · Desde; `Pagination`; `EmptyState icon="user" title="Sin
  clientes todavía" hint="Se crean solos al agendar. También puedes crear uno acá."` /
  compacto "Sin resultados" · "Prueba con otro nombre, email o teléfono."; `loading.tsx`
  (`SkeletonPageHeader` + `SkeletonTable rows={8}`).
- `clientes/[id]/page.tsx` (+ `loading.tsx`, `notFound()`): breadcrumb "Clientes › {nombre}",
  chip "Con cuenta" / "Sin cuenta". `Card "Datos"` → `ActionForm action={updateCustomerAction}
  success="Cliente guardado."` (Nombre / Email / Teléfono; el email va `disabled` con hint "Su
  email es su acceso." cuando hay `authUserId`). `Card "Puntos"` → `Stat "Disponibles"` +
  últimos 10 movimientos (`fmtPtsSigned`, `StatusPill status={kind}`) + nota "Los puntos se
  acumulan por email. Agrega uno para que sume." cuando el email es null. `Card "Reservas"` →
  `Button href="/admin/reservas/nueva?c={id}" icon="add" size="sm"` "Nueva reserva" + tabla
  Fecha · Horario · Estado · Total enlazando a `/admin/reservas/{id}`, alimentada por
  `bookingsForCustomer(id, email)`.
- `clientes/actions.ts` (`createCustomerAction`) y `clientes/[id]/actions.ts`
  (`updateCustomerAction(prev, fd)`), ambos `requirePermission("customers.manage")` +
  `revalidatePath` lista y ficha.
- `components/admin/AdminShell.tsx`: `show.customers = hasPermission(claims, "customers.manage")`;
  `components/admin/ui/Sidebar.tsx:24-30`: `{ href: "/admin/clientes", label: "Clientes", icon:
  "user" }` después de "Nueva reserva".

### "Cambiar cliente" en `/admin/reservas/[id]` (PR7, `reservations.create`)

- `admin-repository.ts`: `customer_id` en `ResRow` (`:149-171`), en el `map()` compartido, en
  el `SELECT` (`:173-174`) y en `DETAIL_SELECT` (`:541`); `AdminBooking.customerId: string |
  null`; `BookingTimelineEvent.detail` (`:94-101`) se ensancha con `from_customer_id? /
  from_name? / from_email? / to_customer_id? / to_name? / to_email? / points_moved?`; nuevo
  `assignCustomer(reservationId, customerId, actor)` → rpc.
- `page.tsx`, Card Cliente (`~:240-254`): "Ver ficha →" si `customerId && canManageCustomers`;
  para `kind === "booking"` y estado held/confirmed → `<CambiarClienteDialog reservationId
  current={{ name, email }} isPaid usedPoints={pointsRedeemedClp > 0} />` (trigger
  `btn("ghost","sm")` "Cambiar cliente", deshabilitado con hint cuando `usedPoints`).
- `[id]/_components/CambiarClienteDialog.tsx`: un solo `Dialog`, pasos (1) `CustomerPicker`
  (`maxRows 5`) con "Nuevo cliente…" → (1b) `NuevoClienteForm` inline → (2) confirmación
  "{old ?? 'Sin cliente'} → {new}", "Se actualizarán nombre, email y teléfono de la reserva y su
  pedido. No se envía ningún correo al cliente." y, si `isPaid`, "Los puntos ganados por este
  pago pasan al nuevo cliente."; botones Volver / "Cambiar cliente".
- `[id]/actions.ts`: `searchCustomersAction`, `createCustomerAction`,
  `assignCustomerAction(reservationId, customerId)` (`reservations.create`; actor = `(await
  currentClaims())?.sub`; `revalidatePath` ficha + lista + `/admin/clientes/{id}`). Toast
  "Cliente actualizado.".
- Timeline (`timelineEntry`, `page.tsx:46-95`): `case "customer_changed"` → label "Cliente
  reasignado", detail `${from_name ?? from_email ?? "Sin cliente"} → ${to_name ?? to_email ??
  "—"}` + ` · {points_moved} pts movidos` si > 0. `created_by` recibe su primer valor real.

### Permisos (resumen)

| Acción | Permiso |
|---|---|
| Buscar / crear cliente dentro de un flujo de reserva (consola, Cambiar cliente) | `reservations.create` |
| "Cambiar cliente" en la ficha de reserva | `reservations.create` (quien creó el walk-in pagado mal tipeado debe poder corregirlo; mover el earn es el mismo efecto dinero-equivalente que crear la reserva) |
| `/admin/clientes` (lista, ficha, edición, "Nuevo cliente" fuera de un flujo), link "Ver ficha →", ítem de nav | `customers.manage` — **NO** otorgado al staff por defecto; se concede vía `/admin/roles` |
| Walk-in "Solo nombre (sin ficha)" | permitido; snapshot solo con nombre, `customer_id` null |

## Pruebas y verificación

### Unit (vitest, node)

- `src/domain/contact/contact.test.ts`: matriz email/teléfono (`+56 9 …`, `00 56…`,
  `962803298`, basura), paridad de `normalizePhoneCl` con los tests viejos de `lib/whatsapp`.
- `src/domain/customers/customer-input.test.ts`: obligatorios, topes, regla de contacto,
  cadenas exactas; `customerSearchNeedle` (dígitos + `escapeIlike`); `customerDbErrorMessage`.
- `src/domain/admin/clientes-list.test.ts`; `lib/manual-booking.test.ts` (`customerId` uuid o
  null, tope de `walkInName`).
- `src/application/customers/customer-service.test.ts`: `ensureCustomer` → retro con el id
  devuelto; `email_conflict`; resolución `*ByUser`; `updateProfileByUser` llama `updateContact`
  con el email actual.
- `customer-directory-service.test.ts`: `exists` por `findByEmail` y por carrera 23505; mapeo
  de errores. `checkout-service.test.ts`: `customerId` reenviado con `pointsToRedeem 0`;
  `customer_not_found` mapeado. `permissions.test.ts` → 14.

### Integración (Supabase local; `npm run test:integration`)

Nuevo `src/infrastructure/db/customers-directory.itest.ts` con el scaffolding de
`points.itest.ts:97-135` (cliente `pg` a `SUPABASE_DB_URL`, `insertAuthUser`, `cleanup` por
`truncate … cascade` en `beforeEach`/`afterAll`, helpers `balance`/`ledgerSum`,
`expectBalanceConsistent`):

- **Regex sanity (crítico #1):** `select 'matias.rojas@gmail.com' ~ '<gate>'` es true; una
  fila sembrada con `'+56 9 8123 4567'` tiene `phone_digits = '56981234567'`.
- **Constraints:** `customers_email_lower`, `customers_contact_required`, unique email, largos.
- **`ensure_customer_for_user`:** adopta la fila del backfill conservando su id; idempotente;
  reclama la fila legacy `id = user, auth_user_id null`; refresca el email de auth cuando está
  libre **y propaga el snapshot** (ficha vinculada a un pedido pagado con earn → refresco →
  `mark_refunded` revoca del mismo cliente, saldo 0 == ledger); dos usuarios auth con el mismo
  email → el segundo levanta; llamadas concurrentes → una sola fila.
- **`upsert_guest_customer`:** el teléfono tipeado gana en invitados; el nombre del titular de
  cuenta se conserva; email inválido → null sin escribir.
- **Backfill** sobre filas sucias insertadas a mano: `MiXeD@Case.cl` se unifica; email con
  espacios queda sin vincular; nombre de 120 caracteres se clampea; email basura sin vincular;
  el nombre de la pagada vence al de la abandonada; teléfono elegido de forma independiente;
  la reserva hereda el vínculo de su pedido; segunda corrida devuelve 0; devuelve el conteo de
  insertados. Un pedido backfilleado se puede `mark_refunded` con claw-back.
- **`update_customer_contact`:** reescribe snapshots vinculados y huérfanos; email de titular
  rechazado; cambio de email y luego `mark_refunded` revoca al mismo cliente; solo-teléfono que
  gana email → retro; quitar el email a una ficha con puntos → `customer_email_in_use` (snapshot
  y saldo intactos), y sin ledger sí se permite.
- **`assign_booking_customer`:** snapshots reescritos incluido el pedido delta; evento con
  detail; A→B mueve el earn y ambos saldos igualan sus sumas del ledger; A→B→C y A→B→A
  convergen; pedido con canje rechazado; destino solo-teléfono rechazado en pagada; reserva
  cancelada rechazada; `mark_refunded` tras reasignar revoca al cliente nuevo; pedido pagado
  legacy sin cliente → el nuevo gana el 5 %.
- **PR3 (`create_checkout` / cortesía):** vincula por `p_customer_id`; invitado se auto-crea y
  vincula con snapshot desde el registro; el teléfono nuevo de un invitado que vuelve gana;
  `slot_taken` revierte la ficha; email inválido → sin vincular; nombre del titular no se pisa;
  **`orders.customer_email` queda en minúsculas** (crítico faltante #7); `create_reschedule_charge`
  copia `customer_id`; cortesía con y sin `customerId` (con email → auto-crea).
- `booking-events.itest.ts`: `customer_changed` → categoría "Reservas". `admin.itest.ts`:
  mapeo de errores de `assignCustomer`.
- `points.itest.ts`: fixtures `insert into customers (id, email, auth_user_id)`; el test de
  retro usa el id devuelto por `ensureCustomer`; "sin perfil" se reescribe (el invitado gana en
  vivo; un login posterior adopta la ficha y retro devuelve 0); canje para un cliente con
  `id ≠ auth id`. `reschedule.itest.ts:423/463` → `on conflict (email) do nothing`.
- **Cleanup strings (crítico faltante #9):** agregar `customers` **solo** a los itests que ya
  truncan `reservations, orders` (`truncate customers cascade` alcanza reservations, orders,
  points_ledger y las tablas de curso); un archivo que dependa de que las reservas del seed
  sobrevivan no debe agregarlo. Tras correr integración: `npm run db:reset` siempre.

### Script manual local (tras cada PR; nunca contra prod)

1. `npm run db:reset` → `npm run db:types` (**PR1:** el diff muestra `auth_user_id`,
   `phone_digits`, `customer_id` y los RPC nuevos; **PR3 y PR4: sin diff** — un diff aquí es
   un error) → `npm test` → `npm run test:integration` → `npx eslint .` → `npm run build`
   (todo exit 0) → reiniciar `npm run dev`.
2. `/admin/reservas/nueva`: escribir "mat" → elegir Matías → Efectivo → SuccessPanel muestra
   nombre + link WhatsApp; "9988" encuentra a Felipe por dígitos; Nuevo cliente solo con
   nombre → "Ingresa un email o un teléfono."; nombre + teléfono → creado y seleccionado;
   `catalina.soto@gmail.com` → "Usar ese cliente"; cortesía con Pía (solo teléfono) →
   `reservations.customer_id` seteado; cortesía tipeada con email nuevo → cliente auto-creado;
   "Solo nombre" → snapshot con nombre, `customer_id` null.
3. `/admin/clientes`: buscar, abrir Felipe, editar teléfono, "Nueva reserva" prellenada; cambiar
   el email de Catalina → el snapshot de su reserva se actualiza; el email de Felipe
   deshabilitado (cuenta); saldos distintos de cero para los clientes demo.
4. `/admin/reservas/{b1}` "Cambiar cliente": Matías → Pía rechazado (necesita email); → Camila
   → timeline "Cliente reasignado · 1999 pts movidos"; Matías 0 pts, Camila 1.999 pts.
5. `/cuenta` login como `felipe.munoz@outlook.cl` (Mailpit :54424) → saldo 4.498,
   `auth_user_id` seteado, `customers.id` sin cambios; editar teléfono en `/cuenta/perfil` → el
   snapshot de la reserva próxima se actualiza. Checkout público en `/reservar` como invitado
   existente con teléfono nuevo → `orders.customer_id` seteado, teléfono actualizado, visible
   en `/admin/clientes`.
6. Viewport 375 px: la lista del picker y `CambiarClienteDialog` scrollean; nada queda bajo el
   `CobroCard` sticky.

### Pre-flight en prod (solo lectura; antes de aprobar los jobs `migrate` de PR1 y PR3)

```sql
select count(*) from customers where email <> lower(trim(email));                          -- se normalizan
select lower(trim(email)), count(*) from customers group by 1 having count(*) > 1;          -- DEBE ser vacío
select count(*) from customers where length(name) > 80 or length(trim(phone)) not between 6 and 40; -- se clampean
select count(distinct lower(customer_email)) from orders
 where lower(customer_email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$';                              -- tamaño esperado del directorio
select count(*) from orders where customer_email is not null
   and lower(customer_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$';                            -- quedarán sin vincular
```

La segunda consulta vacía es condición para aprobar: la migración de PR1 aborta si hay
duplicados por mayúsculas/espacios (se resuelven a mano antes).

## Cadena de PRs

Cada PR verde (eslint + build + unit + itest); `supabase db push` vía el job `migrate` con
aprobación; **PR N+1 se mergea solo después de aprobado el `migrate` de PR N**.

1. **`feat(db): directorio de clientes (expand)`** — `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md`
   + nota en `2026-07-04-cuenta-puntos-design.md` (primer commit),
   `supabase/migrations/20260909120000_customer_directory.sql` (DDL, `booking_events`,
   `upsert_guest_customer`, `customer_sync_snapshots` (helper privado), `ensure_customer_for_user`,
   `backfill_customers_from_bookings`, `update_customer_contact`, `assign_booking_customer` —
   definidas, no ejecutadas),
   `supabase/seed.sql`, `src/infrastructure/db/database.types.ts`,
   `src/application/ports/customers.ts` (`email: string | null`; el mapper de
   `customer-repository.ts:34` compila sin cambios),
   `src/infrastructure/db/customers-directory.itest.ts`, `booking-events.itest.ts`, cleanup
   strings (`customers` en los itests que ya truncan `reservations, orders`).
2. **`refactor(customers): identidad por auth_user_id`** (solo código) —
   `src/domain/contact/contact.ts` (+test; `application.ts`, `lead.ts`, `lib/whatsapp.ts`,
   `lib/profile.ts` re-apuntados), `src/domain/customers/customer-input.ts` (+test),
   `src/application/ports/customers.ts`, `src/infrastructure/db/customer-repository.ts`,
   `src/application/customers/customer-service.ts` (+test),
   `app/cuenta/(panel)/{layout,page,perfil/page,perfil/actions}.tsx`,
   `app/auth/callback/route.ts`, `app/reservar/page.tsx`, `app/api/bookings/route.ts`,
   fixtures de `points.itest.ts` y `reschedule.itest.ts`.
3. **`feat(db): activar vínculo cliente ↔ reserva`** —
   `supabase/migrations/20260909130000_customer_directory_activate.sql` (backfill + retro,
   `create_checkout`, `create_reschedule_charge`), `src/infrastructure/db/admin-repository.ts`
   (`createCourtesyBooking(…, customerId?)` + `upsert_guest_customer`),
   `src/application/checkout/checkout-service.ts` (`customer_not_found`),
   `app/admin/(panel)/reservas/nueva/actions.ts` (copy), `src/application/ports/checkout.ts`
   (comentario), `points.itest.ts` ("sin perfil"), casos de checkout en
   `customers-directory.itest.ts` (los cleanup strings ya vienen de PR1). El código depende
   solo de columnas/funciones de PR1.
4. **`feat(rbac): customers.manage`** — `supabase/migrations/20260909140000_customers_permission.sql`,
   `src/domain/auth/permissions.ts`, `permissions.test.ts`. Sin nav.
5. **`feat(admin): elegir o crear cliente en la consola`** —
   `components/admin/customers/{CustomerPicker,NuevoClienteForm,CustomerSummary}.tsx`,
   `components/admin/ui/Dialog.tsx`, `src/application/customers/customer-directory-service.ts`
   (+test), `src/composition.ts`, `app/admin/(panel)/reservas/nueva/{actions,types,page}.tsx`,
   `nueva/_components/BookingConsole.tsx`, `lib/manual-booking.ts` (+test).
6. **`feat(admin): /admin/clientes`** — `components/admin/ui/{SearchBox,Pagination}.tsx`
   (promovidos; reservas actualizado), `src/domain/admin/clientes-list.ts` (+test), repo
   `list/search/bookingsForCustomer/updateContact`, `app/admin/(panel)/clientes/{page,loading,actions}.tsx`,
   `clientes/[id]/{page,loading,actions}.tsx`, `clientes/_components/NuevoClienteButton.tsx`,
   `components/admin/AdminShell.tsx`, `components/admin/ui/Sidebar.tsx`, prefill `?c=` en nueva.
7. **`feat(admin): cambiar cliente en la ficha de reserva`** —
   `src/infrastructure/db/admin-repository.ts` (`customer_id` en `ResRow`/`map`/selects,
   `customerId`, detail tipado, `assignCustomer`), `app/admin/(panel)/reservas/[id]/{page,actions}.tsx`,
   `[id]/_components/CambiarClienteDialog.tsx`, `admin.itest.ts`.

Reutilización encontrada: `escapeIlike` (`reservas-list.ts:73`), `runData`/`ActionDataResult`
(`components/admin/ui/action.ts`), forma de `lookupTrialCreditAction` (`curso/actions.ts:389-398`),
precedente pick-or-type de `InscribirDialog`, guard de carrera de `loadDay`
(`BookingConsole.tsx:144-167`), `Field/Input/Select/Textarea/Dialog/DataTable/EmptyState/
Toaster/ActionForm/SubmitButton/Stat/StatusPill` + `inputCls`/`btn`, iconos
`search`/`user`/`add`, `fmtPts`/`fmtPtsSigned` (`components/cuenta/format`), patrón de
migración de permisos (`20260724120000_dj_applications.sql:40`), `hasPermission`/`currentClaims`.

## Riesgos, casos borde y no-objetivos

- **Ventana de deploy.** El esquema de PR1 lo tolera el código vivo (upsert por id explícito;
  sin colisiones de email porque el backfill aún no corrió). El backfill y el auto-create
  llegan en PR3, con PR2 ya en vivo. El backfill es re-ejecutable (`select
  backfill_customers_from_bookings();`) para cerrar cualquier hueco. Filas creadas por el
  código viejo en la ventana PR1→PR2 (`id = auth id`, `auth_user_id` null) las reclama
  `ensure_customer_for_user` paso 2.
- **Aborto por duplicados en PR1.** La migración levanta si hay emails que difieren solo por
  mayúsculas/espacios; el pre-flight lo detecta antes.
- **Sin CHECK de forma:** un email legacy raro de auth nunca bloquea un pago; solo queda
  fuera del gate de nuevos escritores.
- **Cambio de timing de puntos.** Los invitados con email válido ganan en `confirm_payment`
  en vez de vía retro al crear cuenta; los backfilleados reciben retro en la activación. Los
  saldos finales son idénticos a los que produciría un signup posterior (`points_ledger_once`
  hace no-op el retro sobre pedidos ya ganados) y el claw-back de `mark_refunded` aplica en
  vivo. El canje sigue exigiendo sesión en `/cuenta`. Nota añadida a la spec de puntos.
- **Semántica de reasignación.** El earn se mueve con pares `adjust`; pedidos con canje y
  destinos solo-teléfono en pedidos pagados se rechazan con copy explícito para que no parezca
  un bug; los pedidos delta reciben la nueva identidad (payer MP / notificaciones). Reasignar
  una reserva `held` a un cliente solo-teléfono deja `customer_email` null en el pedido
  pendiente: si luego se paga, no gana puntos hasta que la ficha tenga email (coherente con
  decisión 3).
- **Email de auth cambiado desde el dashboard** mientras una ficha invitada ya tiene ese
  email: `ensure_customer_for_user` levanta en vez de fusionar; `/cuenta` muestra el
  `EmptyState`; la salida es editar el email desde el admin o fusionar a mano (fusión es
  no-objetivo).
- **Ruido en el directorio** por holds abandonados o bots: solo se crean fichas con email de
  forma válida y dentro de la transacción del checkout; son buscables/editables; la lista
  ordena por más recientes. Aceptable para v1.
- **Cortesía = dos sentencias** (rpc + insert): un `slot_taken` deja creada la ficha. Dato
  válido, no huérfano.
- **Cascade de los itests:** `truncate customers cascade` llega a reservations/orders/
  points_ledger/curso; inocuo en archivos que re-siembran en `beforeEach`; prohibido en los
  que dependen del seed.
- **Combobox a mano:** a11y mínima (ARIA 1.2, teclado, estado live); sin tests DOM en el
  repo, lo cubre el script manual.
- **Sin borrado en cascada auth → customers** (`on delete set null`); no hay flujo de borrado.
- **No-objetivos:** fusionar/eliminar clientes; canje o ajuste manual de puntos desde el
  admin; RUT; notificar al cliente al reasignar; vincular pedidos de curso hacia adelante (el
  backfill los cubre por email); pasar las funciones de puntos al FK; pg_trgm/citext; editar
  el email de un titular de cuenta; tests jsdom/RTL; picker en el `/reservar` público.

## Refinamientos flagged (firma del dueño; aplican por defecto)

1. **Ranking del backfill.** La decisión 4 dice "desde la reserva más reciente"; el diseño
   toma nombre y teléfono primero de filas pagadas/cumplidas/reembolsadas/confirmadas y solo
   después por recencia (`order by email, rk, created_at desc`), porque los holds abandonados
   suelen traer nombres basura. Alternativa: `created_at desc` puro (cambiar el `rk` por una
   constante en `best_name`/`best_phone`).
2. **Retro para los backfilleados.** PR3 corre `award_retro_points` para cada cliente con
   email tras el backfill, así `/admin/clientes` muestra saldos reales en vez de "0 pts" hasta
   el signup (y el seed y prod quedan simétricos). Matiz sobre la decisión 5: un invitado
   tiene puntos antes de crear cuenta, pero **no puede canjearlos** sin sesión en `/cuenta`;
   los invitados nuevos igual ganan en vivo al pagar. Alternativa: no correr retro y agregar la
   copy "Los puntos se otorgan al crear la cuenta." en la ficha.
