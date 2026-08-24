-- Curso de Iniciación DJ — generaciones, sesiones, solicitudes e inscripciones.
--
-- Hasta acá el curso era SOLO marketing: precios y cupos congelados en
-- app/curso-dj/_content.ts, y la venta entera por WhatsApp. Esta migración le da
-- al curso las tres cosas que le faltaban para existir en la plataforma:
--   1. CUPOS QUE CUENTAN      → course_enrollments, un asiento por fila.
--   2. HORAS QUE BLOQUEAN     → reservations.kind gana 'curso'.
--   3. PEDIDOS QUE FACTURAN   → orders.kind distingue la forma de cumplimiento.
--
-- Nada de esto se llama todavía: es solo el esquema (los RPC y la UI vienen después).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) reservations.kind gana 'curso'
-- ───────────────────────────────────────────────────────────────────────────
-- Por qué un kind NUEVO y no reutilizar 'block': deleteBlock() borra en DURO
-- acotando `.eq("kind","block")` (admin-repository.ts), y está expuesto en
-- /admin/bloqueos con un confirm genérico. Con 'block', el dueño podría borrar la
-- sesión 3 de una generación en curso en dos clics, sin rastro (un DELETE no deja
-- booking_event) y sin recuperación. Con 'curso' eso es imposible por construcción.
-- Además permite contar las horas del curso en OCUPACIÓN (la sala está ocupada)
-- manteniéndolas fuera de INGRESOS — distinción inexpresable con 'block'.
--
-- El EXCLUDE gist y reservations_active_idx NO se tocan: filtran por status, nunca
-- por kind. Esa es justamente la propiedad que heredamos gratis — una fila 'curso'
-- desaparece de /reservar y colisiona con cualquier reserva solapada, sin cambiar
-- una línea del motor de disponibilidad.
alter table reservations drop constraint reservations_kind_check;
alter table reservations add constraint reservations_kind_check
  check (kind in ('booking', 'block', 'curso'));

-- GUARDIA CRÍTICA: un bloque de curso JAMÁS cuelga de un pedido.
-- mark_refunded() hace `update reservations ... where order_id = p_order`, o sea
-- cancela TODA reserva que comparta el pedido. Si los bloques de sesión colgaran
-- del pedido de un alumno, reembolsar a UNO cancelaría los cuatro bloques de la
-- generación completa y reabriría esas horas en /reservar sin que nadie se entere.
alter table reservations add constraint reservations_curso_no_order
  check (kind <> 'curso' or order_id is null);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) orders.kind — la forma de cumplimiento, explícita en el esquema
-- ───────────────────────────────────────────────────────────────────────────
--   'booking' / 'trial' → el pedido es dueño de una RESERVA (hold → confirm).
--   'course'            → el pedido es dueño de CUPOS (course_enrollments).
--   'reschedule_delta'  → no es dueño de nada; lo finaliza apply_reschedule_charge.
--
-- confirm_payment() asume la primera forma para todas, y el desvío de las órdenes
-- de delta vive solo en la app (WebhookService). Con `kind` el hecho queda en el
-- esquema: el curso se desvía por la MISMA costura (un CourseFinalizer hermano del
-- RescheduleFinalizer), sin tocar confirm_payment.
alter table orders add column kind text not null default 'booking'
  check (kind in ('booking', 'trial', 'course', 'reschedule_delta'));

-- Backfill exacto: las órdenes de delta son las únicas históricas sin reserva propia.
update orders o set kind = 'reschedule_delta'
  from reschedules r where r.delta_order_id = o.id;

-- Los puntos NO compran el curso (ver /terminos). Guard de misma fila: barato y
-- verdadero aunque un caller futuro se salte el checkout del curso.
alter table orders add constraint orders_course_no_points
  check (kind <> 'course' or points_redeemed_clp = 0);

-- Bandeja del curso y conciliación por tipo. Parcial: 'booking' es el 99%.
create index orders_kind_created_idx on orders (kind, created_at desc) where kind <> 'booking';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Generaciones (cohortes) — también el price book del curso
-- ───────────────────────────────────────────────────────────────────────────
-- La generación congela SUS precios y SU cupo: subir precios para la G02 no toca
-- ninguna inscripción vendida en la G01. A propósito NO va en rate_tiers: ese price
-- book cotiza TIEMPO DE SALA por hora de un recurso, y un cupo de curso no es tiempo.
create table course_generations (
  id                   uuid primary key default gen_random_uuid(),
  resource_id          uuid not null references resources (id) on delete restrict,
  code                 text not null unique check (char_length(code) between 1 and 8),
  name                 text not null check (char_length(name) between 1 and 60),
  status               text not null default 'borrador'
                       check (status in ('borrador', 'abierta', 'en_curso', 'cerrada', 'cancelada')),
  seats                int2 not null default 6 check (seats between 1 and 12),
  -- CLP, IVA incluido. duo es POR PERSONA (se inscribe de a dos).
  price_duo_clp        int not null check (price_duo_clp >= 0),
  price_individual_clp int not null check (price_individual_clp >= 0),
  price_prueba_clp     int not null check (price_prueba_clp >= 0),
  currency             text not null default 'CLP',
  -- Copy de escasez de la landing (hoy CURSO.generacion / CURSO.deadline en _content.ts).
  pricing_label        text check (char_length(pricing_label) <= 80),
  enroll_deadline      date,
  starts_on            date,
  notes                text check (char_length(notes) <= 1000),
  created_at           timestamptz not null default now()
);

-- A lo más UNA generación abierta: el formulario público y la bandeja del admin
-- resuelven "la vigente" sin ambigüedad (mismo truco que price_books_one_active).
create unique index course_generations_one_open on course_generations ((true)) where (status = 'abierta');
create index course_generations_status_created_idx on course_generations (status, created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Sesiones — cada una apunta a su bloque de sala
-- ───────────────────────────────────────────────────────────────────────────
-- reservation_id es NULL mientras la generación está en borrador (sin horario).
-- on delete restrict: borrar una reserva con sesión enganchada debe fallar ruidoso.
create table course_sessions (
  id             uuid primary key default gen_random_uuid(),
  generation_id  uuid not null references course_generations (id) on delete cascade,
  n              int2 not null check (n between 1 and 12),
  title          text not null check (char_length(title) between 1 and 80),
  reservation_id uuid unique references reservations (id) on delete restrict,
  status         text not null default 'agendada'
                 check (status in ('agendada', 'dictada', 'cancelada')),
  created_at     timestamptz not null default now(),
  unique (generation_id, n)
);
create index course_sessions_generation_idx on course_sessions (generation_id, n);

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Solicitudes — la bandeja del formulario público
-- ───────────────────────────────────────────────────────────────────────────
-- MISMO patrón que dj_applications (/unete): texto libre sin validar, spameable y
-- podable, RLS sin policies, CHECK de largo espejando los caps de TS.
-- Separada de course_enrollments a propósito: una solicitud no es un asiento. El
-- formulario público NO consume cupo — eso saca la carrera de asientos del borde
-- público por completo. El puente es course_enrollments.lead_id.
create table course_leads (
  id            uuid primary key default gen_random_uuid(),
  generation_id uuid references course_generations (id) on delete set null,
  name          text not null check (char_length(name) between 1 and 80),
  email         text not null check (char_length(email) between 1 and 120),
  phone         text not null check (char_length(phone) between 1 and 40),
  plan          text not null check (plan in ('duo', 'individual', 'prueba', 'no_se')),
  experience    text not null check (experience in ('cero', 'controlador', 'club')),
  availability  text not null check (char_length(availability) between 1 and 200),
  message       text check (char_length(message) <= 1000),
  status        text not null default 'nueva'
                check (status in ('nueva', 'contactada', 'inscrita', 'descartada')),
  created_at    timestamptz not null default now()
);
create index course_leads_status_created_idx on course_leads (status, created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Inscripciones — el asiento es la FILA, no un contador
-- ───────────────────────────────────────────────────────────────────────────
-- Un dúo son DOS filas compartiendo order_id: cada alumno tiene su nombre, su email
-- y su asistencia, y "1 fila = 1 cupo" mantiene trivial la aritmética del cupo.
create table course_enrollments (
  id             uuid primary key default gen_random_uuid(),
  generation_id  uuid not null references course_generations (id) on delete restrict,
  lead_id        uuid references course_leads (id) on delete set null,
  order_id       uuid references orders (id) on delete set null,   -- null en cortesía/beca
  seat_no        int2 not null check (seat_no >= 1),
  plan           text not null check (plan in ('duo', 'individual')),
  student_name   text not null check (char_length(student_name) between 1 and 80),
  student_email  text not null check (char_length(student_email) between 1 and 120),
  student_phone  text check (char_length(student_phone) <= 40),
  status         text not null default 'reservada'
                 check (status in ('reservada', 'pagada', 'anulada', 'expirada', 'trasladada')),
  price_clp      int not null check (price_clp >= 0),   -- snapshot: lo que costó ESTE asiento
  expires_at     timestamptz,                            -- solo 'reservada'; NULL = hold firme
  paid_at        timestamptz,
  cancelled_at   timestamptz,
  transferred_to uuid references course_enrollments (id) on delete set null,
  notes          text check (char_length(notes) <= 500),
  created_at     timestamptz not null default now()
);

-- ANTI-SOBREVENTA ESTRUCTURAL — el análogo exacto de reservations_no_overlap:
-- dos inscripciones VIVAS jamás comparten asiento en la misma generación. Aunque un
-- caller futuro se salte el checkout, la DB lo rechaza (23505). Cero conteo en la app.
create unique index course_enrollments_seat_unique
  on course_enrollments (generation_id, seat_no)
  where (status in ('reservada', 'pagada'));

create index course_enrollments_generation_idx on course_enrollments (generation_id, status, seat_no);
-- Sweep de holds de cupo vencidos (espeja reservations_hold_expiry_idx).
create index course_enrollments_hold_expiry_idx on course_enrollments (expires_at) where (status = 'reservada');
create index course_enrollments_order_idx on course_enrollments (order_id) where order_id is not null;

-- "El asiento 7 no existe en una generación de 6" es una regla CRUZADA que un CHECK
-- no puede expresar (no puede leer course_generations.seats) → trigger. Con el índice
-- único de arriba, la sobreventa queda imposible por las DOS vías: asiento duplicado
-- y asiento fuera de rango.
create function course_enrollment_seat_bound() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_seats int2;
begin
  if new.status not in ('reservada', 'pagada') then return new; end if;
  select seats into v_seats from course_generations where id = new.generation_id;
  if v_seats is null then raise exception 'course_generation_missing'; end if;
  if new.seat_no > v_seats then raise exception 'course_seat_out_of_range'; end if;
  return new;
end;
$$;
create trigger course_enrollment_seat_bound_biu
  before insert or update on course_enrollments for each row
  execute function course_enrollment_seat_bound();

-- ───────────────────────────────────────────────────────────────────────────
-- 7) booking_events aprende los eventos de sesión de curso
-- ───────────────────────────────────────────────────────────────────────────
-- booking_event_category() devuelve NULL para un tipo desconocido y log_booking_event()
-- levanta excepción — los DOS tienen que cambiar juntos o el RPC de agendar/mover
-- sesión aborta dentro de su propia transacción.
alter table booking_events drop constraint booking_events_type_check;
alter table booking_events add constraint booking_events_type_check
  check (type in (
    'created', 'payment_confirmed', 'courtesy_confirmed', 'access_sent',
    'reschedule_moved', 'reschedule_charge_pending', 'reschedule_charge_paid',
    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
    'boleta_issued', 'boleta_emitted', 'nota_credito_issued', 'nota_credito_emitted',
    'points_earned', 'points_revoked', 'cancelled', 'refunded',
    'curso_session_scheduled', 'curso_session_moved', 'curso_session_cancelled'));

create or replace function booking_event_category(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_type in ('created', 'courtesy_confirmed', 'reschedule_moved', 'cancelled',
                    'curso_session_scheduled', 'curso_session_moved',
                    'curso_session_cancelled') then 'Reservas'
    when p_type in ('payment_confirmed', 'reschedule_charge_pending', 'reschedule_charge_paid',
                    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
                    'refunded') then 'Pagos'
    when p_type in ('points_earned', 'points_revoked') then 'Puntos'
    when p_type in ('boleta_issued', 'boleta_emitted', 'nota_credito_issued',
                    'nota_credito_emitted') then 'Documentos tributarios'
    when p_type = 'access_sent' then 'Notificaciones'
  end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) RLS + grants + RBAC
-- ───────────────────────────────────────────────────────────────────────────
alter table course_generations enable row level security;   -- sin policies: solo service-role
alter table course_sessions    enable row level security;
alter table course_leads       enable row level security;
alter table course_enrollments enable row level security;
grant all privileges on course_generations, course_sessions,
                        course_leads, course_enrollments to service_role;

-- Dos permisos, con el mismo corte que ya existe entre reservations.create y
-- reservations.boleta: gestionar el curso es un trabajo, declarar plata recibida es
-- otro. Así el dueño puede delegar la bandeja sin delegar el cobro. Paridad con
-- src/domain/auth/permissions.ts, verificada por rbac.itest.ts. super_admin los
-- hereda solo; el staff NO los recibe por defecto.
insert into admin_permissions (key, label) values
  ('course.manage',  'Gestionar curso'),
  ('course.billing', 'Cobrar curso')
on conflict (key) do nothing;
