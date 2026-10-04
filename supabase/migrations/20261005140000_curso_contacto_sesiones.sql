-- Curso de DJ: la reserva de cada sesión guiada lleva el contacto del alumno.
--
-- Hasta acá una sesión (`reservations.kind = 'curso'`) no tenía nombre ni email: el
-- PIN de la puerta y el recordatorio de 24 h, que salen de esas columnas, nunca le
-- llegaban al alumno. El contacto se copia de la PRIMERA inscripción PAGADA del
-- programa (en dúo, quien compró). Sin inscripción pagada queda vacío, y eso es el
-- gate: un programa impago no genera PIN ni recordatorio.
--
-- Triggers y no cambios en los RPC: una sesión toma reserva por tres caminos
-- (agendar las 6, agendar una, re-agendar una cancelada) y el contacto cambia por
-- otros tantos (pago, reemplazante, anulación). Engancharlo en las tablas los
-- cubre a todos.

-- El contacto vigente de un programa: primera inscripción pagada, por cupo.
create function course_session_contact(p_generation uuid)
returns table (name text, email text, phone text)
language sql stable set search_path = public, pg_temp as $$
  select student_name, student_email, student_phone
    from course_enrollments
   where generation_id = p_generation and status = 'pagada'
   order by seat_no
   limit 1;
$$;

-- Copia el contacto a las reservas de las sesiones. Con `p_reservation`, solo a esa
-- (recién agendada); sin él, a todas las que aún no terminan (el pasado no se reescribe).
create function course_sync_session_contacts(p_generation uuid, p_reservation uuid default null)
returns void language plpgsql set search_path = public, pg_temp as $$
declare c record;
begin
  select * into c from course_session_contact(p_generation);
  update reservations r
     set customer_name = c.name, customer_email = c.email, customer_phone = c.phone
    from course_sessions cs
   where cs.generation_id = p_generation
     and r.id = cs.reservation_id
     and r.kind = 'curso'
     and (case when p_reservation is null then r.ends_at > now() else r.id = p_reservation end)
     and (r.customer_name, r.customer_email, r.customer_phone)
         is distinct from (c.name, c.email, c.phone);
end;
$$;

create function course_session_contact_on_session() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.reservation_id is not null then
    perform course_sync_session_contacts(new.generation_id, new.reservation_id);
  end if;
  return null;
end;
$$;

create trigger course_sessions_contact_aiu
  after insert or update of reservation_id on course_sessions
  for each row execute function course_session_contact_on_session();

create function course_session_contact_on_enrollment() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform course_sync_session_contacts(new.generation_id);
  return null;
end;
$$;

create trigger course_enrollments_contact_aiu
  after insert or update of status, student_name, student_email, student_phone on course_enrollments
  for each row execute function course_session_contact_on_enrollment();

-- Las sesiones ya agendadas reciben su contacto.
do $$
declare g uuid;
begin
  for g in select distinct generation_id from course_sessions loop
    perform course_sync_session_contacts(g);
  end loop;
end;
$$;
