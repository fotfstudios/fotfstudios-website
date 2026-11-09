"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Input } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { btn } from "@/components/admin/ui/styles";
import { formatCLP } from "@/src/domain/money/money";
import { MAX_CREDIT_HORIZON_DAYS } from "@/src/domain/course/credit";
import { setCreditExpiryAction } from "../actions";

const DAY = 24 * 60 * 60 * 1000;
/** YYYY-MM-DD en la zona del estudio: lo que espera un <input type="date">. */
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

/**
 * Límites del selector de fecha (se calculan al abrir, no en el render: leer el reloj es
 * impuro). El default es una semana sobre lo vigente o desde hoy si ya venció, así
 * confirmar sin tocar ≈ el viejo "+7 días".
 */
function bounds(expiresAt: string): { def: string; min: string; max: string } {
  const now = Date.now();
  const base = Math.max(new Date(expiresAt).getTime(), now);
  return {
    def: ymd(new Date(base + 7 * DAY)),
    min: ymd(new Date(now + DAY)),
    max: ymd(new Date(now + MAX_CREDIT_HORIZON_DAYS * DAY)),
  };
}

/**
 * "Extender hasta una fecha": en vez de apilar 7 días, el dueño fija hasta cuándo vale el
 * crédito —para retenerlo cuando el alumno se inscribe más allá de la ventana—. El valor
 * por defecto es una semana más sobre lo vigente (o desde hoy si ya venció), así un
 * confirmar sin tocar equivale al viejo "+7 días"; cambiar la fecha llega hasta donde haga
 * falta (p. ej. principios de diciembre).
 */
export function ExtenderCreditoDialog({
  creditId,
  label,
  amountClp,
  expiresAt,
}: {
  creditId: string;
  label: string;
  amountClp: number;
  expiresAt: string;
}) {
  const [dates, setDates] = useState<{ def: string; min: string; max: string } | null>(null);

  return (
    <>
      <button type="button" className={btn("secondary", "sm")} onClick={() => setDates(bounds(expiresAt))}>
        Extender…
      </button>
      {dates && (
        <Dialog title="Extender el crédito" onClose={() => setDates(null)}>
          <p className="text-sm leading-relaxed text-bone-dim">
            El descuento de {formatCLP(amountClp)} para {label} valdrá hasta el final del día que elijas. Se le vuelve
            a avisar 2 días antes del nuevo vencimiento.
          </p>
          <ActionForm
            action={setCreditExpiryAction}
            success="Crédito extendido."
            onDone={() => setDates(null)}
            className="mt-5 flex flex-col gap-4"
          >
            <input type="hidden" name="creditId" value={creditId} />
            <Field label="Vale hasta">
              <Input name="date" type="date" required defaultValue={dates.def} min={dates.min} max={dates.max} />
            </Field>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDates(null)} className={btn("secondary", "sm")}>
                Cancelar
              </button>
              <SubmitButton variant="primary" size="sm" pendingLabel="Extendiendo…">
                Extender
              </SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
