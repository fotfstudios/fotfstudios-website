-- Fijar a mano hasta cuándo vale el crédito de una sesión de prueba.
--
-- `extend_course_credit` (20261007130000) APILA 7 días sobre el vencimiento: para llegar
-- a un día lejano hay que apretarlo varias veces, cada una suelta otro aviso, y un solo
-- llamado tope en 60 días. Cuando el alumno se inscribe más allá de la ventana —p. ej.
-- hizo la prueba en noviembre y entra en diciembre— el dueño quiere RETENER el crédito
-- hasta una fecha concreta, no sumar semanas a ciegas.
--
-- set_course_credit_expiry fija expires_at al instante dado (fin del día elegido, que la
-- app calcula en America/Santiago), con las mismas guardas que extender:
--   · solo un crédito vivo —ni usado ni anulado— se toca (si no, 'curso_credito_no_extensible');
--   · la fecha debe ser futura y dentro de un año (guarda anti-dedazo: 'curso_credito_fecha_invalida');
--   · suelta el aviso de vencimiento (expiry_reminder_sent_at = null) para que se re-avise
--     2 días antes de la nueva fecha, y cuenta la intervención en extended_count.
-- No reemplaza a extend_course_credit: el botón "+7 días" sigue existiendo para el caso simple.

create function set_course_credit_expiry(p_credit uuid, p_expires timestamptz)
returns timestamptz language plpgsql set search_path = public, pg_temp as $$
declare v_expires timestamptz;
begin
  if p_expires <= now() or p_expires > now() + interval '365 days' then
    raise exception 'curso_credito_fecha_invalida';
  end if;
  update course_credits
     set expires_at = p_expires,
         extended_count = extended_count + 1,
         expiry_reminder_sent_at = null
   where id = p_credit and consumed_order_id is null and voided_at is null
  returning expires_at into v_expires;
  if v_expires is null then raise exception 'curso_credito_no_extensible'; end if;
  return v_expires;
end;
$$;
