-- Modelo de reversión de documentos tributarios (arregla D4 del audit de esquema).
--
-- Hasta aquí "boleta viva" era una expresión cruzando filas y columnas
-- (amount_clp − refunded_amount_clp), sin respaldo de esquema, y una NC no tenía
-- vínculo explícito con la boleta que anula (se reconstruía por monto). Esta
-- migración hace ambas cosas explícitas y consultables por fila:
--
--   • reverses_document_id → la boleta que anula esta NC (vínculo duro NC→boleta).
--   • reversed_clp         → cuánto de esta boleta ya fue anulado por NCs (acumulador).
--   • is_live (generada)   → boleta con reversed_clp < total (queryable, no cómputo cruzado).
--   • settlement_order_id  → qué orden (su pago MP) financia esta boleta; habilita el
--                            reembolso por-pago cuando un pedido tiene boletas de
--                            distintos pagos (original + delta de un encarecimiento).
--
-- Invariante I1′ (reemplaza I1 "una sola boleta viva"):
--   Σ (total − reversed_clp) sobre boletas vivas  =  amount_clp − refunded_amount_clp.
-- Un pedido puede tener VARIAS boletas vivas (p. ej. tras un encarecimiento aditivo).

-- ── Columnas ────────────────────────────────────────────────────────────────
alter table tax_documents
  add column reversed_clp         int  not null default 0,
  add column reverses_document_id uuid references tax_documents (id),
  add column settlement_order_id  uuid references orders (id);

-- ── Backfill de datos existentes (prod ya tiene boletas/NCs de confirm_payment) ──
-- (a) toda boleta histórica la financia el pago de su propio pedido.
update tax_documents set settlement_order_id = order_id where kind = 'boleta';

-- (b) enlazar cada NC a la boleta que anula. Históricamente toda NC (mark_refunded,
-- reschedule_down viejo, consolidación) anulaba una boleta del MISMO pedido por su
-- total EXACTO. Un pedido puede tener VARIAS boleta/NC del mismo total (p. ej. dos
-- reservas iguales, o el bug histórico de boletas apiladas) → un match "cualquier
-- boleta con ese total" deja que dos NC distintas colapsen sobre la MISMA boleta
-- (violó tax_doc_reversed_le_total en prod: 2 NC de $9.990 ambas enlazadas a la
-- boleta más antigua de $9.990 → reversed_clp=$19.980 > total=$9.990). El emparejado
-- correcto es 1:1 cronológico DENTRO de cada grupo (pedido, total): la k-ésima NC de
-- ese total reversa la k-ésima boleta de ese total, no siempre "la más antigua".
with nc_ranked as (
  select id, order_id, total,
         row_number() over (partition by order_id, total order by created_at, id) rn
  from tax_documents
  where kind = 'nota_credito'
),
b_ranked as (
  select id, order_id, total,
         row_number() over (partition by order_id, total order by created_at, id) rn
  from tax_documents
  where kind = 'boleta'
)
update tax_documents nc set reverses_document_id = b.id
from nc_ranked r
join b_ranked b on b.order_id = r.order_id and b.total = r.total and b.rn = r.rn
where nc.id = r.id;

-- (c) re-derivar reversed_clp de los enlaces recién puestos.
update tax_documents b set reversed_clp = coalesce(
  (select sum(nc.total) from tax_documents nc where nc.reverses_document_id = b.id), 0)
where b.kind = 'boleta';

-- ── Guards de misma fila (baratos, siempre activos) ─────────────────────────
alter table tax_documents
  add constraint tax_doc_reversed_nonneg      check (reversed_clp >= 0),
  add constraint tax_doc_reversed_le_total    check (reversed_clp <= total),
  add constraint tax_doc_reversed_boleta_only check (kind = 'boleta' or reversed_clp = 0),
  add constraint tax_doc_reverses_nc_only     check (reverses_document_id is null or kind = 'nota_credito');

-- "¿esta boleta sigue viva?" como propiedad de fila (expr de misma fila → STORED legal).
alter table tax_documents
  add column is_live boolean generated always as (kind = 'boleta' and reversed_clp < total) stored;

create index tax_documents_live_boleta_idx on tax_documents (order_id)
  where kind = 'boleta' and reversed_clp < total;

-- ── Trigger: default de settlement + mantenimiento de la reversión ──────────
-- BEFORE INSERT (necesita modificar NEW para el default de settlement). Las reglas
-- cruzadas que un CHECK no expresa (la NC apunta a una boleta del MISMO pedido y no
-- sobre-anula) se validan acá, y se sube reversed_clp de la boleta objetivo en la
-- misma sentencia bloqueada (FOR UPDATE serializa NCs concurrentes sobre la boleta).
create function tax_doc_maintain_reversal()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_b tax_documents;
begin
  -- Default de proveniencia de pago: una boleta la financia su propio pedido salvo
  -- que el emisor la fije explícito (p. ej. la boleta delta → orden de delta).
  if new.kind = 'boleta' and new.settlement_order_id is null then
    new.settlement_order_id := new.order_id;
  end if;

  if new.reverses_document_id is null then return new; end if;   -- boleta / NC suelta

  select * into v_b from tax_documents where id = new.reverses_document_id for update;
  if v_b.id is null or v_b.kind <> 'boleta' then
    raise exception 'reverses_target_must_be_boleta';
  end if;
  if v_b.order_id <> new.order_id then
    raise exception 'reverses_target_wrong_order';
  end if;
  if v_b.reversed_clp + new.total > v_b.total then
    raise exception 'reverses_exceeds_boleta_total';
  end if;
  update tax_documents set reversed_clp = reversed_clp + new.total where id = v_b.id;
  return new;
end;
$$;

create trigger tax_doc_reversal_bi
  before insert on tax_documents for each row
  execute function tax_doc_maintain_reversal();

-- ── Helper: boletas vivas de un pedido (id, monto vivo), más antigua primero ──
-- Los llamadores la ITERAN para anular — nunca adivinan qué boleta reversar.
create function order_live_boletas(p_order uuid)
returns table(id uuid, live_amount int) language sql
set search_path = public, pg_temp as $$
  select id, total - reversed_clp
  from tax_documents
  where order_id = p_order and kind = 'boleta' and reversed_clp < total
  order by created_at, id
$$;

-- Boletas vivas + el pago que financia cada una (settlement_order_id.mp_payment_id),
-- más-antigua-primero. La capa app reparte el reembolso por-pago con este orden
-- (idéntico al que usan reschedule_down / mark_refunded para las NC), así el dinero
-- y el asiento contable coinciden. payment_id null ⇒ el pago aún no se registró.
create function order_backing_boletas(p_order uuid)
returns table(live_amount int, payment_id text) language sql
set search_path = public, pg_temp as $$
  select b.total - b.reversed_clp, o.mp_payment_id
  from tax_documents b
  join orders o on o.id = b.settlement_order_id
  where b.order_id = p_order and b.kind = 'boleta' and b.reversed_clp < b.total
  order by b.created_at, b.id
$$;

-- ── create_nota_credito_amount pasa a 3 args: anula una boleta ESPECÍFICA ────
-- neto/IVA copiados del split de la boleta objetivo (reversa exacta, sin deriva del
-- ratio del pedido — que ya no calza con ninguna boleta tras un encarecimiento).
-- p_total = monto a reversar (el llamador pasa live_amount para anulación total).
-- Firma nueva ⇒ drop + create; los callers RPC se reescriben en la migración 2.
drop function if exists create_nota_credito_amount(uuid, int);
create function create_nota_credito_amount(p_order uuid, p_boleta uuid, p_total int)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_net int; v_bnet int; v_btot int;
begin
  if p_total is null or p_total <= 0 then return null; end if;   -- guard $0 preservado
  select neto, total into v_bnet, v_btot from tax_documents where id = p_boleta;
  v_net := round(p_total::numeric * v_bnet / v_btot)::int;       -- prorratea desde la BOLETA
  insert into tax_documents (order_id, kind, neto, iva, total, reverses_document_id)
    values (p_order, 'nota_credito', v_net, p_total - v_net, p_total, p_boleta)
    returning id into v_id;                    -- el trigger valida + sube reversed_clp
  return v_id;
end;
$$;
