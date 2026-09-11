"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NuevoClienteForm } from "@/components/admin/customers/NuevoClienteForm";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Icon } from "@/components/admin/ui/icons";
import { btn, type BtnSize } from "@/components/admin/ui/styles";
import { useToast } from "@/components/admin/ui/Toaster";
import { createCustomerAction, lookupCustomerPhoneAction } from "../actions";

/** Abre el alta rápida y, al crear (o al elegir la que ya existía), va a la ficha. */
export function NuevoClienteButton({ size = "md" }: { size?: BtnSize }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <button type="button" className={`${btn("primary", size)} inline-flex items-center gap-2`} onClick={() => setOpen(true)}>
        <Icon name="add" size={16} />
        Nuevo cliente
      </button>
      {open && (
        <Dialog title="Nuevo cliente" onClose={() => setOpen(false)}>
          <NuevoClienteForm
            create={createCustomerAction}
            lookupPhone={lookupCustomerPhoneAction}
            submitLabel="Crear cliente"
            onCreated={(c) => {
              setOpen(false);
              toast({ tone: "ok", message: "Cliente creado." });
              router.push(`/admin/clientes/${c.id}`);
            }}
            onCancel={() => setOpen(false)}
          />
        </Dialog>
      )}
    </>
  );
}
