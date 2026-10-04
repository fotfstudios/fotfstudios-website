"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Input } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { substituteStudentAction } from "../../../actions";

/**
 * Las salidas SIN dinero que ofrecen los términos bajo el corte de 7 días:
 * reagendar las sesiones (desde la tarjeta Sesiones) o designar un reemplazante.
 * La plata no se mueve, así que no hay nota de crédito ni boleta nueva. Con el
 * curso 1:1 ya no existe el traspaso "a la siguiente generación".
 */
export function SinDinero({ enrollmentId, studentName }: { enrollmentId: string; studentName: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Card title="Sin mover dinero">
      <p className="mb-4 text-sm text-bone-dim">
        Lo que ofrecen los términos cuando no corresponde reembolso: reagendar sus sesiones (Editar, en
        Sesiones) o que otra persona tome su lugar. El pedido y su boleta no se tocan.
      </p>
      <Button variant="secondary" size="sm" onClick={() => setAbierto(true)}>
        Designar reemplazante
      </Button>

      {abierto && (
        <Dialog title="Designar reemplazante" onClose={() => setAbierto(false)}>
          <ActionForm
            action={substituteStudentAction}
            success="Reemplazante designado."
            onDone={() => setAbierto(false)}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <Input name="name" required maxLength={80} />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" required maxLength={120} />
              </Field>
            </div>
            <Field label="WhatsApp" hint="Opcional.">
              <Input name="phone" maxLength={40} />
            </Field>
            <p className="label-sm text-bone-quiet">
              Cambia quién asiste, no quién pagó: la boleta sigue a nombre de {studentName}.
            </p>
            <div>
              <SubmitButton pendingLabel="Guardando…">Designar reemplazante</SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </Card>
  );
}
