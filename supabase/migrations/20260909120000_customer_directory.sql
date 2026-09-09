-- Directorio de clientes (PR1, expand). Ver docs/superpowers/specs/2026-09-09-directorio-clientes-design.md.
--
-- customers deja de ser "una fila por login": gana identidad propia (id con default, FK a
-- auth.users reemplazada por auth_user_id nullable), email opcional (basta teléfono), y
-- reservations/orders ganan customer_id. Nada de esto lo usa el código vivo todavía: es
-- tolerado por el upsert-por-id actual y las funciones de puntos siguen resolviendo al
-- cliente por lower(orders.customer_email) = customers.email (byte-idénticas).
--
-- INVARIANTE (todos los escritores de customer_id, aquí y en PR3): quien escribe customer_id
-- reescribe customer_name/email/phone DESDE la ficha, así FK y join por email siempre coinciden.
--
-- Sin CHECK de forma de email en la tabla: un NOT VALID igual se evalúa en UPDATE y
-- apply_points actualiza customers → un email legacy raro abortaría pagos/reembolsos. La forma
-- la imponen los escritores (upsert_guest_customer, backfill, update_customer_contact, app).
--
-- Las funciones de abajo se DEFINEN pero no se ejecutan: el backfill corre en PR3.
-- Regex: UNA barra invertida (standard_conforming_strings = on).

-- ── 1. Guardas + normalización (nunca fusionar en silencio; normalizar antes de los CHECK) ──
do $$ begin
  if exists (select 1 from customers group by lower(trim(email)) having count(*) > 1) then
    raise exception 'customers: emails que difieren solo por mayúsculas/espacios; resolver a mano antes de migrar.';
  end if;
end $$;

update customers
   set email = lower(trim(email)),
       name  = nullif(left(trim(name), 80), ''),
       phone = case when char_length(trim(phone)) between 6 and 40 then trim(phone) end;

-- ── 2. Identidad propia sin renumerar (nombre del FK resuelto en pg_constraint, no asumido) ──
do $$
declare v_fk text;
begin
  select conname into v_fk from pg_constraint
    where conrelid = 'public.customers'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass;
  if v_fk is not null then
    execute format('alter table public.customers drop constraint %I', v_fk);
  end if;
end $$;

alter table customers alter column id set default gen_random_uuid();
alter table customers add column auth_user_id uuid unique references auth.users (id) on delete set null;
update customers c set auth_user_id = c.id
  where exists (select 1 from auth.users u where u.id = c.id);

-- ── 3. Email opcional + constraints (auditoría C6: customers_email_lower) ──
alter table customers alter column email drop not null;
alter table customers
  add constraint customers_email_lower      check (email is null or email = lower(email)),
  add constraint customers_contact_required check (email is not null or phone is not null),
  add constraint customers_name_len         check (name  is null or char_length(name)  between 1 and 80),
  add constraint customers_phone_len        check (phone is null or char_length(phone) between 6 and 40);

-- ── 4. phone_digits (búsqueda por dígitos) + índices ──
alter table customers add column phone_digits text generated always as
  (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored;
create index customers_phone_digits_idx on customers (phone_digits) where phone_digits is not null;
create index customers_created_idx on customers (created_at desc);

-- ── 5. customer_id en reservas y pedidos (nullable; on delete set null; índices parciales) ──
alter table reservations add column customer_id uuid references customers (id) on delete set null;
alter table orders       add column customer_id uuid references customers (id) on delete set null;
create index reservations_customer_idx on reservations (customer_id, starts_at desc) where customer_id is not null;
create index orders_customer_idx       on orders (customer_id) where customer_id is not null;

-- ── 6. booking_events aprende 'customer_changed' (constraint y categoría cambian JUNTOS,
--       como en 20260824120000_curso_dj.sql: log_booking_event aborta ante categoría null) ──
alter table booking_events drop constraint booking_events_type_check;
alter table booking_events add constraint booking_events_type_check
  check (type in (
    'created', 'payment_confirmed', 'courtesy_confirmed', 'access_sent',
    'reschedule_moved', 'reschedule_charge_pending', 'reschedule_charge_paid',
    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
    'boleta_issued', 'boleta_emitted', 'nota_credito_issued', 'nota_credito_emitted',
    'points_earned', 'points_revoked', 'cancelled', 'refunded',
    'curso_session_scheduled', 'curso_session_moved', 'curso_session_cancelled',
    'customer_changed'));

create or replace function booking_event_category(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_type in ('created', 'courtesy_confirmed', 'reschedule_moved', 'cancelled',
                    'curso_session_scheduled', 'curso_session_moved',
                    'curso_session_cancelled', 'customer_changed') then 'Reservas'
    when p_type in ('payment_confirmed', 'reschedule_charge_pending', 'reschedule_charge_paid',
                    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
                    'refunded') then 'Pagos'
    when p_type in ('points_earned', 'points_revoked') then 'Puntos'
    when p_type in ('boleta_issued', 'boleta_emitted', 'nota_credito_issued',
                    'nota_credito_emitted') then 'Documentos tributarios'
    when p_type = 'access_sent' then 'Notificaciones'
  end
$$;

-- ── 7. upsert_guest_customer: ÚNICO escritor de fichas de invitado (checkout, cortesía, backfill) ──
-- Normaliza (lower/trim, topes), y sin email de forma válida no hay ficha → null (el pedido
-- queda sin vincular, como hoy). Con ficha existente: para invitados lo tipeado gana (teléfono y
-- nombre nuevos son la verdad más reciente para WhatsApp/MP); un titular de cuenta conserva
-- nombre y email y solo se le rellena un teléfono vacío.
create function upsert_guest_customer(p_name text, p_email text, p_phone text)
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

  insert into customers (email, name, phone) values (v_email, v_name, v_phone)
    on conflict (email) do update set
      name  = case when customers.auth_user_id is null
                   then coalesce(excluded.name, customers.name)
                   else customers.name end,
      phone = case when customers.auth_user_id is null
                   then coalesce(excluded.phone, customers.phone)
                   else coalesce(customers.phone, excluded.phone) end,
      updated_at = now()
    returning id into v_id;
  return v_id;
end;
$$;

-- ── 8. customer_sync_snapshots (helper privado) + ensure_customer_for_user: login → ficha ──
-- INVARIANTE para quien reescribe customers.email de una ficha que ya puede estar vinculada:
-- reescribe el snapshot (desde la ficha) en pedidos/reservas vinculados Y adopta+reescribe los
-- huérfanos que la join por email atribuía a esta ficha (email viejo o nuevo). Sin esto, tras
-- cambiar el email los pedidos pagados quedarían con el email viejo y mark_refunded /
-- reschedule_down / apply_reschedule_charge (join c.email = lower(o.customer_email)) revocarían
-- a nadie — o, si otra ficha tomara ese email, al cliente equivocado.
create function customer_sync_snapshots(p_customer uuid, p_old_email text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  c customers%rowtype;
begin
  select * into c from customers where id = p_customer;
  if c.id is null then raise exception 'customer_not_found'; end if;

  update orders
     set customer_id = c.id, customer_name = c.name, customer_email = c.email, customer_phone = c.phone
   where customer_id = c.id
      or (customer_id is null and customer_email is not null
          and lower(customer_email) in (p_old_email, c.email));
  update reservations
     set customer_id = c.id, customer_name = c.name, customer_email = c.email, customer_phone = c.phone
   where customer_id = c.id
      or (customer_id is null and customer_email is not null
          and lower(customer_email) in (p_old_email, c.email));
end;
$$;

-- Orden: (1) ficha ya vinculada por auth_user_id (refresca el email si cambió en auth y está
-- libre — y propaga el snapshot con customer_sync_snapshots —; si otra ficha lo tiene, levanta:
-- fusionar es manual); (2) fila legacy id = usuario sin reclamar (creada por el upsert-por-id
-- vigente hasta PR2) → reclamarla; (3) ficha del directorio con ese email y sin dueño →
-- adoptarla conservando su id; (4) alta con id = usuario (paridad con el modelo anterior).
-- Carrera en (4): on conflict do nothing + relectura.
create function ensure_customer_for_user(p_user uuid, p_email text)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
  v_id    uuid;
  v_cur   text;
begin
  if p_user is null then raise exception 'customer_user_required'; end if;
  if v_email is null then raise exception 'customer_email_required'; end if;

  -- (1) ya vinculada
  select id, email into v_id, v_cur from customers where auth_user_id = p_user;

  -- (2) fila legacy sin reclamar
  if v_id is null then
    update customers set auth_user_id = p_user, updated_at = now()
      where id = p_user and auth_user_id is null
      returning id, email into v_id, v_cur;
  end if;

  if v_id is not null then
    if v_cur is distinct from v_email then
      update customers set email = v_email, updated_at = now()
        where id = v_id and not exists (select 1 from customers where email = v_email);
      if not found then raise exception 'customer_email_owned_by_other_user'; end if;
      -- INVARIANTE: los pedidos/reservas ya vinculados (y los huérfanos del email viejo/nuevo)
      -- pasan a llevar el email nuevo; el claw-back sigue resolviendo a esta ficha.
      perform customer_sync_snapshots(v_id, v_cur);
    end if;
    return v_id;
  end if;

  -- (3) ficha del directorio (invitado/backfill) sin dueño → adoptar, id intacto
  update customers set auth_user_id = p_user, updated_at = now()
    where email = v_email and auth_user_id is null
    returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- (4) alta nueva; carrera → relectura
  insert into customers (id, email, auth_user_id) values (p_user, v_email, p_user)
    on conflict do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from customers where auth_user_id = p_user;
    if v_id is null then raise exception 'customer_email_owned_by_other_user'; end if;
  end if;
  return v_id;
end;
$$;

-- ── 9. backfill_customers_from_bookings: idempotente y re-ejecutable (PR3 lo corre) ──
-- MISMA clave que las joins de puntos: lower(email) SIN trim; la forma se valida con la misma
-- puerta que upsert_guest_customer. Nombre y teléfono se eligen por independiente: primero filas
-- pagadas/cumplidas/reembolsadas/confirmadas (los holds abandonados traen nombres basura), luego
-- la más reciente. Fichas existentes solo reciben NULLs rellenados. Devuelve las INSERTADAS
-- (xmax = 0 en RETURNING): row_count contaría también las actualizadas.
create function backfill_customers_from_bookings()
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_inserted int;
begin
  with seen as (
    select lower(customer_email) as email,
           nullif(left(trim(customer_name), 80), '') as name,
           case when char_length(trim(customer_phone)) between 6 and 40 then trim(customer_phone) end as phone,
           case when status in ('paid', 'fulfilled', 'refunded') then 0 else 1 end as rk,
           created_at
      from orders where customer_email is not null
    union all
    select lower(customer_email),
           nullif(left(trim(customer_name), 80), ''),
           case when char_length(trim(customer_phone)) between 6 and 40 then trim(customer_phone) end,
           case when status = 'confirmed' then 0 else 1 end,
           created_at
      from reservations where kind = 'booking' and customer_email is not null
  ),
  valid as (
    select * from seen
      where email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(email) <= 120
  ),
  best_name as (
    select distinct on (email) email, name from valid where name is not null
      order by email, rk, created_at desc
  ),
  best_phone as (
    select distinct on (email) email, phone from valid where phone is not null
      order by email, rk, created_at desc
  ),
  people as (select distinct email from valid),
  ins as (
    insert into customers (email, name, phone)
      select p.email, n.name, ph.phone
        from people p
        left join best_name  n  using (email)
        left join best_phone ph using (email)
      on conflict (email) do update set
        name       = coalesce(customers.name,  excluded.name),
        phone      = coalesce(customers.phone, excluded.phone),
        updated_at = now()
      returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_inserted from ins;

  -- Vínculos (INVARIANTE: el snapshot ya coincide con la ficha porque la clave ES el email).
  update orders o set customer_id = c.id from customers c
    where o.customer_id is null and o.customer_email is not null and c.email = lower(o.customer_email);
  update reservations r set customer_id = c.id from customers c
    where r.customer_id is null and r.customer_email is not null and c.email = lower(r.customer_email);
  update reservations r set customer_id = o.customer_id from orders o
    where r.order_id = o.id and r.customer_id is null and o.customer_id is not null;

  return v_inserted;
end;
$$;

-- ── 10. update_customer_contact: edición (admin y /cuenta) que propaga el snapshot ──
-- Reescribe los snapshots vinculados Y adopta los huérfanos que la join por email ya atribuía a
-- esta ficha (email viejo o nuevo) vía customer_sync_snapshots, para que FK y join nunca
-- discrepen; luego retro por el historial del email nuevo (idempotente). Un titular de cuenta
-- no cambia su email aquí (es su acceso). Una ficha con puntos no puede quedarse sin email:
-- sus pedidos pagados perderían el email por el que mark_refunded/reschedule_* revocan (espejo
-- de customer_assign_needs_email). 23505 (customers_email_key) → 'email_taken' en la app;
-- 23514 → mensajes del parser.
create function update_customer_contact(p_customer uuid, p_name text, p_email text, p_phone text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  c       customers%rowtype;
  v_name  text := nullif(left(trim(p_name), 80), '');
  v_email text := nullif(lower(trim(p_email)), '');
  v_phone text := nullif(trim(p_phone), '');
begin
  select * into c from customers where id = p_customer for update;
  if c.id is null then raise exception 'customer_not_found'; end if;
  if v_email is not null
     and (v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 120) then
    raise exception 'customer_email_invalid';
  end if;
  if c.auth_user_id is not null and v_email is distinct from c.email then
    raise exception 'customer_has_account';
  end if;
  if v_email is null and c.email is not null
     and exists (select 1 from points_ledger where customer_id = c.id) then
    raise exception 'customer_email_in_use';
  end if;

  update customers
     set name = v_name, email = v_email, phone = v_phone, updated_at = now()
   where id = p_customer;

  -- INVARIANTE: snapshot desde la ficha en vinculados + huérfanos del email viejo/nuevo.
  perform customer_sync_snapshots(p_customer, c.email);

  if v_email is not null then perform award_retro_points(p_customer); end if;
end;
$$;
