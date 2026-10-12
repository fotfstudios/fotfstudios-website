-- Un checkout público ya no pisa la ficha de un cliente existente (auditoría de seguridad
-- 2026-10-12, hallazgo 1).
--
-- El problema: POST /api/bookings no exige sesión ni pago para dejar rastro. Con el correo de
-- otra persona, upsert_guest_customer reemplazaba el teléfono y el nombre de su ficha de
-- invitado (y rellenaba el teléfono vacío de un titular de cuenta). El PIN de la cerradura y los
-- recordatorios por WhatsApp leen `customers.phone` primero, así que bastaba abandonar un
-- checkout con el correo de la víctima y el celular propio para recibir su PIN.
--
-- La regla nueva (decisión del dueño): la ficha de un correo existente NO se toca desde un
-- checkout sin sesión. Lo tipeado vive en el pedido y la reserva, nunca en la ficha. La ficha
-- solo la cambian su titular (/cuenta) o el staff (/admin/clientes).
--
--   1. upsert_guest_customer: si la ficha existe, solo toca updated_at. Una ficha NUEVA nace
--      con lo tipeado, como siempre.
--   2. create_checkout: en la rama del invitado (p_customer_id null) el snapshot del pedido y
--      la reserva lleva lo TIPEADO, con la ficha como respaldo de lo que vino vacío. Antes lo
--      tipeado llegaba al pedido solo porque primero había pisado la ficha; sin este cambio, el
--      invitado que vuelve con un celular nuevo lo perdería y el estudio llamaría al viejo. Con
--      p_customer_id (sesión o staff) sigue ganando la ficha, igual que antes. El email no
--      cambia: siempre el de la ficha (los puntos resuelven por email).

-- ── 1. upsert_guest_customer: una ficha existente no se pisa ──────────────────
create or replace function upsert_guest_customer(p_name text, p_email text, p_phone text)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
  v_name  text := nullif(left(trim(p_name), 80), '');
  v_phone text := case when char_length(trim(p_phone)) between 6 and 40 then trim(p_phone) end;
  v_id    uuid;
begin
  if v_email is null
     or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
     or char_length(v_email) > 120 then
    return null;
  end if;

  -- Quien escribe un correo no demuestra que es suyo: nombre y teléfono de una ficha
  -- existente quedan como estaban (ni pisar ni rellenar). `do update` en vez de `do nothing`
  -- porque `returning` necesita la fila para devolver el id.
  insert into customers (email, name, phone) values (v_email, v_name, v_phone)
    on conflict (email) do update set updated_at = now()
    returning id into v_id;
  return v_id;
end;
$$;

-- ── 2. create_checkout: el invitado deja lo tipeado en su pedido, no en la ficha ─────────
-- Mismo cuerpo que 20261007130000 salvo el select del snapshot (ver encabezado).
create or replace function create_checkout(
  p_resource uuid, p_starts timestamptz, p_ends timestamptz,
  p_amount int, p_net int, p_tax int, p_currency text,
  p_customer jsonb, p_snapshot jsonb, p_lines jsonb,
  p_ttl interval default interval '10 minutes',
  p_customer_id uuid default null, p_points int default 0,
  p_terms_version text default null, p_terms_source text default null,
  p_order_kind text default 'booking'
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_res uuid; v_order uuid; v_line jsonb; v_balance int;
  v_cust  uuid := p_customer_id;
  v_name  text := nullif(left(trim(p_customer ->> 'name'), 80), '');
  v_email text := nullif(lower(trim(p_customer ->> 'email')), '');
  v_phone text := case when char_length(trim(p_customer ->> 'phone')) between 6 and 40
                       then trim(p_customer ->> 'phone') end;
begin
  if p_order_kind not in ('booking', 'trial') then raise exception 'order_kind_invalid'; end if;
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
    -- Invitado (sin p_customer_id): gana lo tipeado y la ficha solo rellena lo vacío, porque
    -- upsert_guest_customer ya no copia lo tipeado a una ficha existente. Con p_customer_id
    -- (sesión o staff) gana la ficha, como siempre. El email es siempre el de la ficha.
    select case when p_customer_id is null then coalesce(v_name, c.name) else coalesce(c.name, v_name) end,
           c.email,
           case when p_customer_id is null then coalesce(v_phone, c.phone) else coalesce(c.phone, v_phone) end
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
    values (p_resource, case p_order_kind when 'trial' then 'prueba' else 'booking' end, 'held', p_starts, p_ends,
            case when p_ttl is null then null else now() + p_ttl end,
            v_name, v_email, v_phone, v_cust)
    returning id into v_res;

  insert into orders (kind, status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot,
                      terms_accepted_at, terms_version, terms_source, customer_id)
    values (p_order_kind, 'pending_payment', p_currency, p_amount, p_net, p_tax,
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
    perform confirm_payment(v_order, null::text, 'puntos');
  end if;

  return v_order;
end;
$$;
