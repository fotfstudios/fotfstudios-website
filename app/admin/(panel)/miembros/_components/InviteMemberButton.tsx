"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { Icon } from "@/components/admin/ui/icons";
import { btn } from "@/components/admin/ui/styles";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { inviteMemberAction } from "../actions";

export function InviteMemberButton({ roles }: { roles: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={btn("primary", "md")} onClick={() => setOpen(true)}>
        <Icon name="add" size={16} />
        Invitar miembro
      </button>
      {open && (
        <Dialog title="Invitar miembro" onClose={() => setOpen(false)}>
          <ActionForm
            action={inviteMemberAction}
            success="Invitación enviada."
            onDone={() => setOpen(false)}
            className="flex flex-col gap-4"
          >
            <Field label="Correo">
              <Input type="email" name="email" required placeholder="persona@correo.cl" />
            </Field>
            <Field label="Rol">
              <Select name="roleId" required defaultValue="">
                <option value="" disabled>
                  Elegir rol…
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs leading-relaxed text-bone-mute">
              Le llegará un correo con un enlace para entrar. Solo personas invitadas pueden acceder.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setOpen(false)} className={btn("secondary", "sm")}>
                Cancelar
              </button>
              <SubmitButton size="sm" pendingLabel="Enviando…">
                Enviar invitación
              </SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
