import { Field, Input, Select, Textarea } from "@/components/admin/ui/Field";
import type { EquipmentDetail } from "@/src/application/ports/equipment";
import { EQUIPMENT_CAPS, EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_KEYS } from "@/src/domain/equipment/equipment";

/**
 * Campos de detalle (sin posición ni estado), compartidos por el alta y la ficha. Nombres de
 * FormData = claves que lee parseEquipmentInput/parseEquipmentDetails. `quantityLocked`:
 * con movimientos la cantidad no se edita (viaja oculta para que el parse la vea).
 */
export function EquipoFields({ d, quantityLocked = false }: { d?: Partial<EquipmentDetail>; quantityLocked?: boolean }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoría">
          <Select name="category" defaultValue={d?.category ?? "reproductor"} required>
            {EQUIPMENT_CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {EQUIPMENT_CATEGORIES[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cantidad" hint={quantityLocked ? "Con movimientos, la cantidad se cambia desde Mover." : "1 por unidad con serie; más para lotes (cables, adaptadores)."}>
          <Input name="quantity" type="number" inputMode="numeric" min={1} step={1} defaultValue={d?.quantity ?? 1} disabled={quantityLocked} required />
          {quantityLocked && <input type="hidden" name="quantity" value={d?.quantity ?? 1} />}
        </Field>
        <Field label="Marca">
          <Input name="brand" defaultValue={d?.brand ?? ""} maxLength={EQUIPMENT_CAPS.brand} autoComplete="off" required />
        </Field>
        <Field label="Modelo">
          <Input name="model" defaultValue={d?.model ?? ""} maxLength={EQUIPMENT_CAPS.model} autoComplete="off" required />
        </Field>
        <Field label="Apodo" hint="Opcional. “Deck izquierdo”, “Caja 1”…">
          <Input name="nickname" defaultValue={d?.nickname ?? ""} maxLength={EQUIPMENT_CAPS.nickname} autoComplete="off" />
        </Field>
        <Field label="Número de serie" hint="Opcional. Con serie, la cantidad es 1.">
          <Input name="serialNumber" defaultValue={d?.serialNumber ?? ""} maxLength={EQUIPMENT_CAPS.serial} autoComplete="off" />
        </Field>
        <Field label="Fecha de compra">
          <Input name="purchasedAt" type="date" defaultValue={d?.purchasedAt ?? ""} />
        </Field>
        <Field label="Precio (CLP)" hint="Entero, sin puntos ni decimales.">
          <Input name="purchasePriceClp" type="number" inputMode="numeric" min={0} step={1} defaultValue={d?.purchasePriceClp ?? ""} />
        </Field>
        <Field label="Proveedor">
          <Input name="vendor" defaultValue={d?.vendor ?? ""} maxLength={EQUIPMENT_CAPS.vendor} autoComplete="off" />
        </Field>
        <Field label="Garantía hasta">
          <Input name="warrantyUntil" type="date" defaultValue={d?.warrantyUntil ?? ""} />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea name="notes" defaultValue={d?.notes ?? ""} maxLength={EQUIPMENT_CAPS.notes} />
      </Field>
    </>
  );
}
