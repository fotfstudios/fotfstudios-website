import type { ReactNode } from "react";
import Link from "next/link";
import Checkbox from "@/components/ds/Checkbox";
import Faders from "@/components/ds/Faders";
import { formatCLP } from "@/src/domain/money/money";
import { TRANSFER_WINDOW_HOURS } from "@/src/domain/checkout/transfer";
import SectionHead from "./SectionHead";

export type PayMethod = "mercadopago" | "transferencia";

/**
 * 04 Pago: Beatcoins del cliente con sesión (canje), cómo se paga el resto (Mercado Pago o
 * nada si los Beatcoins cubren el total) y la aceptación de términos. Con el respaldo de
 * transferencia prendido (admin), el resto se puede pagar también por transferencia.
 */
export default function PaySection({
  n,
  title,
  fullPoints,
  acceptedTerms,
  onAcceptedTerms,
  termsError,
  beatcoins,
  pointsApplied = 0,
  transfer = null,
}: {
  n?: string;
  title: string;
  fullPoints: boolean;
  acceptedTerms: boolean;
  onAcceptedTerms: (v: boolean) => void;
  termsError: boolean;
  /** Bloque de Beatcoins (solo con sesión). */
  beatcoins?: ReactNode;
  /** Beatcoins aplicados (para decir que el resto va por Mercado Pago). */
  pointsApplied?: number;
  /** Respaldo de transferencia prendido: la elección de medio. null = solo Mercado Pago. */
  transfer?: {
    method: PayMethod;
    onMethod: (m: PayMethod) => void;
    /** Hay horario y empieza con ≥ 3 h de anticipación (la DB vuelve a validarlo). */
    allowed: boolean;
  } | null;
}) {
  const viaTransfer = transfer?.method === "transferencia";
  const rest = viaTransfer ? "por transferencia" : "en Mercado Pago";
  return (
    <section className="flex flex-col gap-3.5" aria-labelledby="bk-pay-title">
      <SectionHead id="bk-pay-title" n={n} title={title}>
        {fullPoints
          ? "Tus Beatcoins cubren el total: no hay paso de pago."
          : pointsApplied > 0
            ? `Usas ${formatCLP(pointsApplied)} en Beatcoins y pagas el resto ${rest}.`
            : viaTransfer
              ? "Reservas ahora y transfieres: confirmamos al ver la transferencia."
              : "Pagas en Mercado Pago y vuelves aquí con la reserva confirmada."}
      </SectionHead>
      {beatcoins}
      {fullPoints ? (
        <div className="ds-card flex max-w-[760px] items-center gap-4 p-5">
          <Faders size={36} color="var(--gold)" />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-medium">Tus Beatcoins cubren el total</span>
            <span className="text-[13px] text-[var(--text-muted)]">Sin paso de pago. Tu reserva queda confirmada al instante.</span>
          </span>
        </div>
      ) : transfer ? (
        <div role="radiogroup" aria-label="Medio de pago" className="flex max-w-[760px] flex-col gap-2">
          <label className="ds-option ds-option--stack">
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="bk-pay"
                className="ds-sr-input"
                checked={transfer.method === "mercadopago"}
                onChange={() => transfer.onMethod("mercadopago")}
              />
              <span className="ds-option-mark ds-option-mark--radio" aria-hidden="true" />
              <span className="text-[15px] font-medium">Mercado Pago</span>
            </span>
            <span className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
              Débito, crédito, cuotas o saldo de Mercado Pago. Vuelves aquí con la reserva confirmada.
            </span>
          </label>
          <label className="ds-option ds-option--stack">
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="bk-pay"
                className="ds-sr-input"
                checked={transfer.method === "transferencia"}
                disabled={!transfer.allowed}
                onChange={() => transfer.onMethod("transferencia")}
              />
              <span className="ds-option-mark ds-option-mark--radio" aria-hidden="true" />
              <span className="text-[15px] font-medium">Transferencia bancaria</span>
            </span>
            <span className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {transfer.allowed
                ? `Te mostramos los datos al reservar. Tu horario queda apartado ${TRANSFER_WINDOW_HOURS} horas y se confirma cuando veamos la transferencia.`
                : "Disponible para horarios que empiezan en 3 horas o más."}
            </span>
          </label>
        </div>
      ) : (
        <div className="ds-card flex max-w-[760px] flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-medium">Mercado Pago</span>
            <span className="ds-mono flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Pago seguro
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Débito, crédito, cuotas o saldo de Mercado Pago. Tu horario se aparta recién al tocar pagar y vuelves aquí con
            la reserva confirmada. No vemos ni guardamos tu tarjeta.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Checkbox
          id="bk-terms"
          checked={acceptedTerms}
          aria-invalid={termsError ? true : undefined}
          onChange={(e) => onAcceptedTerms(e.target.checked)}
        >
          Acepto los{" "}
          <Link href="/terminos" target="_blank" className="text-[var(--accent)] underline-offset-4 hover:underline">
            términos y condiciones
          </Link>{" "}
          y la{" "}
          <Link href="/privacidad" target="_blank" className="text-[var(--accent)] underline-offset-4 hover:underline">
            política de privacidad
          </Link>
          .
        </Checkbox>
        {termsError && <span className="text-xs text-[var(--danger)]">Acepta los términos para reservar.</span>}
      </div>
    </section>
  );
}
