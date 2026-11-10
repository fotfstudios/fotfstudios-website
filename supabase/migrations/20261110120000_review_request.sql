-- Motor de pedido de reseñas en Google.
--
-- Pide UNA reseña por cliente, ~3 h después de su primera sesión completada (sala,
-- grabación —que es add-on de una `booking`— o prueba), en el mismo barrido de 5 min que
-- el PIN y los recordatorios (`/api/cron/access-codes`). El "una sola vez por cliente" vive
-- en `customers.review_requested_at`, así los disparos comparten un único candado.
-- Mismo patrón que `reminder_sent_at`: reclamar antes de mandar.
--
-- El CURSO no dispara por reserva: una sesión guiada (kind=curso) NO conserva identidad de
-- cliente —al enlazarse a course_sessions se le vacía customer_id y customer_email; el alumno
-- vive en course_enrollments—. Pero inscribirse exige el crédito de una prueba pagada
-- (create_course_enrollment lo valida), así que TODO alumno hizo una prueba y ya queda
-- cubierto por el disparo de 'prueba'. Pedir la reseña tras la ÚLTIMA sesión (en vez de tras
-- la prueba) sería otra cosa: iría por course_enrollments y queda como mejora aparte.

alter table customers add column review_requested_at timestamptz;

-- La ficha del cliente se resuelve por EMAIL (customers.email es único), no por
-- reservations.customer_id: una sesión guiada (curso) no conserva customer_id —el alumno
-- vive en course_enrollments—, pero toda reserva lleva customer_email denormalizado. Es la
-- misma identidad que ya usa el recordatorio de sesión.

-- Backfill: a quien YA tuvo una sesión completada antes de este deploy no se le pide
-- una reseña retroactiva (incómodo y de baja conversión; para eso queda el botón manual
-- del admin). Los clientes con solo sesiones futuras quedan elegibles para su momento.
update customers c
   set review_requested_at = now()
 where review_requested_at is null
   and exists (
     select 1 from reservations r
      where lower(r.customer_email) = lower(c.email)
        and r.status = 'confirmed'
        and r.kind in ('booking', 'prueba')
        and r.ends_at < now()
   );

-- Lo que barre el cron: confirmadas, con email de cliente, de sala o prueba, por fin de
-- sesión. El candado por-cliente se evalúa en la función (join a customers por email).
create index reservations_review_due_idx
  on reservations (ends_at)
  where status = 'confirmed' and customer_email is not null and kind in ('booking', 'prueba');

-- Candidatos a reseña: reservas de sala/prueba completadas hace ≥ p_after_hours y dentro de
-- los últimos p_window_days (si el cron estuvo caído, no resucita sesiones de hace semanas),
-- cuya ficha (por email) aún no fue invitada a reseñar.
create function reviews_due(p_after_hours int default 3, p_window_days int default 7)
returns table (reservation_id uuid, customer_id uuid, email text, name text, kind text)
language sql
stable
as $$
  select r.id, c.id, c.email, c.name, r.kind
    from reservations r
    join customers c on lower(c.email) = lower(r.customer_email)
   where r.status = 'confirmed'
     and c.review_requested_at is null
     and r.customer_email is not null
     and r.kind in ('booking', 'prueba')
     and r.ends_at <= now() - make_interval(hours => p_after_hours)
     and r.ends_at >  now() - make_interval(days  => p_window_days)
   order by r.ends_at;
$$;

grant execute on function reviews_due(int, int) to service_role;
