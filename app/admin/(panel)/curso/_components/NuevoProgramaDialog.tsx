"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { formatCLP } from "@/src/domain/money/money";
import type { CoursePlan } from "@/src/domain/course/course";
import { createProgramAction, lookupTrialCreditAction } from "../actions";

/**
 * Crear un programa 1:1 abre un pedido, así que vive detrás de un diálogo y no de
 * un botón suelto. El precio se muestra pero no se edita: sale de PRECIOS, porque
 * el dueño elige a quién inscribir, no cuánto cobrarle. Se abre desde el listado
 * del curso o desde una solicitud (con sus datos ya puestos).
 */
export function NuevoProgramaDialog({
  prices,
  lead,
  trigger,
}: {
  prices: { duo: number; individual: number };
  lead?: { id: string; name: string; email: string; phone: string; plan: string } | null;
  trigger?: { label: string; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" };
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<CoursePlan>(lead?.plan === "duo" ? "duo" : "individual");
  const [credit, setCredit] = useState<{ id: string; amountClp: number } | null>(null);
  /** Ficha que ya existe con este email: se usa tal cual (la DB nunca la renombra). */
  const [ficha, setFicha] = useState<{ name: string | null; phone: string | null } | null>(null);

  const people = plan === "duo" ? 2 : 1;
  const bruto = (plan === "duo" ? prices.duo : prices.individual) * people;
  const descuento = credit ? Math.min(credit.amountClp, bruto) : 0;
  const total = bruto - descuento;

  // El crédito se busca al salir del campo de email: es una consulta por persona,
  // no algo que deba correr en cada tecla.
  // Con el email también se busca la ficha: si ya existe, sus datos rellenan lo que esté
  // vacío (nunca lo tipeado) y se avisa que la inscripción la usa tal cual.
  async function buscarCredito(email: string, form?: HTMLFormElement | null) {
    if (!email.includes("@")) {
      setCredit(null);
      setFicha(null);
      return;
    }
    const r = await lookupTrialCreditAction(email);
    const data = r.ok ? r.data : null;
    setCredit(data?.credit ? { id: data.credit.id, amountClp: data.credit.amountClp } : null);
    setFicha(data?.customer ?? null);
    if (form && data?.customer) {
      const fill = (field: string, value: string | null) => {
        const el = form.elements.namedItem(field);
        if (el instanceof HTMLInputElement && !el.value.trim() && value) el.value = value;
      };
      fill("name1", data.customer.name);
      fill("phone1", data.customer.phone);
    }
  }

  return (
    <>
      <Button
        variant={trigger?.variant ?? "primary"}
        size={trigger?.size}
        icon="add"
        onClick={() => {
          setOpen(true);
          // Desde una solicitud el email ya viene puesto y nadie sale del campo: sin esto
          // el crédito de la prueba no se buscaba y el descuento se perdía en silencio.
          if (lead?.email) void buscarCredito(lead.email);
        }}
      >
        {trigger?.label ?? "Nuevo programa"}
      </Button>

      {open && (
        <Dialog title={lead ? `Inscribir a ${lead.name}` : "Nuevo programa"} onClose={() => setOpen(false)}>
          <ActionForm
            action={createProgramAction}
            success="Programa creado. Agenda sus sesiones desde la ficha."
            onDone={() => setOpen(false)}
            className="flex flex-col gap-5"
          >
            {lead && <input type="hidden" name="leadId" value={lead.id} />}

            <Field label="Formato">
              <Select name="plan" value={plan} onChange={(e) => setPlan(e.target.value as CoursePlan)}>
                <option value="individual">Individual · 1 persona</option>
                <option value="duo">En dúo · 2 personas (precio por persona)</option>
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
                  onBlur={(e) => buscarCredito(e.target.value, e.currentTarget.form)}
                />
              </Field>
            </div>
            <Field label="WhatsApp" hint="Opcional.">
              <Input name="phone1" maxLength={40} defaultValue={lead?.phone ?? ""} />
            </Field>
            {ficha && (
              <p className="label-sm text-bone-quiet">
                Ya es cliente{ficha.name ? `: ${ficha.name}` : ""}. La inscripción usa su ficha y no la renombra.
              </p>
            )}

            {plan === "duo" && (
              <>
                <p className="label-sm text-bone-quiet">La segunda persona del dúo</p>
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

            <Field label="Instructor" hint="Opcional. Texto libre; se copia a cada sesión al agendar.">
              <Input name="instructor" maxLength={60} />
            </Field>

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
            <p className="label-sm text-bone-quiet">
              Total del pedido: <span className="text-gold">{formatCLP(total)}</span>
              {descuento > 0 && <span className="ml-2 text-bone-quiet">(de {formatCLP(bruto)})</span>} · queda
              pendiente de pago.
            </p>

            <div>
              <SubmitButton icon="add" pendingLabel="Creando…">
                Crear programa
              </SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
