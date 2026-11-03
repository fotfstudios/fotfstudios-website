"use client";

import { useState } from "react";
import { Dialog } from "@/components/admin/ui/Dialog";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { Icon } from "@/components/admin/ui/icons";
import { btn, inputCls } from "@/components/admin/ui/styles";
import { addLeadAction } from "../actions";

const labelCls = "flex flex-col gap-1.5 label-sm text-bone-quiet";

/** Alta manual de un lead (origen 'manual'), con opción de inscribirlo de una en la secuencia. */
export function AddLeadDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={btn("secondary", "sm")} onClick={() => setOpen(true)}>
        <Icon name="add" size={15} /> Agregar lead
      </button>
      {open && (
        <Dialog title="Agregar lead" onClose={() => setOpen(false)}>
          <ActionForm
            action={addLeadAction}
            success="Lead agregado."
            onDone={() => setOpen(false)}
            className="flex flex-col gap-4"
          >
            <label className={labelCls}>
              Correo
              <input name="email" type="email" required maxLength={120} className={inputCls} />
            </label>
            <label className={labelCls}>
              Nombre <span className="text-bone-quiet">(opcional)</span>
              <input name="name" maxLength={160} className={inputCls} />
            </label>
            <label className={labelCls}>
              Teléfono <span className="text-bone-quiet">(opcional)</span>
              <input name="phone" maxLength={40} className={inputCls} />
            </label>
            <label className="flex items-center gap-2 text-sm text-bone-dim">
              <input type="checkbox" name="enroll" className="h-4 w-4 accent-gold" />
              Inscribir en la secuencia de nurture
            </label>
            <SubmitButton pendingLabel="Guardando…">Agregar</SubmitButton>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
