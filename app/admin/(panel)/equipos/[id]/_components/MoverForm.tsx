"use client";

import { useRouter } from "next/navigation";
import { DataForm } from "@/components/admin/ui/DataForm";
import { Field, Input, Textarea } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { useToast } from "@/components/admin/ui/Toaster";
import type { EquipmentDetail } from "@/src/application/ports/equipment";
import { EQUIPMENT_CAPS, type PositionCatalog } from "@/src/domain/equipment/equipment";
import { PositionFields } from "../../_components/PositionFields";
import { moveEquipmentAction } from "../actions";

/** Mover (posición y/o estado). Un movimiento parcial deja un ítem nuevo: se navega a él. */
export function MoverForm({ item, catalog }: { item: EquipmentDetail; catalog: PositionCatalog }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <DataForm
      action={moveEquipmentAction}
      onSuccess={({ itemId, split, quantity }) => {
        if (split) {
          toast({ tone: "ok", message: `Separadas ${quantity} unidades. Estás viendo el ítem nuevo.` });
          router.push(`/admin/equipos/${itemId}`);
        } else {
          toast({ tone: "ok", message: "Movimiento registrado." });
          router.refresh();
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={item.id} />
      <PositionFields catalog={catalog} current={item} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cantidad a mover" hint={item.quantity > 1 ? `Hasta ${item.quantity}. Menos que el total separa un lote nuevo.` : "Una unidad."}>
          <Input name="quantity" type="number" inputMode="numeric" min={1} max={item.quantity} step={1} defaultValue={item.quantity} disabled={item.quantity === 1} required />
          {item.quantity === 1 && <input type="hidden" name="quantity" value={1} />}
        </Field>
        <Field label="Nota" hint="Opcional. “Se fue a servicio técnico”, “prestado a…”">
          <Textarea name="note" maxLength={EQUIPMENT_CAPS.note} className="min-h-12" />
        </Field>
      </div>
      <SubmitButton pendingLabel="Moviendo…">Mover</SubmitButton>
    </DataForm>
  );
}
