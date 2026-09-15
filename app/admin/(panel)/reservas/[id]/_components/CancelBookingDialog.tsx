"use client";

import { useState } from "react";
import { cancelBookingAction } from "../actions";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Input } from "@/components/admin/ui/Field";
import { btn } from "@/components/admin/ui/styles";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { formatCLP } from "@/src/domain/money/money";

type Mode = "policy" | "full" | "none" | "custom";

/**
 * Cancelación de una reserva PAGADA: la política sugiere el reembolso
 * (100%/50%/0% según anticipación) y el dueño decide (total / sin / monto
 * libre). El monto de política/total se RECALCULA en el servidor al confirmar;
 * los errores (p. ej. orden no pagada, monto fuera de rango) aparecen en el
 * mismo dialog vía ActionForm.
 */
export function CancelBookingDialog({
  reservationId,
  liveBoleta,
  unit,
  policy,
  isOffline,
}: {
  reservationId: string;
  /** Saldo reponible (total − ya reembolsado, en CLP; o puntos canjeados) en `unit`. */
  liveBoleta: number;
  /** Unidad de `liveBoleta`: CLP para pagos normales, puntos para órdenes 100% puntos. */
  unit: "clp" | "points";
  /** Calculado en el RSC (force-dynamic): tier vigente al cargar la página. */
  policy: { label: string; hoursUntil: number; suggested: number };
  isOffline: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("policy");

  const fmt = (n: number) => (unit === "points" ? `${n.toLocaleString("es-CL")} pts` : formatCLP(n));

  const hoursLabel =
    policy.hoursUntil <= 0
      ? "La sesión ya comenzó o pasó"
      : `Faltan ~${Math.max(0, Math.floor(policy.hoursUntil))} h para la sesión`;

  const options: { value: Mode; label: string; detail?: string }[] = [
    {
      value: "policy",
      label: `Según política — ${policy.suggested > 0 ? fmt(policy.suggested) : "sin reposición"}`,
      detail: policy.label,
    },
    { value: "full", label: `${unit === "points" ? "Reponer todos" : "Reembolso total"} — ${fmt(liveBoleta)}` },
    {
      value: "none",
      label: unit === "points" ? "Sin reponer puntos" : "Sin reembolso (el pago queda retenido)",
    },
    { value: "custom", label: "Otro monto" },
  ];

  return (
    <>
      <button type="button" className={btn("danger", "sm")} onClick={() => setOpen(true)}>
        Cancelar reserva
      </button>
      {open && (
        <Dialog title="Cancelar reserva" onClose={() => setOpen(false)}>
          <ActionForm
            action={cancelBookingAction}
            success="Reserva cancelada."
            onDone={() => setOpen(false)}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="reservationId" value={reservationId} />

            <p className="text-sm leading-relaxed text-bone-dim">
              {hoursLabel} — política: <span className="text-bone">{policy.label}</span>.
            </p>

            <div className="flex flex-col gap-1.5">
              {options.map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-start gap-3 border px-4 py-3 text-sm transition-colors ${
                    mode === o.value ? "border-gold text-bone" : "hairline text-bone-dim hover:border-gold"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={o.value}
                    checked={mode === o.value}
                    onChange={() => setMode(o.value)}
                    className="mt-0.5 accent-gold"
                  />
                  <span className="flex-1">
                    {o.label}
                    {o.detail && <span className="mt-0.5 block label-sm text-bone-quiet">{o.detail}</span>}
                  </span>
                </label>
              ))}
            </div>

            {mode === "custom" && (
              <Input
                type="number"
                name="customAmount"
                min={1}
                max={liveBoleta}
                step={1}
                inputMode="numeric"
                required
                placeholder={
                  unit === "points"
                    ? `Puntos a reponer (máx. ${liveBoleta.toLocaleString("es-CL")})`
                    : `Monto en pesos (máx. ${liveBoleta})`
                }
                aria-label={unit === "points" ? "Puntos a reponer" : "Monto a reembolsar en pesos"}
              />
            )}

            {isOffline && mode !== "none" && (
              <p className="label-sm leading-relaxed text-gold">
                Pago offline: el reembolso se registra aquí (NC/boleta), pero la devolución al
                cliente la haces tú (transferencia/efectivo).
              </p>
            )}

            <p className="text-xs leading-relaxed text-bone-quiet">
              {unit === "points"
                ? "Los puntos se reponen al cliente al confirmar."
                : "El monto según política se recalcula al confirmar."}{" "}
              Se liberará el horario y se avisará al cliente por email. Esta acción no se puede
              deshacer.
            </p>

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setOpen(false)} className={btn("secondary", "sm")}>
                Volver
              </button>
              <SubmitButton size="sm" variant="danger" pendingLabel="Cancelando…">
                Confirmar cancelación
              </SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
