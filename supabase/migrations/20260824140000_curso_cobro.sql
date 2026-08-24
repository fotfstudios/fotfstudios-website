-- Cobro del curso: inscripción → pedido → pago → boleta (SII).
--
-- El curso reutiliza la SALIDA de la cañería que ya existe (orders, order_lines,
-- tax_documents) pero necesita su propia ENTRADA: create_checkout está soldado a
-- un rango horario de la sala, y un cupo de curso no es tiempo, es un asiento.
--
-- IMPORTANTE: confirm_payment NO se toca. Un pedido sin reserva cae en su rama
-- 'paid_no_hold' —suprime el email al cliente y no emite boleta—, exactamente el
-- problema que el repo ya resolvió para el cobro diferido de reagendamiento:
-- desviando ANTES, no reescribiendo la función. Acá va la RPC hermana.

-- Cómo se pagó el cupo. Llega con el cobro, no con el esquema base: hasta ahora
-- una inscripción no tenía forma de pagarse.
alter table course_enrollments add column paid_method text
  check (paid_method in ('mercadopago', 'efectivo', 'transferencia'));

-- ── Inscribir: asientos + pedido, atómico ──────────────────────────────────
-- Un dúo son DOS filas de inscripción compartiendo un pedido. Si el segundo
-- asiento no cabe, se revierte todo: media pareja inscrita no es un estado válido.
create function create_course_enrollment(
  p_generation    uuid,
  p_plan          text,
  p_students      jsonb,   -- [{name,email,phone}] · 1 (individual) o 2 (dúo)
  p_amount        int,
  p_net           int,
  p_tax           int,
  p_lead          uuid default null,
  p_terms_version text default null,
  p_terms_source  text default null,
  p_notes         text default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_gen course_generations;
  v_order uuid; v_enr uuid; v_seat int; v_price int; v_student jsonb;
  v_first_name text; v_first_email text; v_first_phone text; v_n int := 0;
begin
  if p_plan not in ('duo', 'individual') then raise exception 'curso_bad_plan'; end if;
  if jsonb_array_length(p_students) < 1 then raise exception 'curso_sin_alumnos'; end if;
  if p_plan = 'duo' and jsonb_array_length(p_students) <> 2 then raise exception 'curso_duo_necesita_dos'; end if;
  if p_plan = 'individual' and jsonb_array_length(p_students) <> 1 then raise exception 'curso_individual_es_uno'; end if;

  -- Barrido inline: la correctitud no depende de la frecuencia de un cron.
  update course_enrollments set status = 'expirada'
    where generation_id = p_generation and status = 'reservada' and expires_at < now();

  -- FOR UPDATE serializa "buscar cupo libre y tomarlo" entre inscripciones
  -- concurrentes. El índice único parcial y el trigger de rango son el backstop.
  select * into v_gen from course_generations where id = p_generation for update;
  if v_gen.id is null then raise exception 'curso_generation_missing'; end if;
  if v_gen.status not in ('abierta', 'en_curso') then raise exception 'curso_generation_closed'; end if;

  v_price := case when p_plan = 'duo' then v_gen.price_duo_clp else v_gen.price_individual_clp end;

  -- El pagador es el primer alumno (el dúo lo paga quien inscribe).
  v_first_name  := p_students -> 0 ->> 'name';
  v_first_email := lower(p_students -> 0 ->> 'email');
  v_first_phone := p_students -> 0 ->> 'phone';

  insert into orders (kind, status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone,
                      terms_accepted_at, terms_version, terms_source)
    values ('course', 'pending_payment', v_gen.currency, p_amount, p_net, p_tax,
            v_first_name, v_first_email, v_first_phone,
            case when p_terms_source is not null then now() end,
            case when p_terms_source is not null then p_terms_version end,
            p_terms_source)
    returning id into v_order;

  for v_student in select jsonb_array_elements(p_students) loop
    -- Menor asiento libre en 1..seats. Correcto porque tenemos el lock.
    select coalesce(min(s.n), 0) into v_seat
      from generate_series(1, v_gen.seats) s(n)
      where not exists (
        select 1 from course_enrollments e
         where e.generation_id = p_generation and e.seat_no = s.n
           and e.status in ('reservada', 'pagada'));
    if v_seat = 0 then raise exception 'curso_sin_cupos'; end if;

    insert into course_enrollments (generation_id, lead_id, order_id, seat_no, plan,
        student_name, student_email, student_phone, status, price_clp, expires_at, notes)
      values (p_generation, p_lead, v_order, v_seat::int2, p_plan,
              v_student ->> 'name', lower(v_student ->> 'email'), v_student ->> 'phone',
              'reservada', v_price, null, p_notes)   -- hold FIRME: el dueño cobra cuando puede
      returning id into v_enr;
    v_n := v_n + 1;
  end loop;

  -- Una línea por asiento: la boleta y el pedido cuadran solos, y un dúo se lee
  -- como lo que es (dos cupos), no como un monto doble sin explicación.
  insert into order_lines (order_id, line_type, description, quantity, unit_price_clp, subtotal_clp)
    values (v_order, 'flat_service',
            format('Curso de Iniciación DJ · %s · %s', v_gen.code,
                   case when p_plan = 'duo' then 'en dúo' else 'individual' end),
            v_n, v_price, v_price * v_n);

  if p_lead is not null then
    update course_leads set status = 'inscrita' where id = p_lead and status <> 'descartada';
  end if;

  return v_order;
end;
$$;

-- ── Confirmar el pago ──────────────────────────────────────────────────────
-- Devuelve 'confirmed' | 'noop'. Idempotente por construcción: el segundo pase
-- no encuentra inscripciones 'reservada' y la boleta está guardada por NOT EXISTS.
-- Sirve igual para el pago offline (efectivo/transferencia) y, más adelante, para
-- el webhook de Mercado Pago: los dos caminos convergen acá.
create function confirm_course_payment(
  p_order      uuid,
  p_payment_id text,
  p_method     text default null
) returns text language plpgsql set search_path = public, pg_temp as $$
declare v_kind text; v_seats int; v_amount int;
begin
  select kind, amount_clp into v_kind, v_amount from orders where id = p_order;
  if v_kind is null then raise exception 'curso_order_missing'; end if;
  if v_kind <> 'course' then raise exception 'curso_order_wrong_kind'; end if;

  update orders set status = 'paid', mp_payment_id = p_payment_id, paid_at = now()
    where id = p_order and status <> 'paid';

  update course_enrollments
     set status = 'pagada', paid_at = now(), expires_at = null,
         paid_method = coalesce(p_method, paid_method)
   where order_id = p_order and status = 'reservada';
  get diagnostics v_seats = row_count;

  if v_seats = 0 and not exists (
       select 1 from course_enrollments where order_id = p_order and status = 'pagada') then
    -- Ni quedaban cupos por confirmar ni hay ninguno pagado: la inscripción se
    -- anuló antes de que llegara el pago. No se emite boleta; lo revisa el dueño.
    return 'noop';
  end if;

  -- Boleta pendiente (SII), única por pedido. El NOT EXISTS la hace idempotente
  -- ante reprocesos, igual que en confirm_payment.
  insert into tax_documents (order_id, kind, neto, iva, total)
    select o.id, 'boleta', o.net_clp, o.tax_clp, o.amount_clp
      from orders o
     where o.id = p_order and o.amount_clp > 0
       and not exists (select 1 from tax_documents t where t.order_id = p_order and t.kind = 'boleta');

  -- Llegar acá significa que hay cupos vivos para este pedido, sea porque los
  -- acabamos de confirmar o porque un reproceso los encontró ya pagados.
  return 'confirmed';
end;
$$;

-- ── Anular una inscripción impaga ──────────────────────────────────────────
-- Libera los cupos y cancela el pedido. Una inscripción PAGADA no se anula por
-- acá: eso es un reembolso y va por el camino del dinero (fuera de alcance acá).
create function cancel_course_order(p_order uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from course_enrollments where order_id = p_order and status = 'pagada') then
    raise exception 'curso_enrollment_paid';
  end if;
  update course_enrollments set status = 'anulada', cancelled_at = now()
    where order_id = p_order and status = 'reservada';
  update orders set status = 'cancelled' where id = p_order and status = 'pending_payment';
end;
$$;

-- ── Barrido de inscripciones abandonadas ──────────────────────────────────
-- Espeja expire_abandoned_manual_holds: un pedido de curso pendiente hace 72 h
-- no puede seguir reteniendo un cupo. Se cuelga del cron de reconciliación.
create function expire_abandoned_course_holds(p_older_than interval default '72 hours')
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_count int := 0; r record;
begin
  for r in
    select o.id from orders o
     where o.kind = 'course' and o.status = 'pending_payment'
       and o.created_at < now() - p_older_than
  loop
    perform cancel_course_order(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
