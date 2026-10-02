-- Recordatorio de pago de reservas manuales pendientes.
--
-- Una reserva creada desde el admin como "Pendiente de pago" (hold firme, expires_at
-- NULL) se libera en el barrido diario de expire_abandoned_manual_holds_ids tras 72 h
-- sin pagar. El cliente recibía el aviso al crearla y el "se liberó tu hora", nada
-- entre medio. El barrido de pg_cron de 5 min (/api/cron/access-codes) le manda UN
-- recordatorio cuando quedan ~24 h: `payment_reminder_sent_at` es el reclamo
-- (UPDATE … IS NULL RETURNING), igual que reservations.reminder_sent_at; se suelta si
-- el correo falla. Vive en orders porque el reloj de 72 h y cancel_unpaid_order son
-- de la orden.

alter table orders add column payment_reminder_sent_at timestamptz;

create index orders_payment_reminder_due_idx
  on orders (created_at)
  where status = 'pending_payment' and payment_reminder_sent_at is null;

-- Pedidos que deben recibir el recordatorio. MISMO predicado que
-- expire_abandoned_manual_holds_ids (20260914170000): pending_payment, reserva held
-- con hold firme, y el mismo reloj greatest(creación, último link de pago). Si
-- cambia uno, cambia el otro: el correo promete la hora del barrido.
create function payment_reminders_due(p_after interval default '48 hours')
returns table (order_id uuid, clock_start timestamptz, customer_email text)
language sql stable set search_path = public, pg_temp as $$
  select o.id, c.clock_start, o.customer_email
    from orders o
    cross join lateral (
      select greatest(
               o.created_at,
               coalesce((select max(pi.created_at) from payment_intents pi where pi.order_id = o.id), o.created_at)
             ) as clock_start
    ) c
   where o.status = 'pending_payment'
     and o.payment_reminder_sent_at is null
     and c.clock_start < now() - p_after
     and exists (
       select 1 from reservations res
        where res.order_id = o.id and res.status = 'held' and res.expires_at is null
     )
   order by c.clock_start;
$$;

revoke execute on function payment_reminders_due(interval) from public, anon, authenticated;
grant execute on function payment_reminders_due(interval) to service_role;
