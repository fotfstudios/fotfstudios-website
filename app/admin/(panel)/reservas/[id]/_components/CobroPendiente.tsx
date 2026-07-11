"use client";

import { useState, useTransition } from "react";
import { markPaidOfflineAction, sharePaymentLinkAction } from "../actions";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { Icon } from "@/components/admin/ui/icons";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { btn } from "@/components/admin/ui/styles";
import { useToast } from "@/components/admin/ui/Toaster";
import { formatCLP } from "@/src/domain/money/money";
import { waLink } from "@/lib/whatsapp";

type OfflineMethod = "efectivo" | "transferencia";

const METHODS: { key: OfflineMethod; label: string }[] = [
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transferencia" },
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
  const [method, setMethod] = useState<OfflineMethod>("efectivo");
  const [link, setLink] = useState<{ initPoint: string; amount: number } | null>(null);
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
        <input type="hidden" name="method" value={method} />
        <span className="label-sm text-bone-mute">Marcar pagado</span>
        <div role="radiogroup" aria-label="Método de pago" className="mt-2 grid grid-cols-2 border hairline">
          {METHODS.map((m, i) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={method === m.key}
              onClick={() => setMethod(m.key)}
              className={`px-3 py-2.5 text-center font-mono text-xs font-medium uppercase tracking-[0.06em] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-gold ${
                i > 0 ? "border-l hairline" : ""
              } ${method === m.key ? "bg-gold text-ink" : "text-bone-dim hover:text-gold"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <SubmitButton size="sm">Marcar pagado</SubmitButton>
        </div>
      </ActionForm>

      <div className="border-t hairline pt-5">
        <span className="label-sm text-bone-mute">Link de pago</span>
        {link ? (
          <div className="mt-2.5 flex flex-col gap-2.5">
            <p className="text-sm leading-relaxed text-bone-dim">
              Cobro de <strong className="text-bone">{formatCLP(link.amount)}</strong> generado (vence en 72 h).
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
                <p className="label-sm text-bone-mute">Sin teléfono del cliente; copia el link.</p>
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
