-- Inventario de equipos del estudio (/admin/equipos): qué se posee y DÓNDE está.
--
-- Una fila de `equipment_items` es una unidad física (con serie) o un lote sin serie
-- (`quantity` > 1: cables, adaptadores). La posición ACTUAL vive denormalizada en la fila
-- (sede + sala opcional + lugar libre + estado) y cada cambio de posición deja una fila en
-- `equipment_moves` (append-only, con actor). Las dos escrituras que tocan ambas tablas
-- (`equipment_create`, `equipment_move`) son RPC plpgsql para que sean atómicas: PostgREST
-- no envuelve dos statements en una transacción y un split a medias perdería unidades.
-- Spec: docs/superpowers/specs/2026-09-16-inventario-equipos-design.md

-- Habilita la FK compuesta (resource_id, location_id): una sala solo puede asignarse dentro
-- de su sede. Trivialmente única (id ya es PK); no cambia semántica de `resources`.
alter table resources add constraint resources_id_location_key unique (id, location_id);

create table equipment_items (
  id                 uuid primary key default gen_random_uuid(),
  category           text not null
                     constraint equipment_items_category_valid
                     check (category in ('reproductor', 'mixer', 'monitor', 'audifonos', 'cable', 'computador', 'mobiliario', 'otro')),
  brand              text not null constraint equipment_items_brand_len check (char_length(brand) between 1 and 60),
  model              text not null constraint equipment_items_model_len check (char_length(model) between 1 and 80),
  nickname           text constraint equipment_items_nickname_len check (char_length(nickname) between 1 and 40),
  serial_number      text unique constraint equipment_items_serial_len check (char_length(serial_number) between 1 and 80),
  quantity           integer not null default 1 constraint equipment_items_quantity_pos check (quantity >= 1),
  status             text not null default 'in_service'
                     constraint equipment_items_status_valid
                     check (status in ('in_service', 'storage', 'repair', 'loaned', 'retired')),
  location_id        uuid not null references locations (id) on delete restrict,
  resource_id        uuid,
  spot               text constraint equipment_items_spot_len check (char_length(spot) between 1 and 60),
  purchased_at       date,
  purchase_price_clp integer constraint equipment_items_price_nonneg check (purchase_price_clp >= 0),
  vendor             text constraint equipment_items_vendor_len check (char_length(vendor) between 1 and 80),
  warranty_until     date,
  notes              text constraint equipment_items_notes_len check (char_length(notes) between 1 and 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  -- Una serie identifica exactamente una unidad; los lotes no tienen serie.
  constraint equipment_items_serial_single_unit check (serial_number is null or quantity = 1),
  -- MATCH SIMPLE (default): con resource_id null la FK no se evalúa = "solo sede, sin sala".
  constraint equipment_items_resource_in_location
    foreign key (resource_id, location_id) references resources (id, location_id) on delete restrict
);
create index equipment_items_updated_idx on equipment_items (updated_at desc);

-- Bitácora append-only. `from_*` todos null ⇔ fila de alta. Cascade: borrar el ítem borra
-- su historial; un derivado por split solo pierde el puntero al origen.
create table equipment_moves (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null references equipment_items (id) on delete cascade,
  quantity           integer not null constraint equipment_moves_quantity_pos check (quantity >= 1),
  from_location_id   uuid references locations (id) on delete restrict,
  from_resource_id   uuid references resources (id) on delete set null,
  from_spot          text,
  from_status        text,
  to_location_id     uuid not null references locations (id) on delete restrict,
  to_resource_id     uuid references resources (id) on delete set null,
  to_spot            text,
  to_status          text not null
                     constraint equipment_moves_to_status_valid
                     check (to_status in ('in_service', 'storage', 'repair', 'loaned', 'retired')),
  split_from_item_id uuid references equipment_items (id) on delete set null,
  note               text constraint equipment_moves_note_len check (char_length(note) between 1 and 500),
  moved_at           timestamptz not null default now(),
  moved_by           uuid,
  constraint equipment_moves_from_all_or_none check (
    (from_location_id is null and from_status is null) or (from_location_id is not null and from_status is not null)
  )
);
create index equipment_moves_item_idx on equipment_moves (item_id, moved_at desc);

alter table equipment_items enable row level security;   -- sin policies: solo service-role
alter table equipment_moves enable row level security;
grant all privileges on equipment_items to service_role;
grant all privileges on equipment_moves to service_role;

-- Alta: ítem + fila de alta en una transacción. Los nullables van con default null para que
-- los tipos generados los marquen opcionales (el adapter pasa `?? undefined`).
create function equipment_create(
  p_category text, p_brand text, p_model text, p_quantity int, p_status text, p_location uuid,
  p_nickname text default null, p_serial text default null, p_resource uuid default null,
  p_spot text default null, p_purchased_at date default null, p_price int default null,
  p_vendor text default null, p_warranty_until date default null, p_notes text default null,
  p_actor uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into equipment_items (category, brand, model, nickname, serial_number, quantity, status,
      location_id, resource_id, spot, purchased_at, purchase_price_clp, vendor, warranty_until, notes, created_by)
    values (p_category, p_brand, p_model, p_nickname, p_serial, p_quantity, p_status,
      p_location, p_resource, p_spot, p_purchased_at, p_price, p_vendor, p_warranty_until, p_notes, p_actor)
    returning id into v_id;
  insert into equipment_moves (item_id, quantity, to_location_id, to_resource_id, to_spot, to_status, moved_by)
    values (v_id, p_quantity, p_location, p_resource, p_spot, p_status, p_actor);
  return v_id;
end;
$$;

-- Movimiento (posición y/o estado). Completo: actualiza la fila y asienta. Parcial: el
-- original conserva el resto y el lote movido es un ítem NUEVO (sin serie: un lote nunca la
-- tiene) sobre el que se asienta el move con `split_from_item_id`. Devuelve el id del ítem
-- que quedó en el destino. `for update` serializa dos movimientos del mismo ítem.
create function equipment_move(
  p_item uuid, p_quantity int, p_location uuid, p_status text,
  p_resource uuid default null, p_spot text default null, p_note text default null, p_actor uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_item equipment_items%rowtype;
  v_new  uuid;
begin
  select * into v_item from equipment_items where id = p_item for update;
  if not found then raise exception 'equipment_not_found'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > v_item.quantity then
    raise exception 'equipment_bad_quantity';
  end if;
  if v_item.location_id = p_location
     and v_item.resource_id is not distinct from p_resource
     and coalesce(v_item.spot, '') = coalesce(p_spot, '')
     and v_item.status = p_status then
    raise exception 'equipment_no_change';
  end if;

  if p_quantity = v_item.quantity then
    update equipment_items
       set location_id = p_location, resource_id = p_resource, spot = p_spot, status = p_status, updated_at = now()
     where id = p_item;
    insert into equipment_moves (item_id, quantity, from_location_id, from_resource_id, from_spot, from_status,
        to_location_id, to_resource_id, to_spot, to_status, note, moved_by)
      values (p_item, p_quantity, v_item.location_id, v_item.resource_id, v_item.spot, v_item.status,
        p_location, p_resource, p_spot, p_status, p_note, p_actor);
    return p_item;
  end if;

  update equipment_items set quantity = quantity - p_quantity, updated_at = now() where id = p_item;
  insert into equipment_items (category, brand, model, nickname, serial_number, quantity, status,
      location_id, resource_id, spot, purchased_at, purchase_price_clp, vendor, warranty_until, notes, created_by)
    values (v_item.category, v_item.brand, v_item.model, v_item.nickname, null, p_quantity, p_status,
      p_location, p_resource, p_spot, v_item.purchased_at, v_item.purchase_price_clp, v_item.vendor,
      v_item.warranty_until, v_item.notes, p_actor)
    returning id into v_new;
  insert into equipment_moves (item_id, quantity, from_location_id, from_resource_id, from_spot, from_status,
      to_location_id, to_resource_id, to_spot, to_status, split_from_item_id, note, moved_by)
    values (v_new, p_quantity, v_item.location_id, v_item.resource_id, v_item.spot, v_item.status,
      p_location, p_resource, p_spot, p_status, p_item, p_note, p_actor);
  return v_new;
end;
$$;

revoke execute on function equipment_create(text, text, text, int, text, uuid, text, text, uuid, text, date, int, text, date, text, uuid) from public, anon, authenticated;
revoke execute on function equipment_move(uuid, int, uuid, text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function equipment_create(text, text, text, int, text, uuid, text, text, uuid, text, date, int, text, date, text, uuid) to service_role;
grant execute on function equipment_move(uuid, int, uuid, text, uuid, text, text, uuid) to service_role;

-- Permiso de la sección. NO se otorga a ningún rol (decisión del dueño, como
-- customers.manage): super_admin lo tiene por definición; el staff, cuando él lo habilite
-- desde /admin/roles.
insert into admin_permissions (key, label)
values ('equipment.manage', 'Gestionar equipos')
on conflict (key) do nothing;
