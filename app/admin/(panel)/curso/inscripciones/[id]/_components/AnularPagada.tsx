"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { formatCLP } from "@/src/domain/money/money";
import { refundEnrollmentAction } from "../../../actions";

/**
 * Cancelar una inscripción pagada. La política de /terminos ya calculó qué
 * corresponde y se muestra como default, pero el dueño puede sobreescribirla:
 * la regla sugiere, no encierra.
 */
export function AnularPagada({
  enrollmentId,
  totalClp,
  policyLabel,
  policyAmount,
  remedies,
}: {
  enrollmentId: string;
  totalClp: number;
  policyLabel: string;
  policyAmount: number | null;
  remedies: string[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("policy");

  const sugerido =
    policyAmount == null ? "sin reembolso" : `devolver ${formatCLP(policyAmount)}`;

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Cancelar inscripción
      </Button>

      {open && (
        <Dialog title="Cancelar inscripción pagada" onClose={() => setOpen(false)}>
          <ActionForm
            action={refundEnrollmentAction}
            success="Inscripción cancelada."
            onDone={() => setOpen(false)}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="enrollmentId" value={enrollmentId} />

            <div className="border hairline bg-ink-soft/50 px-4 py-3">
              <p className="label-sm text-bone-mute">Según los términos</p>
              <p className="mt-1 text-sm text-bone">{policyLabel}</p>
              <p className="mt-1 label-sm text-gold">Corresponde: {sugerido}</p>
              {remedies.length > 0 && (
                <p className="mt-2 label-sm text-bone-mute">
                  Alternativas sin dinero: {remedies.join(" · ")}
                </p>
              )}
            </div>

            <Field label="Qué hacer con la plata">
              <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="policy">Lo que dicen los términos ({sugerido})</option>
                <option value="full">Devolver todo ({formatCLP(totalClp)})</option>
                <option value="none">No devolver nada</option>
                <option value="custom">Devolver un monto a mano</option>
              </Select>
            </Field>

            {mode === "custom" && (
              <Field label="Monto a devolver" hint={`Máximo ${formatCLP(totalClp)}.`}>
                <Input type="number" name="customAmount" min={1} max={totalClp} required />
              </Field>
            )}

            <p className="label-sm text-bone-mute">
              El cupo vuelve al inventario solo si se devuelve el total. Le avisamos por email.
            </p>

            <div>
              <SubmitButton variant="danger" pendingLabel="Cancelando…">
                Cancelar inscripción
              </SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
