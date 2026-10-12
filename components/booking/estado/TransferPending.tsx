"use client";

import Link from "next/link";
import { useState } from "react";
import { dsButtonClass } from "@/components/ds/Button";
import WhatsAppCta from "@/components/WhatsAppCta";
import type { ConfirmationView } from "@/lib/confirmation";
import { TRANSFER } from "@/lib/site";
import { formatCLP } from "@/src/domain/money/money";
import SessionCard from "./SessionCard";
import StatusHeader from "./StatusHeader";

/** Mismas etiquetas y orden que el bloque del correo (templates.ts transferLines): pegable en el banco. */
const FIELDS: [string, string][] = [
  ["Nombre", TRANSFER.holder],
  ["RUT", TRANSFER.rut],
  ["Banco", TRANSFER.bank],
  ["Tipo de cuenta", TRANSFER.accountType],
  ["Número de cuenta", TRANSFER.accountNumber],
  ["Correo", TRANSFER.email],
];

const WHEN = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const fmt = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : null);

/**
 * /reserva/estado de un pedido del checkout público que se paga por transferencia (respaldo
 * si Mercado Pago falla). Antes del aviso: datos para pegar en el banco, monto, plazo y "Ya
 * transferí". Después: "Recibimos tu aviso" — el dueño verifica y la marca pagada; ahí el
 * sondeo de la isla pasa la página a "confirmada" sola.
 */
export default function TransferPending({
  orderId,
  view,
  number,
  amount,
  holdExpiresAt,
  declaredAt,
}: {
  orderId: string;
  view: ConfirmationView;
  number: string;
  amount: number;
  holdExpiresAt: string | null;
  declaredAt: string | null;
}) {
  const [declared, setDeclared] = useState(declaredAt !== null);
  const [holdUntil, setHoldUntil] = useState(holdExpiresAt);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const total = formatCLP(amount);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      // Sin permiso de portapapeles: el texto sigue visible y seleccionable.
    }
  };

  const declare = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await fetch(`/api/orders/${orderId}/transfer`, { method: "POST" });
      const d = (await r.json()) as { result?: string; holdUntil?: string | null };
      if (d.result === "ok" || d.result === "already") {
        setDeclared(true);
        if (d.holdUntil) setHoldUntil(d.holdUntil);
      } else if (d.result === "expired") {
        setError("El plazo para transferir ya venció y el horario se liberó. Si ya transferiste, escríbenos.");
      } else {
        setError("No pudimos registrar tu aviso. Inténtalo de nuevo o escríbenos por WhatsApp.");
      }
    } catch {
      setError("No pudimos registrar tu aviso. Inténtalo de nuevo o escríbenos por WhatsApp.");
    } finally {
      setSending(false);
    }
  };

  const waMsg = `Hola FOTF Studios. Transferí ${total} por la reserva N° ${number}${view.when ? ` (${view.when})` : ""}. Te mando el comprobante.`;

  if (declared) {
    return (
      <>
        <StatusHeader badge="Verificando transferencia" tone="gold" title="Recibimos tu aviso">
          Confirmamos tu reserva apenas veamos la transferencia y te llega un correo.
          {fmt(holdUntil) && <> Tu horario queda apartado hasta el {fmt(holdUntil)}.</>}
        </StatusHeader>
        <SessionCard view={view} number={number} totalTitle="Total transferido" />
        <div className="flex flex-wrap items-center gap-3">
          <WhatsAppCta source="estado-transferencia" waMessage={waMsg} className={dsButtonClass({ variant: "secondary" })}>
            Enviar comprobante por WhatsApp
          </WhatsAppCta>
        </div>
      </>
    );
  }

  const block = FIELDS.map(([k, v]) => `${k}: ${v}`).join("\n");

  return (
    <>
      <StatusHeader badge="Pago por transferencia" tone="gold" title="Transfiere para confirmar">
        {fmt(holdExpiresAt) ? (
          <>
            Tu horario está apartado hasta el <strong>{fmt(holdExpiresAt)}</strong>. Si no recibimos la transferencia
            antes, se libera.
          </>
        ) : (
          "Tu horario está apartado mientras transfieres."
        )}
      </StatusHeader>

      <section className="ds-card flex flex-col gap-4 p-5" aria-labelledby="tr-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="tr-title" className="text-[15px] font-medium">
            Datos para transferir
          </h2>
          <button type="button" onClick={() => void copy("all", block)} className={dsButtonClass({ variant: "secondary", size: "sm" })}>
            {copied === "all" ? "Copiado" : "Copiar todo"}
          </button>
        </div>
        <dl className="flex flex-col divide-y divide-[var(--border-subtle)]">
          {FIELDS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="ds-mono text-xs text-[var(--text-muted)]">{k}</dt>
              <dd className="flex items-center gap-2 text-right text-sm">
                <span className="select-all">{v}</span>
                <button
                  type="button"
                  onClick={() => void copy(k, v)}
                  className="ds-mono text-[11px] text-[var(--accent)] underline-offset-4 hover:underline"
                  aria-label={`Copiar ${k}`}
                >
                  {copied === k ? "Copiado" : "Copiar"}
                </button>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 pt-3">
            <dt className="text-sm font-medium">Monto a transferir</dt>
            <dd className="flex items-center gap-2 text-right">
              <span className="text-lg font-semibold">{total}</span>
              <button
                type="button"
                onClick={() => void copy("monto", String(amount))}
                className="ds-mono text-[11px] text-[var(--accent)] underline-offset-4 hover:underline"
                aria-label="Copiar monto"
              >
                {copied === "monto" ? "Copiado" : "Copiar"}
              </button>
            </dd>
          </div>
        </dl>
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Agrega el destinatario con estos datos, transfiere el monto exacto y avísanos. Confirmamos tu reserva al ver la
          transferencia.
        </p>
      </section>

      <SessionCard view={view} number={number} totalTitle="Total a transferir" />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void declare()} disabled={sending} className={dsButtonClass({ variant: "primary" })}>
            {sending ? "Enviando…" : "Ya transferí"}
          </button>
          <Link href="/reservar" className={dsButtonClass({ variant: "ghost" })}>
            Elegir otro horario
          </Link>
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
