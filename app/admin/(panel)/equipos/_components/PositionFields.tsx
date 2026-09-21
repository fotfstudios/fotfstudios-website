import { Field, Input, Select } from "@/components/admin/ui/Field";
import { EQUIPMENT_CAPS, EQUIPMENT_STATUSES, EQUIPMENT_STATUS_KEYS, type EquipmentStatus, type PositionCatalog, positionOptions, positionValue } from "@/src/domain/equipment/equipment";

/**
 * Posición + estado, compartidos por el alta y Mover. Un solo select "sede:sala" en vez de
 * dos dependientes: con una sede y una sala, dos selects encadenados serían puro ruido y
 * exigirían un client component. Nombres = claves que lee el parse (position/spot/status).
 */
export function PositionFields({
  catalog,
  current,
}: {
  catalog: PositionCatalog;
  current?: { locationId: string; resourceId: string | null; spot: string | null; status: EquipmentStatus };
}) {
  const options = positionOptions(catalog);
  // Para un ítem NUEVO, el default es la primera opción CON sala: casi todo el equipo vive
  // en la sala, no en "Sede (sin sala)" (que options[0] sería si se tomara literal).
  const selected = current ? positionValue(current.locationId, current.resourceId) : (options.find((o) => o.value.split(":")[1])?.value ?? options[0]?.value);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Ubicación">
        <Select name="position" defaultValue={selected} required>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lugar" hint="Libre: “cabina”, “bodega”, “rack 2”…">
        <Input name="spot" defaultValue={current?.spot ?? ""} maxLength={EQUIPMENT_CAPS.spot} autoComplete="off" />
      </Field>
      <Field label="Estado">
        <Select name="status" defaultValue={current?.status ?? "in_service"} required>
          {EQUIPMENT_STATUS_KEYS.map((k) => (
            <option key={k} value={k}>
              {EQUIPMENT_STATUSES[k]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
