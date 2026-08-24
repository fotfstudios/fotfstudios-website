-- Crédito de la sesión de prueba contra el curso.
--
-- /terminos: "El valor de la sesión de prueba ($19.990) se descuenta del precio
-- del curso si te inscribes dentro de los 7 días siguientes a la sesión de prueba."
--
-- Se modela como un TOKEN de un solo uso, no como una edición de la orden de la
-- prueba: esa venta es real, tiene su boleta y su pricing_snapshot es INMUTABLE.
-- El crédito baja el efectivo de la orden DEL CURSO con una línea 'discount',
-- exactamente como el canje de puntos — así order_lines sigue sumando amount_clp
-- y la boleta cubre exactamente lo que se cobró.
--
-- La ventana corre desde la SESIÓN, no desde el pago: así lo dicen los términos.
--
-- No se toca create_checkout: la prueba se vende por WhatsApp y se entrega como
-- reserva manual del admin (la motion que ya existe), y el crédito lo emite el
-- dueño al registrarla. Meterle un `kind` al checkout de la sala sería cirugía
-- sobre el camino del dinero del negocio vigente para ganar muy poco.
create table course_credits (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,                    -- minúsculas, como customers
  amount_clp        int not null check (amount_clp > 0),
  /** Reserva de la sesión de prueba, si se registró desde una. */
  source_reservation_id uuid references reservations (id) on delete set null,
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  consumed_order_id uuid references orders (id) on delete set null,
  consumed_at       timestamptz,
  note              text check (char_length(note) <= 200),
  -- consumed_order_id y consumed_at viajan juntos o no viajan.
  constraint course_credits_consumed_pair
    check ((consumed_order_id is null) = (consumed_at is null))
);

-- Una sesión de prueba emite UN crédito: hace idempotente el registro del dueño.
create unique index course_credits_one_per_reservation
  on course_credits (source_reservation_id)
  where source_reservation_id is not null;

-- Búsqueda del crédito aplicable por email al inscribir.
create index course_credits_email_idx on course_credits (email, expires_at desc)
  where consumed_order_id is null;

alter table course_credits enable row level security;   -- sin policies: solo service-role
grant all privileges on course_credits to service_role;

-- ── create_course_enrollment gana el crédito ───────────────────────────────
-- PostgREST no desambigua overloads → drop + create con la firma nueva.
drop function create_course_enrollment(uuid, text, jsonb, int, int, int, uuid, text, text, text);

create function create_course_enrollment(
  p_generation    uuid,
  p_plan          text,
  p_students      jsonb,
  p_amount        int,
  p_net           int,
  p_tax           int,
  p_lead          uuid default null,
  p_terms_version text default null,
  p_terms_source  text default null,
  p_notes         text default null,
  p_credit        uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_gen course_generations;
  v_order uuid; v_seat int; v_price int; v_student jsonb;
  v_first_name text; v_first_email text; v_first_phone text; v_n int := 0;
  v_credit_amount int;
begin
  if p_plan not in ('duo', 'individual') then raise exception 'curso_bad_plan'; end if;
  if jsonb_array_length(p_students) < 1 then raise exception 'curso_sin_alumnos'; end if;
  if p_plan = 'duo' and jsonb_array_length(p_students) <> 2 then raise exception 'curso_duo_necesita_dos'; end if;
  if p_plan = 'individual' and jsonb_array_length(p_students) <> 1 then raise exception 'curso_individual_es_uno'; end if;

  update course_enrollments set status = 'expirada'
    where generation_id = p_generation and status = 'reservada' and expires_at < now();

  select * into v_gen from course_generations where id = p_generation for update;
  if v_gen.id is null then raise exception 'curso_generation_missing'; end if;
  if v_gen.status not in ('abierta', 'en_curso') then raise exception 'curso_generation_closed'; end if;

  v_price := case when p_plan = 'duo' then v_gen.price_duo_clp else v_gen.price_individual_clp end;

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

  -- El crédito se CONSUME con un update condicional: una sola sentencia, así que
  -- dos inscripciones concurrentes no pueden gastarlo dos veces (la perdedora
  -- afecta 0 filas y aborta la transacción entera).
  if p_credit is not null then
    update course_credits
       set consumed_order_id = v_order, consumed_at = now()
     where id = p_credit and consumed_order_id is null and expires_at > now()
     returning amount_clp into v_credit_amount;
    if v_credit_amount is null then raise exception 'curso_credito_no_disponible'; end if;
  end if;

  for v_student in select jsonb_array_elements(p_students) loop
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
              'reservada', v_price, null, p_notes);
    v_n := v_n + 1;
  end loop;

  insert into order_lines (order_id, line_type, description, quantity, unit_price_clp, subtotal_clp)
    values (v_order, 'flat_service',
            format('Curso de Iniciación DJ · %s · %s', v_gen.code,
                   case when p_plan = 'duo' then 'en dúo' else 'individual' end),
            v_n, v_price, v_price * v_n);

  -- Línea de descuento, igual que el canje de puntos: order_lines sigue sumando
  -- amount_clp y la boleta cubre exactamente el efectivo cobrado.
  if v_credit_amount is not null then
    insert into order_lines (order_id, line_type, description, quantity, unit_price_clp, subtotal_clp)
      values (v_order, 'discount', 'Crédito sesión de prueba', 1, -v_credit_amount, -v_credit_amount);
  end if;

  if p_lead is not null then
    update course_leads set status = 'inscrita' where id = p_lead and status <> 'descartada';
  end if;

  return v_order;
end;
$$;

-- ── Devolver el crédito si la inscripción se anula sin pagar ───────────────
create or replace function cancel_course_order(p_order uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from course_enrollments where order_id = p_order and status = 'pagada') then
    raise exception 'curso_enrollment_paid';
  end if;
  update course_enrollments set status = 'anulada', cancelled_at = now()
    where order_id = p_order and status = 'reservada';
  update orders set status = 'cancelled' where id = p_order and status = 'pending_payment';
  -- El crédito vuelve a estar disponible solo si NO venció mientras tanto.
  update course_credits set consumed_order_id = null, consumed_at = null
    where consumed_order_id = p_order and expires_at > now();
end;
$$;
