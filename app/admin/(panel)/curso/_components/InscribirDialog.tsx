"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { formatCLP } from "@/src/domain/money/money";
import type { CoursePlan } from "@/src/domain/course/course";
import { createEnrollmentAction, lookupTrialCreditAction } from "../actions";

/**
 * Inscribir TOMA CUPO, así que vive detrás de un diálogo y no de un botón suelto
 * en una fila. El precio se muestra pero no se edita: sale de la generación,
 * porque el dueño elige a quién inscribir, no cuánto cobrarle.
 */
export function InscribirDialog({
  generationId,
  generationCode,
  prices,
  seatsLeft,
  lead,
  trigger,
}: {
  generationId: string;
  generationCode: string;
  prices: { duo: number; individual: number };
  seatsLeft: number;
  lead?: { id: string; name: string; email: string; phone: string; plan: string } | null;
  trigger?: { label: string; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" };
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<CoursePlan>(lead?.plan === "individual" ? "individual" : "duo");
  const [credit, setCredit] = useState<{ id: string; amountClp: number } | null>(null);

  const needed = plan === "duo" ? 2 : 1;
  const noCabe = seatsLeft < needed;
  const bruto = (plan === "duo" ? prices.duo : prices.individual) * needed;
  const descuento = credit ? Math.min(credit.amountClp, bruto) : 0;
  const total = bruto - descuento;

  // El crédito se busca al salir del campo de email: es una consulta por persona,
  // no algo que deba correr en cada tecla.
  async function buscarCredito(email: string) {
    if (!email.includes("@")) return setCredit(null);
    const r = await lookupTrialCreditAction(email);
    setCredit(r.ok && r.data ? { id: r.data.id, amountClp: r.data.amountClp } : null);
  }

  return (
    <>
      <Button
        variant={trigger?.variant ?? "primary"}
        size={trigger?.size}
        icon="add"
        onClick={() => setOpen(true)}
      >
        {trigger?.label ?? "Inscribir"}
      </Button>

      {open && (
        <Dialog title={`Inscribir en ${generationCode}`} onClose={() => setOpen(false)}>
          <ActionForm
            action={createEnrollmentAction}
            success="Inscripción creada."
            onDone={() => setOpen(false)}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="generationId" value={generationId} />
            {lead && <input type="hidden" name="leadId" value={lead.id} />}

            <Field label="Formato" hint={`Quedan ${seatsLeft} ${seatsLeft === 1 ? "cupo" : "cupos"}.`}>
              <Select name="plan" value={plan} onChange={(e) => setPlan(e.target.value as CoursePlan)}>
                <option value="duo">En dúo · 2 cupos</option>
                <option value="individual">Individual · 1 cupo</option>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <Input name="name1" required maxLength={80} defaultValue={lead?.name ?? ""} />
              </Field>
              <Field label="Email">
                <Input
                  name="email1"
                  type="email"
                  required
                  maxLength={120}
                  defaultValue={lead?.email ?? ""}
                  onBlur={(e) => buscarCredito(e.target.value)}
                />
              </Field>
            </div>
            <Field label="WhatsApp" hint="Opcional.">
              <Input name="phone1" maxLength={40} defaultValue={lead?.phone ?? ""} />
            </Field>

            {plan === "duo" && (
              <>
                <p className="label-sm text-bone-mute">La segunda persona del dúo</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nombre">
                    <Input name="name2" required maxLength={80} />
                  </Field>
                  <Field label="Email">
                    <Input name="email2" type="email" required maxLength={120} />
                  </Field>
                </div>
                <Field label="WhatsApp" hint="Opcional.">
                  <Input name="phone2" maxLength={40} />
                </Field>
              </>
            )}

            <Field label="Notas" hint="Opcional.">
              <Textarea name="notes" maxLength={500} rows={2} />
            </Field>

            {credit && (
              <>
                <input type="hidden" name="creditId" value={credit.id} />
                <p className="label-sm text-gold">
                  Tiene crédito de sesión de prueba: −{formatCLP(descuento)}
                </p>
              </>
            )}
            <p className="label-sm text-bone-mute">
              Total del pedido: <span className="text-gold">{formatCLP(total)}</span>
              {descuento > 0 && <span className="ml-2 text-bone-mute/70">(de {formatCLP(bruto)})</span>} · queda
              pendiente de pago.
            </p>

            {noCabe ? (
              <p role="alert" className="label-sm text-sirena">
                No quedan cupos suficientes para este formato.
              </p>
            ) : (
              <div>
                <SubmitButton icon="add" pendingLabel="Inscribiendo…">
                  Crear inscripción
                </SubmitButton>
              </div>
            )}
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
