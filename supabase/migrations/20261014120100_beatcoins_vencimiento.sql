-- Beatcoins que vencen (decisión del dueño, 2026-10-10).
--
-- Regla: los Beatcoins ganados DESDE la fecha de corte vencen 12 meses después de la
-- última reserva pagada (con dinero o con Beatcoins); cada reserva reinicia el reloj.
-- Los anteriores al corte NUNCA vencen: los términos prometen que los cambios al
-- programa "nunca afectan Beatcoins que ya hayas ganado".
--
-- Modelo (sin lotes):
--   · customers.points_protected = la parte del saldo que no vence.
--     - Antes del corte sigue al saldo completo (todo lo que se gana está protegido).
--     - Después, se gastan primero los que vencen: la parte protegida solo baja cuando
--       el saldo cae por debajo de ella.
--     - Lo que vuelve por un pedido anterior al corte (reembolso/liberación de un canje,
--       traspaso de reserva) vuelve protegido.
--   · customers.points_activity_at = la última reserva pagada (earn / redeem).
--   · vence greatest(points_balance - points_protected, 0) en
--     greatest(points_activity_at, corte) + 12 meses.
--
-- El corte vive en beatcoins_settings (una fila) para poder moverlo con una migración
-- de una línea; los tests lo mueven al pasado. Debe coincidir con BEATCOINS_EXPIRY_FROM
-- (src/domain/points/expiry.ts) y con /terminos.

-- ── Configuración ───────────────────────────────────────────────────────────

create table beatcoins_settings (
  id            boolean primary key default true check (id),
  expiry_from   timestamptz not null,
  expiry_months int not null default 12 check (expiry_months > 0)
);
insert into beatcoins_settings (expiry_from) values ('2026-11-10 00:00:00-03');
alter table beatcoins_settings enable row level security;
grant all privileges on beatcoins_settings to service_role;

-- Fecha en que vence la parte que vence del saldo de un cliente.
create function beatcoins_expires_at(p_activity_at timestamptz) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select greatest(coalesce(p_activity_at, s.expiry_from), s.expiry_from)
         + make_interval(months => s.expiry_months)
    from beatcoins_settings s;
$$;

-- ── Columnas ────────────────────────────────────────────────────────────────

alter table customers
  add column points_protected int not null default 0
    constraint customers_points_protected_nonneg check (points_protected >= 0),
  add column points_activity_at timestamptz,
  -- avisos de vencimiento (claim → envío → release si falla), se limpian al reiniciar el reloj
  add column points_expiry_notice_30_at timestamptz,
  add column points_expiry_notice_7_at timestamptz,
  -- último vencimiento y su aviso
  add column points_last_expired_at timestamptz,
  add column points_last_expired_amount int,
  add column points_expired_notice_at timestamptz,
  -- campaña: anuncio del cambio y resumen mensual
  add column points_launch_queued_at timestamptz,
  add column points_launch_sent_at timestamptz,
  add column points_digest_sent_at timestamptz,
  add column email_digest_opt_out_at timestamptz,
  add column email_unsubscribe_token text not null default encode(extensions.gen_random_bytes(24), 'hex')
    constraint customers_unsubscribe_token_valid check (email_unsubscribe_token ~ '^[0-9a-f]{48}$');
create unique index customers_unsubscribe_token_key on customers (email_unsubscribe_token);

-- Hoy todo el saldo es anterior al corte: queda protegido.
update customers c set
  points_protected = greatest(c.points_balance, 0),
  points_activity_at = (
    select max(l.created_at) from points_ledger l
     where l.customer_id = c.id and l.kind in ('earn', 'redeem')
  );

create index customers_points_expirable_idx on customers (points_activity_at)
  where points_balance > points_protected;

-- ── Ledger ──────────────────────────────────────────────────────────────────

alter table points_ledger drop constraint points_ledger_sign;
alter table points_ledger add constraint points_ledger_sign check (
     (kind in ('earn', 'redeem_release', 'redeem_restore') and amount > 0)
  or (kind in ('earn_revoke', 'redeem', 'expire') and amount < 0)
  or (kind = 'adjust' and amount <> 0)
);
-- Un vencimiento por cliente y día (points_ledger_once solo cubre movimientos con pedido).
create unique index points_ledger_expire_once on points_ledger (customer_id, ref) where kind = 'expire';

-- ── Escritor único, ahora con la parte protegida y el reloj ─────────────────

create or replace function apply_points(
  p_customer uuid, p_order uuid, p_kind points_entry_kind, p_amount int, p_ref text default ''
) returns boolean language plpgsql
set search_path = public, pg_temp as $$
declare
  v_from     timestamptz := (select expiry_from from beatcoins_settings);
  v_order_at timestamptz;
  v_renews   boolean := p_kind in ('earn', 'redeem');
begin
  insert into points_ledger (customer_id, order_id, kind, amount, ref)
    values (p_customer, p_order, p_kind, p_amount, p_ref)
    on conflict do nothing;
  if not found then return false; end if;
  if p_order is not null then
    select created_at into v_order_at from orders where id = p_order;
  end if;
  update customers c set
    points_balance = c.points_balance + p_amount,
    points_protected = case
      -- antes del corte nada vence: todo el saldo queda protegido
      when now() < v_from then greatest(c.points_balance + p_amount, 0)
      -- lo que vuelve de un pedido anterior al corte vuelve protegido
      when p_amount > 0 and v_order_at < v_from
           and (p_kind in ('redeem_restore', 'redeem_release') or p_ref like 'reassign:%')
        then least(c.points_protected + p_amount, greatest(c.points_balance + p_amount, 0))
      -- se gastan primero los que vencen
      else least(c.points_protected, greatest(c.points_balance + p_amount, 0))
    end,
    points_activity_at = case when v_renews then now() else c.points_activity_at end,
    points_expiry_notice_30_at = case when v_renews then null else c.points_expiry_notice_30_at end,
    points_expiry_notice_7_at  = case when v_renews then null else c.points_expiry_notice_7_at end,
    updated_at = now()
  where c.id = p_customer;
  return true;
end;
$$;

-- ── Vencimiento ─────────────────────────────────────────────────────────────

-- Vence la parte no protegida de los clientes cuyo plazo ya pasó. Idempotente: tras
-- vencer, el saldo es igual a la parte protegida y el cliente sale del candidato; el
-- índice points_ledger_expire_once frena dos corridas el mismo día.
create function expire_beatcoins(p_now timestamptz default now())
returns table (customer_id uuid, expired int)
language plpgsql set search_path = public, pg_temp as $$
declare
  s beatcoins_settings;
  r record;
  v_amount int;
begin
  select * into s from beatcoins_settings;
  if p_now < s.expiry_from then return; end if;
  for r in
    select c.id from customers c
     where c.points_balance > c.points_protected
       and beatcoins_expires_at(c.points_activity_at) <= p_now
     order by c.id
     for update skip locked
  loop
    select c.points_balance - c.points_protected into v_amount from customers c where c.id = r.id;
    if v_amount > 0
       and apply_points(r.id, null, 'expire', -v_amount, 'expire:' || to_char(p_now at time zone 'UTC', 'YYYY-MM-DD')) then
      update customers c set points_last_expired_at = p_now, points_last_expired_amount = v_amount,
                             points_expired_notice_at = null
       where c.id = r.id;
      customer_id := r.id;
      expired := v_amount;
      return next;
    end if;
  end loop;
end;
$$;

-- Candidatos al aviso de 30 o 7 días: saldo que vence > 0, correo, plazo dentro de la
-- ventana y aviso de esa ventana sin enviar. El de 30 días no sale si ya quedan ≤ 7
-- (para ese va el de 7).
create function beatcoins_expiry_due(p_days int, p_now timestamptz default now())
returns table (customer_id uuid, email text, name text, expirable int, protected int, expires_at timestamptz)
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_days not in (7, 30) then raise exception 'beatcoins_bad_window'; end if;
  return query
    select c.id, c.email, c.name, c.points_balance - c.points_protected, c.points_protected,
           beatcoins_expires_at(c.points_activity_at)
      from customers c
     where c.points_balance > c.points_protected
       and coalesce(c.email, '') <> ''
       and beatcoins_expires_at(c.points_activity_at) > p_now
       and case when p_days = 30
             then beatcoins_expires_at(c.points_activity_at) > p_now + interval '7 days'
                  and beatcoins_expires_at(c.points_activity_at) <= p_now + interval '30 days'
                  and c.points_expiry_notice_30_at is null
             else beatcoins_expires_at(c.points_activity_at) <= p_now + interval '7 days'
                  and c.points_expiry_notice_7_at is null
           end
     order by 6;
end;
$$;

revoke all on function beatcoins_expires_at(timestamptz) from public, anon, authenticated;
revoke all on function expire_beatcoins(timestamptz) from public, anon, authenticated;
revoke all on function beatcoins_expiry_due(int, timestamptz) from public, anon, authenticated;
revoke all on function apply_points(uuid, uuid, points_entry_kind, int, text) from public, anon, authenticated;
