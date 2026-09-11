"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CustomerPicker } from "@/components/admin/customers/CustomerPicker";
import { NuevoClienteForm } from "@/components/admin/customers/NuevoClienteForm";
import { Dialog } from "@/components/admin/ui/Dialog";
import { btn } from "@/components/admin/ui/styles";
import { useToast } from "@/components/admin/ui/Toaster";
import { fmtPts } from "@/components/cuenta/format";
import { customerLabel } from "@/src/domain/customers/customer-input";
import type { CustomerProfile } from "@/src/application/ports/customers";
import { createCustomerAction, lookupCustomerPhoneAction, searchCustomersAction } from "../../_actions/customers";
import { assignCustomerAction } from "../actions";

export interface CambiarClienteDialogProps {
  reservationId: string;
  /** Quién figura hoy, para mostrarlo de dónde a dónde. */
  currentLabel: string;
  currentCustomerId: string | null;
  isPaid: boolean;
  /** Con puntos canjeados la RPC rechaza; el trigger se deshabilita con su motivo. */
  usedPoints: boolean;
}

/**
 * Un solo Dialog con tres pasos: elegir → (crear) → confirmar. El alta rápida
 * NO es otro Dialog: es un paso adentro de este (anidar rompe el foco y deja dos
 * overlays que en móvil no se cierran). `useTransition` porque la acción
 * devuelve un valor y hay que cerrar + refrescar recién cuando termina.
 */
export function CambiarClienteDialog(p: CambiarClienteDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "create" | "confirm">("pick");
  const [prefill, setPrefill] = useState<{ name?: string; email?: string; phone?: string }>({});
  const [chosen, setChosen] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const close = () => {
    setOpen(false);
    setStep("pick");
    setChosen(null);
    setError(null);
  };

  const confirm = () => {
    if (!chosen) return;
    setError(null);
    startTransition(async () => {
      const res = await assignCustomerAction({ reservationId: p.reservationId, customerId: chosen.id });
      if (!res.ok) {
        setError(res.error);
        toast({ tone: "error", message: res.error });
        return;
      }
      toast({ tone: "ok", message: "Cliente actualizado." });
      close();
      router.refresh();
    });
  };

  const sameCustomer = chosen !== null && chosen.id === p.currentCustomerId;

  return (
    <>
      <button
        type="button"
        className={btn("secondary", "sm")}
        onClick={() => setOpen(true)}
        disabled={p.usedPoints}
        title={p.usedPoints ? "Esta reserva usó Puntos FOTF y no se puede reasignar; cancélala y vuelve a crearla." : undefined}
      >
        Cambiar cliente
      </button>
      {p.usedPoints && (
        <p className="mt-1 label-sm text-bone-mute">Usó puntos: no se puede reasignar.</p>
      )}

      {open && (
        <Dialog title="Cambiar cliente" onClose={close}>
          {step === "pick" && (
            <>
              <p className="label-sm mb-3 text-bone-mute">
                Hoy figura <span className="text-bone-dim">{p.currentLabel}</span>.
              </p>
              <CustomerPicker
                search={searchCustomersAction}
                maxRows={5}
                onSelect={(c) => {
                  setChosen(c);
                  setStep("confirm");
                }}
                onCreateNew={(pre) => {
                  setPrefill(pre);
                  setStep("create");
                }}
              />
            </>
          )}

          {step === "create" && (
            <NuevoClienteForm
              create={createCustomerAction}
              lookupPhone={lookupCustomerPhoneAction}
              prefill={prefill}
              onCreated={(c) => {
                setChosen(c);
                setStep("confirm");
              }}
              onCancel={() => setStep("pick")}
            />
          )}

          {step === "confirm" && chosen && (
            <div className="space-y-4">
              <div className="border hairline p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-bone">{customerLabel(chosen)}</span>
                  {chosen.pointsBalance > 0 && (
                    <span className="label-sm text-gold">{fmtPts(chosen.pointsBalance)} pts</span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-bone-dim">
                  {[chosen.email, chosen.phone].filter(Boolean).join(" · ") || "Sin contacto"}
                </p>
              </div>

              {sameCustomer ? (
                <p className="label-sm text-bone-mute">Es el mismo cliente que ya figura. No hay nada que cambiar.</p>
              ) : (
                <div className="label-sm space-y-1 text-bone-dim">
                  <p>Se actualizarán el nombre, el email y el teléfono de la reserva y de su pedido.</p>
                  <p>No se envía ningún correo al cliente.</p>
                  {p.isPaid && <p className="text-gold">Los puntos ganados por este pago pasan al nuevo cliente.</p>}
                  {p.isPaid && !chosen.email && (
                    <p className="text-sirena">Ese cliente no tiene email: agrégalo antes de reasignar una reserva pagada.</p>
                  )}
                </div>
              )}

              {error && <p className="label-sm text-sirena">{error}</p>}

              <div className="flex justify-between gap-3">
                <button type="button" className={btn("ghost", "sm")} onClick={() => setStep("pick")} disabled={pending}>
                  ← Elegir otro
                </button>
                <div className="flex gap-3">
                  <button type="button" className={btn("secondary", "sm")} onClick={close} disabled={pending}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={btn("primary", "sm")}
                    onClick={confirm}
                    disabled={pending || sameCustomer || (p.isPaid && !chosen.email)}
                  >
                    {pending ? "Cambiando…" : "Cambiar cliente"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
