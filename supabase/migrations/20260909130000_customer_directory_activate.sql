-- Directorio de clientes (PR3, activación). Ver docs/superpowers/specs/2026-09-09-directorio-clientes-design.md.
--
-- PR1 dejó el esquema y las funciones DEFINIDAS pero sin ejecutar; PR2 cortó la suposición
-- customers.id = auth.users.id en el código. Acá se ACTIVA el vínculo: se corre el backfill
-- histórico, se otorgan los puntos retroactivos y create_checkout / create_reschedule_charge
-- pasan a escribir customer_id (misma firma; create or replace, nunca drop → expand/contract).
--
-- INVARIANTE (spec §"Invariante central"): quien escribe customer_id reescribe también
-- customer_name/customer_email/customer_phone DESDE la ficha, así el FK y la join por email
-- (c.email = lower(o.customer_email), que usan las ocho funciones de puntos) nunca discrepan.
--
-- Regex: UNA barra invertida (standard_conforming_strings = on).

-- ── 1. PRECONDICIÓN: customer_sync_snapshots deja de ser destructivo ──
-- El email de la ficha SIGUE mandando (las funciones de puntos resuelven por ahí y un snapshot
-- con el email viejo haría que mark_refunded / reschedule_* revoquen a nadie — o al cliente
-- equivocado si otra ficha tomara esa dirección). Nombre y teléfono, en cambio, se COALESCEAN
-- contra lo que ya tenía el pedido/reserva: la ficha suele ser la fuente MÁS POBRE (en prod las
-- tres fichas tienen name y phone en NULL mientras 13 reservas llevan nombre y 5 llevan
-- teléfono), y copiar esos NULL encima borraba el contacto de reservas pagadas y confirmadas.
-- Tiene que ir ANTES del backfill y antes de que cualquier escritor nuevo llame al helper.
create or replace function customer_sync_snapshots(p_customer uuid, p_old_email text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  c customers%rowtype;
begin
  select * into c from customers where id = p_customer;
  if c.id is null then raise exception 'customer_not_found'; end if;

  update orders o
     set customer_id    = c.id,
         customer_name  = coalesce(c.name,  o.customer_name),
         customer_email = c.email,
         customer_phone = coalesce(c.phone, o.customer_phone)
   where o.customer_id = c.id
      or (o.customer_id is null and o.customer_email is not null
          and lower(o.customer_email) in (lower(p_old_email), c.email));

  update reservations r
     set customer_id    = c.id,
         customer_name  = coalesce(c.name,  r.customer_name),
         customer_email = c.email,
         customer_phone = coalesce(c.phone, r.customer_phone)
   where r.customer_id = c.id
      or (r.customer_id is null and r.customer_email is not null
          and lower(r.customer_email) in (lower(p_old_email), c.email));
end;
$$;

-- ── 2. Backfill del directorio (una vez; la función ya es idempotente y re-ejecutable) ──
-- Una ficha por lower(customer_email) distinto que pase la puerta de forma; nombre y teléfono
-- se eligen por independiente (pagadas/cumplidas/reembolsadas/confirmadas primero, luego la más
-- reciente) y las fichas existentes SOLO reciben los NULL rellenados. Vincula pedidos, reservas
-- y reservas a través de su pedido. Medido en prod el 2026-09-10: crea 7 fichas (directorio
-- 3 → 10) y no deja ningún pedido sin vincular.
-- OJO: el vínculo escribe customer_id pero NO reescribe customer_email en el snapshot — un
-- pedido guardado como 'P4@Prod.CL' conserva esa mayúscula/minúscula aunque su ficha ya sea
-- 'p4@prod.cl'; es inocuo porque las ocho funciones de puntos siempre comparan
-- lower(o.customer_email) = c.email, nunca el valor crudo del snapshot.

-- ── 3. Retro de puntos para toda ficha con email ──
-- Idempotente por points_ledger_once (order_id, kind, ref): una segunda corrida no otorga nada.
-- Así /admin/clientes muestra saldos reales en vez de "0 pts" hasta el signup, y el seed local
-- y prod quedan simétricos (refinamiento flagged #2 de la spec).
-- OJO: award_retro_points recorre TODOS los pedidos del email, incluidos los pedidos delta de
-- reagendamiento, y con reagendamientos previos podría otorgar de más. Eso es un defecto
-- PREEXISTENTE con su propio PR; acá no se arregla y no puede dispararse: prod tiene 0
-- reagendamientos y 0 filas en points_ledger al momento de esta migración.

-- 2 y 3 comparten un solo bloque para CAPTURAR lo que hicieron: por separado, el `select`
-- descartaba el int de backfill_customers_from_bookings() y el loop descartaba cada `perform`
-- de award_retro_points, así que el log del deploy solo mostraría "Applying migration
-- 20260909130000_..." — ninguna huella de una escritura irreversible sobre prod (sin down
-- migration) cuyas cifras exactas dependen del momento en que corra. `raise notice` las deja en
-- el log sin cambiar ningún número: mismas funciones, mismo conjunto de iteración, mismo filtro.
do $$
declare v_new int; v_pts int := 0; r record;
begin
  select backfill_customers_from_bookings() into v_new;
  for r in select id from customers where email is not null loop
    v_pts := v_pts + award_retro_points(r.id);
  end loop;
  raise notice 'activación directorio: % fichas nuevas, % puntos retro otorgados', v_new, v_pts;
end $$;

-- ── 4. create_checkout: crea/vincula la ficha (MISMA firma de 15 parámetros) ──
-- create or replace, nunca drop: checkout-repository.ts no se toca y el código vivo sigue
-- llamando igual (expand/contract). Con p_customer_id la ficha tiene que existir
-- (customer_not_found cubre la carrera entre elegir el cliente y guardar, y el chequeo toma
-- FOR KEY SHARE para que un delete concurrente ESPERE en vez de aflorar como un 23503 crudo)
-- y, si el pedido cobra, tiene que tener email (customer_checkout_needs_email); sin él, el invitado
-- se resuelve por email con upsert_guest_customer — el MISMO escritor que usa la cortesía —,
-- que devuelve null si el email no pasa la puerta de forma (entonces la reserva queda sin
-- vincular, exactamente como hoy). INVARIANTE: el snapshot se lee de la fila DESPUÉS del
-- upsert, así un invitado que vuelve trae su teléfono nuevo y un titular de cuenta conserva
-- nombre y email. Consecuencia: orders.customer_email queda SIEMPRE en minúsculas.
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
    -- FIX ROUND 2 (revisión final): lock COMPARTIDO, no un `exists` pelado. Un `exists` no
    -- toma ningún lock, así que un delete de la ficha entre el chequeo y el insert se cuela y
    -- aflora como un 23503 (foreign_key_violation) que el mapeo de errores de la app NO
    -- reconoce → texto crudo de Postgres en pantalla. Hoy nada borra clientes; /admin/clientes
    -- (PR6) sí. FOR KEY SHARE es EXACTAMENTE el mismo modo que los dos insert de abajo toman
    -- implícito para validar la FK: adquirirlo antes no agrega ningún conflicto nuevo ni
    -- cambia el análisis de deadlock del bloque de canje (FOR KEY SHARE no conflictúa con
    -- FOR NO KEY UPDATE), solo hace esperar al delete hasta el commit.
    perform 1 from customers where id = v_cust for key share;
    if not found then raise exception 'customer_not_found'; end if;
  else
    v_cust := upsert_guest_customer(v_name, v_email, v_phone);   -- null si el email no pasa la puerta
  end if;

  if v_cust is not null then
    select coalesce(c.name, v_name), c.email, coalesce(c.phone, v_phone)
      into v_name, v_email, v_phone
      from customers c where c.id = v_cust;
    -- Ficha SOLO-TELÉFONO (legal: customers_contact_required se conforma con el teléfono) en
    -- un pedido que COBRA: prohibido. El snapshot quedaría con customer_id puesto y
    -- customer_email vacío, y las ocho funciones de puntos resuelven al cliente por
    -- `c.email = lower(o.customer_email)`: esa reserva no ganaría NUNCA y un reembolso no
    -- revocaría nada — el FK y la join discrepando, justo lo que prohíbe el INVARIANTE de
    -- arriba. Espejo de customer_assign_needs_email (20260909120000_customer_directory.sql:365),
    -- que ya rechaza este mismo caso al reasignar. Un pedido de $0 (cortesía, canje 100 %
    -- puntos) no puede ganar nada — el earn es floor(0.05 · 0) = 0 —, así que sigue permitido.
    if v_email is null and p_amount > 0 then raise exception 'customer_checkout_needs_email'; end if;
  end if;

  insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at,
                            customer_name, customer_email, customer_phone, customer_id)
    values (p_resource, 'booking', 'held', p_starts, p_ends,
            case when p_ttl is null then null else now() + p_ttl end,
            v_name, v_email, v_phone, v_cust)
    returning id into v_res;

  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot,
                      terms_accepted_at, terms_version, terms_source, customer_id)
    values ('pending_payment', p_currency, p_amount, p_net, p_tax,
            v_name, v_email, v_phone, p_snapshot,
            case when p_terms_source is not null then now() end,
            case when p_terms_source is not null then p_terms_version end,
            p_terms_source, v_cust)
    returning id into v_order;

  update reservations set order_id = v_order where id = v_res;

  -- Bloque de canje: sigue usando p_customer_id, NO v_cust. Hoy son el mismo valor cuando
  -- p_points > 0: el canje exige sesión (checkout-service.ts:62) y esa rama siempre pasa
  -- p_customer_id, así que v_cust nunca se reasignó (la rama del invitado solo corre con
  -- p_customer_id null, y entonces p_points = 0). Si alguna vez un canje pudiera llegar sin
  -- p_customer_id, esta línea debe pasar a v_cust.
  --
  -- FIX ROUND 1 (deadlock): este bloque YA NO es byte-idéntico al de 20260707240000 — el lock
  -- bajó de FOR UPDATE a FOR NO KEY UPDATE. Motivo: las dos columnas customer_id de arriba
  -- (reservations/orders) hacen que un INSERT tome un lock FOR KEY SHARE sobre la fila del
  -- cliente (así es como Postgres valida una FK). Con FOR UPDATE, dos create_checkout
  -- concurrentes para EL MISMO cliente y AMBOS con p_points > 0 quedan cada uno sosteniendo
  -- el FOR KEY SHARE de su propio insert y pidiendo el FOR UPDATE del otro — ciclo, deadlock
  -- (medido con harness de dos conexiones, slots bien separados para no tocar la exclusion
  -- constraint de reservas: 40/40 pares deadlockearon, 80/80 intentos). FOR NO KEY UPDATE es
  -- la fuerza correcta para esta sección: solo toca points_balance, que no participa de
  -- ninguna key, y por diseño de Postgres NO conflictúa con FOR KEY SHARE — pero SÍ
  -- conflictúa con otro FOR NO KEY UPDATE, así que dos canjes concurrentes sobre el mismo
  -- cliente siguen serializando correctamente (uno espera, no hay ciclo) y el
  -- chequeo-y-descuento sigue atómico bajo lock. Medido tras el fix: 0 deadlocks en 100 pares
  -- (200 intentos, dos corridas del mismo harness). Ver task-3-report.md § Fix round 1.
  if p_points > 0 then
    select points_balance into v_balance from customers where id = p_customer_id for no key update;
    if v_balance is null then raise exception 'points_without_customer'; end if;
    if v_balance < p_points then raise exception 'insufficient_points'; end if;
    perform apply_points(p_customer_id, v_order, 'redeem', -p_points, '');
    update orders set points_redeemed_clp = p_points where id = v_order;
  end if;

  for v_line in select jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, line_type, reservation_id, addon_key, description,
                             quantity, unit_price_clp, subtotal_clp)
      values (v_order, v_line ->> 'line_type',
              case when v_line ->> 'line_type' = 'room_time' then v_res else null end,
              v_line ->> 'addon_key', v_line ->> 'description',
              coalesce((v_line ->> 'quantity')::int, 1),
              (v_line ->> 'unit_price_clp')::int, (v_line ->> 'subtotal_clp')::int);
  end loop;

  perform log_booking_event(v_res, 'created', p_order => v_order);

  if p_points > 0 and p_amount = 0 then
    perform confirm_payment(v_order, 'offline:puntos');
  end if;

  return v_order;
end;
$$;

-- ── 5. create_reschedule_charge: el pedido delta hereda el vínculo ──
-- MISMA firma. El pedido delta ya copiaba nombre/email/teléfono del pedido original; ahora copia
-- también customer_id, para que el pagador de MP, las notificaciones y una futura reasignación
-- (PR7 reescribe también los pedidos delta) vean al mismo cliente. INVARIANTE cumplido por
-- construcción: los cuatro valores salen de la MISMA fila de orders, que ya venía de la ficha.
create or replace function create_reschedule_charge(
  p_reservation uuid, p_starts timestamptz, p_ends timestamptz,
  p_snapshot jsonb, p_lines jsonb,
  p_delta int, p_delta_net int, p_delta_tax int, p_created_by uuid default null
) returns table(reschedule_id uuid, delta_order_id uuid)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_order uuid; v_old_start timestamptz; v_old_end timestamptz; v_live int;
  v_name text; v_email text; v_phone text; v_currency text; v_cust uuid;
  v_delta_order uuid; v_resched uuid;
begin
  select r.order_id, r.starts_at, r.ends_at into v_order, v_old_start, v_old_end
    from reservations r where r.id = p_reservation and r.status = 'confirmed' and r.kind = 'booking';
  if v_order is null then raise exception 'reschedule_not_active'; end if;

  select amount_clp - refunded_amount_clp, customer_name, customer_email, customer_phone, currency, customer_id
    into v_live, v_name, v_email, v_phone, v_currency, v_cust
    from orders where id = v_order and status = 'paid' and coalesce(points_redeemed_clp, 0) = 0;
  if v_live is null then raise exception 'reschedule_not_eligible'; end if;
  if p_delta < 1 then raise exception 'reschedule_bad_delta'; end if;

  insert into orders (status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, customer_id)
    values ('pending_payment', v_currency, p_delta, p_delta_net, p_delta_tax,
            v_name, v_email, v_phone, v_cust)
    returning id into v_delta_order;

  insert into reschedules (reservation_id, original_order_id, delta_order_id, kind, status,
      old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp,
      new_snapshot, new_lines, created_by)
    values (p_reservation, v_order, v_delta_order, 'charge', 'pending_charge',
      v_old_start, v_old_end, p_starts, p_ends, v_live, v_live + p_delta, p_delta, p_snapshot, p_lines, p_created_by)
    returning id into v_resched;

  perform log_booking_event(p_reservation, 'reschedule_charge_pending', p_order => v_delta_order,
    p_reschedule => v_resched, p_amount => p_delta, p_created_by => p_created_by,
    p_detail => jsonb_build_object('old_starts_at', v_old_start, 'new_starts_at', p_starts));

  return query select v_resched, v_delta_order;
end;
$$;
