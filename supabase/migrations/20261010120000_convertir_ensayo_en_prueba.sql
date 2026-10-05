-- Un ensayo pagado que en realidad era la sesión de prueba del curso (se agendó como ensayo,
-- p. ej. desde /reservar). Lo deja exactamente como si se hubiera creado como prueba:
--   · pedido 'trial' y reserva 'prueba' (sin PIN: la prueba es guiada; recordatorio igual);
--   · los puntos que ganó se revocan (el curso no acumula — términos, Beatcoins);
--   · nace su crédito por lo pagado, que vence 7 días después de la sesión (lo mismo que
--     confirm_payment hace con una prueba), así el seguimiento y el aviso de vencimiento corren.
-- La boleta y el método de pago no cambian. Idempotente: una segunda llamada no hace nada.

create function convert_booking_to_trial(p_reservation uuid)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  r        reservations%rowtype;
  o        orders%rowtype;
  v_earned int;
  v_credit uuid;
begin
  select * into r from reservations where id = p_reservation for update;
  if r.id is null then raise exception 'reserva_no_encontrada'; end if;
  select * into o from orders where id = r.order_id for update;

  if r.kind = 'prueba' and o.kind = 'trial' then
    select id into v_credit from course_credits where source_reservation_id = r.id;
    return v_credit;
  end if;
  if r.kind <> 'booking' or o.id is null or o.kind <> 'booking' then raise exception 'prueba_solo_desde_ensayo'; end if;
  if r.status <> 'confirmed' or o.status not in ('paid', 'fulfilled') then raise exception 'prueba_solo_pagada'; end if;
  if r.ends_at - r.starts_at <> interval '1 hour' then raise exception 'prueba_dura_una_hora'; end if;
  if (select count(*) from reservations where order_id = o.id) <> 1 then raise exception 'prueba_pedido_con_varias_reservas'; end if;
  if o.customer_email is null then raise exception 'prueba_sin_email'; end if;

  update orders set kind = 'trial' where id = o.id;
  -- El PIN que se hubiera generado no se carga ni se envía: la prueba es guiada.
  update reservations set kind = 'prueba', access_code = null, access_loaded_at = null where id = r.id;

  select coalesce(sum(amount), 0) into v_earned
    from points_ledger where order_id = o.id and kind in ('earn', 'earn_revoke');
  if v_earned > 0 and o.customer_id is not null
     and apply_points(o.customer_id, o.id, 'earn_revoke', -v_earned, 'curso:prueba-sin-puntos') then
    perform log_booking_event(r.id, 'points_revoked', p_order => o.id, p_amount => v_earned);
  end if;

  insert into course_credits (email, amount_clp, source_reservation_id, expires_at, note)
    values (lower(o.customer_email), o.amount_clp, r.id, r.starts_at + interval '7 days',
            'Prueba ' || to_char(r.starts_at at time zone 'America/Santiago', 'DD-MM-YYYY'))
    on conflict (source_reservation_id) where source_reservation_id is not null do nothing
    returning id into v_credit;
  return v_credit;
end;
$$;

-- Corrección puntual: Paulina Pozo Mardones, prueba del jueves 08-10-2026 18:00 agendada como
-- ensayo. Id de producción: en local y staging no existe y el bloque no hace nada.
do $$
begin
  if exists (select 1 from reservations where id = '2cf7d7e2-a6da-4cca-a868-647fe3967521') then
    perform convert_booking_to_trial('2cf7d7e2-a6da-4cca-a868-647fe3967521');
  end if;
end $$;
