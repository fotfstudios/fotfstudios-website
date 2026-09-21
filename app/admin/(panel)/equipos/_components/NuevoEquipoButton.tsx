"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataForm } from "@/components/admin/ui/DataForm";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Icon } from "@/components/admin/ui/icons";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { btn, type BtnSize } from "@/components/admin/ui/styles";
import { useToast } from "@/components/admin/ui/Toaster";
import type { PositionCatalog } from "@/src/domain/equipment/equipment";
import { createEquipmentAction } from "../actions";
import { EquipoFields } from "./EquipoFields";
import { PositionFields } from "./PositionFields";

/** Abre el alta y, al crear, va a la ficha nueva. */
export function NuevoEquipoButton({ catalog, size = "md" }: { catalog: PositionCatalog; size?: BtnSize }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <button type="button" className={`${btn("primary", size)} inline-flex items-center gap-2`} onClick={() => setOpen(true)}>
        <Icon name="add" size={16} />
        Nuevo equipo
      </button>
      {open && (
        <Dialog title="Nuevo equipo" onClose={() => setOpen(false)}>
          <DataForm
            action={createEquipmentAction}
            onSuccess={({ id }) => {
              setOpen(false);
              toast({ tone: "ok", message: "Equipo creado." });
              router.push(`/admin/equipos/${id}`);
            }}
            className="space-y-4"
          >
            <EquipoFields />
            <PositionFields catalog={catalog} />
            <div className="flex justify-end gap-3">
              <button type="button" className={btn("secondary", "sm")} onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <SubmitButton size="sm" pendingLabel="Creando…">
                Crear equipo
              </SubmitButton>
            </div>
          </DataForm>
        </Dialog>
      )}
    </>
  );
}
