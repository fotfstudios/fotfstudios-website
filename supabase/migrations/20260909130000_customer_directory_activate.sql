-- Directorio de clientes (PR3, activación). Ver docs/superpowers/specs/2026-09-09-directorio-clientes-design.md.
--
-- PR1 dejó el esquema y las funciones DEFINIDAS pero sin ejecutar; PR2 cortó la suposición
-- customers.id = auth.users.id en el código. Acá se ACTIVA el vínculo: se corre el backfill
-- histórico, se otorgan los puntos retroactivos y create_checkout / create_reschedule_charge
-- pasan a escribir customer_id (misma firma; create or replace, nunca drop → expand/contract).
--
-- INVARIANTE (spec §"Invariante central"): quien escribe customer_id reescribe también
-- customer_name/customer_email/customer_phone DESDE la ficha, así el FK y la join por email
-- (c.email = lower(o.customer_email), que usan las ocho funciones de puntos) nunca discrepan.
--
-- Regex: UNA barra invertida (standard_conforming_strings = on).

-- ── 1. PRECONDICIÓN: customer_sync_snapshots deja de ser destructivo ──
-- El email de la ficha SIGUE mandando (las funciones de puntos resuelven por ahí y un snapshot
-- con el email viejo haría que mark_refunded / reschedule_* revoquen a nadie — o al cliente
-- equivocado si otra ficha tomara esa dirección). Nombre y teléfono, en cambio, se COALESCEAN
-- contra lo que ya tenía el pedido/reserva: la ficha suele ser la fuente MÁS POBRE (en prod las
-- tres fichas tienen name y phone en NULL mientras 13 reservas llevan nombre y 5 llevan
-- teléfono), y copiar esos NULL encima borraba el contacto de reservas pagadas y confirmadas.
-- Tiene que ir ANTES del backfill y antes de que cualquier escritor nuevo llame al helper.
create or replace function customer_sync_snapshots(p_customer uuid, p_old_email text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  c customers%rowtype;
begin
  select * into c from customers where id = p_customer;
  if c.id is null then raise exception 'customer_not_found'; end if;

  update orders o
     set customer_id    = c.id,
         customer_name  = coalesce(c.name,  o.customer_name),
         customer_email = c.email,
         customer_phone = coalesce(c.phone, o.customer_phone)
   where o.customer_id = c.id
      or (o.customer_id is null and o.customer_email is not null
          and lower(o.customer_email) in (lower(p_old_email), c.email));

  update reservations r
     set customer_id    = c.id,
         customer_name  = coalesce(c.name,  r.customer_name),
         customer_email = c.email,
         customer_phone = coalesce(c.phone, r.customer_phone)
   where r.customer_id = c.id
      or (r.customer_id is null and r.customer_email is not null
          and lower(r.customer_email) in (lower(p_old_email), c.email));
end;
$$;

-- ── 2. Backfill del directorio (una vez; la función ya es idempotente y re-ejecutable) ──
-- Una ficha por lower(customer_email) distinto que pase la puerta de forma; nombre y teléfono
-- se eligen por independiente (pagadas/cumplidas/reembolsadas/confirmadas primero, luego la más
-- reciente) y las fichas existentes SOLO reciben los NULL rellenados. Vincula pedidos, reservas
-- y reservas a través de su pedido. Medido en prod el 2026-09-10: crea 7 fichas (directorio
-- 3 → 10) y no deja ningún pedido sin vincular.
-- OJO: el vínculo escribe customer_id pero NO reescribe customer_email en el snapshot — un
-- pedido guardado como 'P4@Prod.CL' conserva esa mayúscula/minúscula aunque su ficha ya sea
-- 'p4@prod.cl'; es inocuo porque las ocho funciones de puntos siempre comparan
-- lower(o.customer_email) = c.email, nunca el valor crudo del snapshot.

-- ── 3. Retro de puntos para toda ficha con email ──
-- Idempotente por points_ledger_once (order_id, kind, ref): una segunda corrida no otorga nada.
-- Así /admin/clientes muestra saldos reales en vez de "0 pts" hasta el signup, y el seed local
-- y prod quedan simétricos (refinamiento flagged #2 de la spec).
-- OJO: award_retro_points recorre TODOS los pedidos del email, incluidos los pedidos delta de
-- reagendamiento, y con reagendamientos previos podría otorgar de más. Eso es un defecto
-- PREEXISTENTE con su propio PR; acá no se arregla y no puede dispararse: prod tiene 0
-- reagendamientos y 0 filas en points_ledger al momento de esta migración.

-- 2 y 3 comparten un solo bloque para CAPTURAR lo que hicieron: por separado, el `select`
-- descartaba el int de backfill_customers_from_bookings() y el loop descartaba cada `perform`
-- de award_retro_points, así que el log del deploy solo mostraría "Applying migration
-- 20260909130000_..." — ninguna huella de una escritura irreversible sobre prod (sin down
-- migration) cuyas cifras exactas dependen del momento en que corra. `raise notice` las deja en
-- el log sin cambiar ningún número: mismas funciones, mismo conjunto de iteración, mismo filtro.
do $$
declare v_new int; v_pts int := 0; r record;
begin
  select backfill_customers_from_bookings() into v_new;
  for r in select id from customers where email is not null loop
    v_pts := v_pts + award_retro_points(r.id);
  end loop;
  raise notice 'activación directorio: % fichas nuevas, % puntos retro otorgados', v_new, v_pts;
end $$;
