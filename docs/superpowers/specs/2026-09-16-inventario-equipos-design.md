# Spec — Inventario de equipos con historial de ubicación (`/admin/equipos`)

**Fecha:** 2026-09-16 · **Rama:** `feat/inventario-equipos` · **Estado:** diseño aprobado

## Contexto

El dueño necesita llevar registro de los equipos que posee (modelo, serie, compra, garantía,
estado) y de **dónde está físicamente cada uno**, con historial de movimientos.

Auditoría del repo (2026-09-16): **no existe** esquema ni sección de admin para esto.

- La única "lista de equipos" es copy de marketing: `GEAR` en `lib/site.ts` (3 filas
  qty/modelo/rol) que renderizan 5 páginas públicas. No tiene series, compra ni ubicación, y
  **sigue estática** — el marketing debe buildear en Vercel Preview sin base de datos.
- Lo más cercano en el esquema son `locations` (1 fila: Viña del Mar) y `resources`
  (1 fila: "Sala de ensayo DJ", `kind='room'`), primitivas de agenda. Sirven como destino de
  FK para "dónde está", pero **no** se reutilizan para representar equipos.
- El sidebar tiene 13 secciones; ninguna de equipos. `PERMISSIONS` tiene 14 claves; ninguna
  `equipment.*`.

## Decisiones tomadas en la conversación

1. **Historial de movimientos**, no solo estado actual.
2. **Un solo permiso** `equipment.manage` (sin split view/manage).
3. **Una fila por unidad física**, con `quantity` para lo que no se rastrea por serie
   (cables, adaptadores). Una fila con serie es exactamente una unidad.
4. **Categoría de lista fija** (check constraint + espejo en código con test de paridad),
   no texto libre.
5. **Enfoque A**: estado actual denormalizado en la fila del ítem + bitácora append-only
   escrita por una RPC atómica (mismo patrón que `log_booking_event`). Descartados:
   event-sourcing puro (lecturas caras, splits incómodos) y trigger con `set_config` para el
   actor (patrón ajeno al repo, difícil de testear).

## Parte 1 — Modelo de datos (migración `supabase/migrations/20260916120000_equipment.sql`)

### `equipment_items` — una fila por unidad (o lote), con su posición **actual**

| columna | tipo / regla | nota |
|---|---|---|
| `id` | uuid pk `gen_random_uuid()` | |
| `category` | text not null, check in (`reproductor`, `mixer`, `monitor`, `audifonos`, `cable`, `computador`, `mobiliario`, `otro`) | espejo `EQUIPMENT_CATEGORIES` en código |
| `brand` | text not null, 1–60 | "Pioneer" |
| `model` | text not null, 1–80 | "XDJ-1000MK2" |
| `nickname` | text, ≤40, null | "Deck izquierdo" |
| `serial_number` | text, ≤80, **unique**, null | `check (serial_number is null or quantity = 1)` |
| `quantity` | int not null default 1, ≥1 | |
| `status` | text not null default `in_service`, check in (`in_service`, `storage`, `repair`, `loaned`, `retired`) | espejo `EQUIPMENT_STATUSES` |
| `location_id` | uuid not null → `locations(id)` on delete restrict | |
| `resource_id` | uuid null → `resources(id)` | + FK compuesta `(resource_id, location_id) → resources(id, location_id)` |
| `spot` | text, ≤60, null | "cabina", "bodega", "rack 2" |
| `purchased_at` | date, null | |
| `purchase_price_clp` | int ≥0, null | |
| `vendor` | text ≤80, null | |
| `warranty_until` | date, null | |
| `notes` | text ≤2000, null | |
| `created_at`, `updated_at` | timestamptz not null default now() | `updated_at = now()` explícito en cada write (como `customers`; sin trigger) |
| `created_by` | uuid null | actor (claim `sub`) |

La FK compuesta exige `alter table resources add constraint resources_id_location_unique
unique (id, location_id)` (trivialmente cierta porque `id` es PK; no cambia semántica).
Con `MATCH SIMPLE` (default) la FK compuesta **no se evalúa** cuando `resource_id` es null:
ese es justo el caso "solo sede, sin sala".

Índice: `(updated_at desc)` (orden por defecto de la lista). Con decenas de filas no hace falta más.

### `equipment_moves` — bitácora append-only

| columna | tipo / regla |
|---|---|
| `id` | uuid pk |
| `item_id` | uuid not null → `equipment_items(id)` **on delete cascade** |
| `quantity` | int not null ≥1 |
| `from_location_id`, `from_resource_id` | uuid null → locations / resources |
| `from_spot`, `from_status` | text null |
| `to_location_id` | uuid **not null** → locations |
| `to_resource_id` | uuid null → resources |
| `to_spot` | text null |
| `to_status` | text not null (mismo check que `status`) |
| `split_from_item_id` | uuid null → `equipment_items(id)` on delete set null |
| `note` | text ≤500, null |
| `moved_at` | timestamptz not null default now() |
| `moved_by` | uuid null |

Índice `(item_id, moved_at desc)`. `from_*` todos null ⇔ fila de **alta**.

### RPCs (`language plpgsql`, `set search_path = public, pg_temp`, `grant execute … to service_role`)

**`equipment_create(p_category, p_brand, p_model, p_nickname, p_serial, p_quantity, p_status,
p_location, p_resource, p_spot, p_purchased_at, p_price, p_vendor, p_warranty_until, p_notes,
p_actor) returns uuid`**
Inserta el ítem **y** su fila de alta en `equipment_moves` (`from_*` null, `quantity` = la del
ítem, `moved_by = p_actor`) en una transacción. Devuelve el id.

**`equipment_move(p_item, p_quantity, p_location, p_resource, p_spot, p_status, p_note,
p_actor) returns uuid`**
1. `select … for update` del ítem; si no existe → `raise exception 'equipment_not_found'`.
2. `p_quantity < 1` o `> quantity` → `raise exception 'equipment_bad_quantity'`.
3. Destino idéntico a la posición actual (`location`, `resource`, `coalesce(spot,'')`, `status`) →
   `raise exception 'equipment_no_change'`.
4. **Movimiento completo** (`p_quantity = quantity`): `update` posición + `updated_at`; inserta
   move con `item_id = p_item`, `from_* = posición previa`.
5. **Movimiento parcial**: `update … set quantity = quantity - p_quantity, updated_at`;
   `insert` nuevo ítem copiando categoría/marca/modelo/nickname/compra/vendor/garantía/notas,
   con `serial_number = null` (un lote nunca tiene serie), `quantity = p_quantity`, posición
   destino, `created_by = p_actor`; inserta move con `item_id = nuevo`,
   `split_from_item_id = p_item`, `from_* = posición del original`.
6. Devuelve el id del ítem que quedó en el destino (el original o el nuevo).

Los mensajes de excepción son claves estables (`equipment_*`) que el repositorio traduce a
errores tipados; nunca se muestran crudos al usuario.

### Edición de detalles, borrado, permisos, RLS, seed

- **Detalles** (brand, model, nickname, serial, purchase*, vendor, warranty, notes): `update`
  directo desde la app, **sin** fila de move (no es un movimiento). `quantity` **no** se edita
  por acá: cambia solo vía split (mover) — evita descuadrar la bitácora. Excepción: mientras
  el ítem solo tiene su fila de alta (ningún move), `updateDetails` acepta corregir `quantity`
  (error de tipeo al crear) y actualiza también la fila de alta; el repositorio lo verifica
  contando `equipment_moves` antes del `update`.
- **Borrado**: hard delete bajo `ConfirmForm`; cascade borra su historial. Un ítem que aparece
  como `split_from_item_id` de otro deja ese puntero en null (on delete set null).
- **Permiso**: `insert into admin_permissions (key, label) values ('equipment.manage',
  'Gestionar equipos') on conflict (key) do nothing;` — no se otorga a ningún rol (super_admin
  lo tiene por definición), igual que `customers.manage`.
- **RLS**: ambas tablas `enable row level security` sin policies + `grant all privileges … to
  service_role`. Solo el server (service role) las toca.
- **Seed local** (`supabase/seed.sql`): 2× XDJ-1000MK2 (series ficticias), 1× DJM-450,
  2× VM-50 (en la sala, `cabina`), 1 lote "cable RCA" ×10 en `bodega`. Prod parte vacía.

## Parte 2 — Capas de aplicación y superficie

### Dominio (puro, con tests)

`src/domain/equipment/equipment.ts`
- `EQUIPMENT_CATEGORIES` / `EQUIPMENT_STATUSES`: `Record<key, label ES>`; `*_KEYS` derivados.
  Test de paridad con los checks SQL (itest, consulta `pg_get_constraintdef`).
- `parseEquipmentInput(raw)` → `Result<EquipmentInput>`: trim, largos, `quantity` entero ≥1,
  `serial` ⇒ `quantity = 1`, fechas ISO válidas, precio entero ≥0. Errores en español para
  el toast.
- `parseMoveInput(raw, current)` → `Result<MoveInput>`: `quantity` 1..current, destino
  requerido, `spot` normalizado (trim + colapsar espacios, se conserva mayúsculas; vacío → null).
- `positionLabel({ locationName, resourceName, spot })` → "Sala de ensayo DJ · cabina".

`src/domain/admin/equipos-list.ts` — `parseEquiposSearchParams` / `equiposHref`: `q`
(ilike sobre brand/model/nickname/serial vía `escapeIlike`), `categoria`, `estado`
(default: **todo menos `retired`**; `estado=retired` los muestra), `page`. Mismo contrato que
`clientes-list.ts` (clamp de `page`, `perPage` fijo).

### Puerto e infraestructura

`src/application/ports/equipment.ts` — `EquipmentRepository`:
`list(query) → { rows, total }` · `get(id) → EquipmentDetail | null` · `history(id) →
EquipmentMoveRow[]` · `positions() → { locations: [{ id, name, resources: [{ id, name }] }] }`
(solo activos) · `create(input, actor) → id` · `updateDetails(id, patch) → void` ·
`move(id, move, actor) → { itemId, split: boolean }` · `remove(id) → void`.

`src/infrastructure/db/equipment-repository.ts` — `SupabaseEquipmentRepository`. `create`/`move`
llaman a las RPCs; `list`/`get`/`history` leen las tablas planas; `history` también resuelve `moved_by` → email con una segunda consulta a `admin_members`
(`user_id in (...)`); sin embeds PostgREST: los nombres de sede/sala se mapean en JS desde
`positions()` (catálogo de pocas filas), evitando depender del embed por FK compuesta. Excepciones `equipment_*` → `Error` con mensaje en español.

`src/composition.ts` — `equipmentRepository(client = db())`.

### Auth y navegación

- `src/domain/auth/permissions.ts`: `"equipment.manage": "Gestionar equipos"`.
- `AdminShell.tsx`: `show.equipment = hasPermission(claims, "equipment.manage")`.
- `Sidebar.tsx`: `{ href: "/admin/equipos", label: "Equipos", icon: "doc" }` bajo *Operación*,
  después de Cerradura. Sin SVG nuevo.

### Rutas — `app/admin/(panel)/equipos/`

- `page.tsx` (`force-dynamic`, `requirePermission`): `PageHeader` kicker *Operación* título
  *Equipos* + `NuevoEquipoButton`; barra con `SearchBox` y dos `<select>` (categoría, estado)
  que navegan por `equiposHref`; `DataTable` columnas **Equipo** (brand model + nickname
  menudo, link a ficha) · **Categoría** · **Cant.** · **Serie** · **Ubicación**
  (`positionLabel`) · **Estado** (`StatusPill`) · **Actualizado** (`fmtDate`); `Pagination`;
  `EmptyState` distinto con y sin filtros.
- `_components/NuevoEquipoButton.tsx`: `Dialog` nativo con el formulario de alta (`Field`s;
  categoría/estado/sede/sala como select; sala filtrada por sede en cliente con `positions()`
  precargado por props). Submit → `createEquipmentAction` → toast + `router.push` a la ficha.
- `actions.ts`: `createEquipmentAction(raw)` (`runData`, `requirePermission`, `revalidatePath`
  de `/admin/equipos`).
- `[id]/page.tsx`: `notFound()` si no existe. Header: brand model / nickname / `StatusPill`.
  Tres `Card`s:
  1. **Detalles** — formulario de edición inline (`ActionForm` → `updateDetailsAction`).
  2. **Ubicación** — posición actual grande + formulario **Mover** (sede, sala, lugar, estado,
     cantidad prellenada con el total, nota) → `moveEquipmentAction`. Si hubo split, el toast
     lo dice y enlaza al ítem nuevo.
  3. **Historial** — lista cronológica inversa de `equipment_moves`: fecha, "de → a"
     (`positionLabel` + estado), cantidad si ≠ total, nota, actor. La fila de alta se etiqueta
     *Alta*; un split, *Separado de …* con link.
  Pie: **Eliminar** en `ConfirmForm` → `removeEquipmentAction` → redirect a la lista.
- `[id]/actions.ts`: `updateDetailsAction`, `moveEquipmentAction`, `removeEquipmentAction`.
- `loading.tsx` (skeleton) y `not-found.tsx` en ambos niveles.

Todo bajo `data-surface="tool"`: labels `.label`, pills `.label-sm`, controles con
`border-ink-edge`, secundario `bone-quiet`, `<dialog>` nativo, `th scope`, toasts de error
persistentes — lo que `lib/admin-a11y-contract.test.ts` exige.

## Parte 3 — Errores, bordes y pruebas

### Bordes decididos

- Serie duplicada al crear/editar → violación `unique` → mensaje "Ya existe un equipo con esa
  serie."
- Editar `serial` en un lote (`quantity > 1`) → rechazado por `parseEquipmentInput` antes de
  tocar la DB.
- Mover a la misma posición y estado → `equipment_no_change` → "El equipo ya está ahí."
- Sala de otra sede → FK compuesta → "La sala no pertenece a esa sede." (el formulario ya
  filtra, la DB es la red).
- Sede/sala desactivada después de asignar: se sigue mostrando por nombre; `positions()` solo
  ofrece activas para *nuevos* movimientos.
- Eliminar un ítem con splits derivados: los derivados quedan (su `split_from_item_id` → null);
  el historial del derivado conserva la fila de split.
- Concurrencia: `for update` en `equipment_move` serializa dos movimientos del mismo ítem; el
  segundo ve la cantidad ya descontada y falla con `equipment_bad_quantity` si se pasa.

### Pruebas

- **Unit (vitest)**: `equipment.test.ts` (parsers: reglas de qty/serie, largos, fechas,
  precio; `positionLabel`), `equipos-list.test.ts` (params, default sin `retired`, clamp).
- **Integración** `src/infrastructure/db/equipment.itest.ts` (DB local; truncate
  `equipment_moves, equipment_items` en `afterEach`; `db:reset` al terminar):
  - `create` deja ítem + fila de alta con `from_*` null y `moved_by = actor`.
  - move completo: posición nueva en el ítem, move con `from_*` = anterior.
  - move parcial 10 → 6 + 4: original qty 6, nuevo qty 4 sin serie, move sobre el nuevo con
    `split_from_item_id`, `history(nuevo)` lo lista.
  - `p_quantity` 0 / 11 → `equipment_bad_quantity`; mismo destino → `equipment_no_change`.
  - FK compuesta: sala de otra sede rechazada (se inserta una segunda location + resource en
    el test).
  - paridad: `EQUIPMENT_CATEGORIES`/`STATUSES` vs check constraints (`pg_get_constraintdef`).
  - `rbac.itest.ts` (paridad de permisos) pasa sin cambios porque la clave entra en ambos
    lados en el mismo PR.
- **Contratos existentes**: `admin-a11y-contract` y `chrome-contract` cubren la sección
  nueva sin cambios.

## Entrega — dos PRs (regla de ventana de aprobación de migraciones)

1. **`feat(equipos): esquema de inventario y bitácora de movimientos`** — migración
   (tablas, FK compuesta, RPCs, permiso, RLS), `PERMISSIONS["equipment.manage"]`, seed local,
   `database.types.ts` regenerado, `equipment.itest.ts` (solo RPCs/paridad). En runtime
   **nada** toca las tablas nuevas → prod queda sano mientras la migración espera aprobación.
   La paridad de permisos exige que clave SQL y clave en código vayan juntas.
2. **`feat(equipos): sección /admin/equipos`** — dominio, puerto, repositorio, composición,
   sidebar, rutas, acciones, tests unitarios. Se mergea **solo** con la migración de PR1 ya
   aplicada en prod.

## Fuera de alcance (v1)

- Adjuntos (fotos, factura PDF) — requeriría bucket + policies como `guias`.
- Export CSV.
- Recordatorios por `warranty_until` / mantenciones.
- Derivar `GEAR` (marketing) de la DB: **no** — el marketing sigue estático a propósito.
- Edición de `locations`/`resources` desde el admin (siguen viniendo de migraciones).
