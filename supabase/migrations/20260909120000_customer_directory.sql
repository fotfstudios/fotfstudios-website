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
