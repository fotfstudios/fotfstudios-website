-- Recordatorio de pago de reservas manuales pendientes.
--
-- Una reserva creada desde el admin como "Pendiente de pago" (hold firme, expires_at
-- NULL) se libera en el barrido diario de expire_abandoned_manual_holds_ids tras 72 h
-- sin pagar. El cliente recibía el aviso al crearla y el "se liberó tu hora", nada
-- entre medio. El barrido de pg_cron de 5 min (/api/cron/access-codes) le manda UN
-- recordatorio cuando quedan ≤ 24 h para pagar (antes del barrido o del inicio de la
-- sesión, lo que llegue primero): `payment_reminder_sent_at` es el reclamo
-- (UPDATE … IS NULL RETURNING), igual que reservations.reminder_sent_at; se suelta si
-- el correo falla. Vive en orders porque el reloj de 72 h y cancel_unpaid_order son
-- de la orden.

alter table orders add column payment_reminder_sent_at timestamptz;

create index orders_payment_reminder_due_idx
  on orders (created_at)
  where status = 'pending_payment' and payment_reminder_sent_at is null;

-- Candidatos al recordatorio. Mismo universo que expire_abandoned_manual_holds_ids
-- (20260914170000): pending_payment, reserva held con hold firme, y el mismo reloj
-- greatest(creación, último link de pago). El plazo de pago es lo primero entre el
-- barrido que libera las 72 h y el INICIO de la sesión; el cálculo exacto ("quedan
-- ≤ 24 h") vive en TS (manualHoldDeadline, testeado). Acá solo un pre-filtro necesario:
--   - reloj de ≥ p_min_age (no pisar el aviso de creación recién mandado);
--   - la sesión no empezó (pasado el inicio ya no hay a qué recordar);
--   - empieza dentro de 24 h, o el reloj tiene ≥ 48 h (barrido ≥ reloj + 72 h).
create function payment_reminders_due(p_min_age interval default '12 hours')
returns table (order_id uuid, clock_start timestamptz, starts_at timestamptz, customer_email text)
language sql stable set search_path = public, pg_temp as $$
  select o.id, c.clock_start, res.starts_at, o.customer_email
    from orders o
    join reservations res
      on res.order_id = o.id and res.status = 'held' and res.expires_at is null
    cross join lateral (
      select greatest(
               o.created_at,
               coalesce((select max(pi.created_at) from payment_intents pi where pi.order_id = o.id), o.created_at)
             ) as clock_start
    ) c
   where o.status = 'pending_payment'
     and o.payment_reminder_sent_at is null
     and c.clock_start < now() - p_min_age
     and res.starts_at > now()
     and (res.starts_at < now() + interval '24 hours' or c.clock_start < now() - interval '48 hours')
   order by c.clock_start;
$$;

revoke execute on function payment_reminders_due(interval) from public, anon, authenticated;
grant execute on function payment_reminders_due(interval) to service_role;
