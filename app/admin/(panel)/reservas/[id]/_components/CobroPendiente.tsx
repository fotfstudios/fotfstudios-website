"use client";

import { useState, useTransition } from "react";
import { markPaidOfflineAction, sharePaymentLinkAction } from "../actions";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Choice, type ChoiceOption } from "@/components/admin/ui/Choice";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { Icon } from "@/components/admin/ui/icons";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { btn } from "@/components/admin/ui/styles";
import { useToast } from "@/components/admin/ui/Toaster";
import { formatCLP } from "@/src/domain/money/money";
import { PAYMENT_METHOD_LABEL, type OfflineMethod } from "@/src/domain/money/payment-method";
import { waLink } from "@/lib/whatsapp";

const METHODS: ChoiceOption<OfflineMethod>[] = [
  { value: "transferencia", label: PAYMENT_METHOD_LABEL.transferencia },
  { value: "efectivo", label: PAYMENT_METHOD_LABEL.efectivo },
];

/**
 * Liquidación de una reserva pendiente (orden `pending_payment`): marcar pagado
 * offline (efectivo/transferencia → `confirm_payment`) o compartir un link de
 * Mercado Pago (`createPreferenceForOrder` → el webhook confirma al pagarse).
 * Ambos caminos convergen en `confirm_payment`, que es idempotente — gana el
 * primero que confirma, sin doble boleta si el otro camino llega después.
 */
export function CobroPendiente({
  reservationId,
  amount,
  customerPhone,
}: {
  reservationId: string;
  amount: number;
  customerPhone: string | null;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<OfflineMethod>("transferencia");
  const [link, setLink] = useState<{ initPoint: string; amount: number; firmed: boolean } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generateLink = () => {
    setLinkError(null);
    startTransition(async () => {
      const res = await sharePaymentLinkAction(reservationId);
      if (!res.ok) {
        setLinkError(res.error);
        toast({ tone: "error", message: res.error });
        return;
      }
      setLink(res.data);
      toast({ tone: "ok", message: "Link de pago generado." });
    });
  };

  const waMsg = link
    ? `Hola, tu reserva en FOTF Studios quedó pendiente de pago. Total ${formatCLP(link.amount)}. Puedes pagarla aquí: ${link.initPoint}`
    : "";
  const waHref = link && customerPhone ? waLink(customerPhone, waMsg) : null;

  return (
    <div className="flex flex-col gap-6">
      <ActionForm action={markPaidOfflineAction} success="Pago registrado.">
        <input type="hidden" name="reservationId" value={reservationId} />
        {/* Los radios nativos de Choice viajan en el form como `method`. */}
        <Choice name="method" legend="Marcar pagado · método" options={METHODS} value={method} onChange={setMethod} />
        <div className="mt-3">
          <SubmitButton size="sm">Marcar pagado</SubmitButton>
        </div>
      </ActionForm>

      <div className="border-t hairline pt-5">
        <span className="label-sm text-bone-quiet">Link de pago</span>
        {link ? (
          <div className="mt-2.5 flex flex-col gap-2.5">
            <p className="text-sm leading-relaxed text-bone-dim">
              Cobro de <strong className="text-bone">{formatCLP(link.amount)}</strong> generado (vence en 72 h).
              {link.firmed && " El horario queda reservado esas 72 h aunque el cliente no pague de inmediato."}
            </p>
            <a href={link.initPoint} target="_blank" rel="noreferrer" className={btn("secondary", "sm")}>
              <Icon name="external" size={14} /> Abrir link de pago
            </a>
            {waHref ? (
              <a href={waHref} target="_blank" rel="noreferrer" className={btn("secondary", "sm")}>
                <Icon name="whatsapp" size={14} /> Enviar por WhatsApp
              </a>
            ) : (
              <div className="flex items-center gap-2">
                <p className="label-sm text-bone-quiet">Sin teléfono del cliente; copia el link.</p>
                <CopyButton value={link.initPoint} />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2.5">
            <p className="text-sm leading-relaxed text-bone-dim">
              Comparte un link de Mercado Pago por <strong className="text-bone">{formatCLP(amount)}</strong>.
            </p>
            <button type="button" onClick={generateLink} disabled={pending} className={`${btn("secondary", "sm")} mt-3`}>
              {pending ? "Generando…" : "Generar link de pago"}
            </button>
            {linkError && <p className="mt-2 label-sm text-sirena">{linkError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
