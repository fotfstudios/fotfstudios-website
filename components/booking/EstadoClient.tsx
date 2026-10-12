"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CalendarButtons from "@/components/booking/CalendarButtons";
import { dsButtonClass } from "@/components/ds/Button";
import WhatsAppCta from "@/components/WhatsAppCta";
import { trackPurchase } from "@/lib/analytics";
import { ROOM_ITEM } from "@/lib/booking-items";
import { markPurchaseTracked, purchaseTracked, startedCheckout } from "@/lib/checkout-session";
import { orderShort, type ConfirmationView } from "@/lib/confirmation";
import ActivateAccountCard from "./estado/ActivateAccountCard";
import HelpRow from "./estado/HelpRow";
import NextSteps from "./estado/NextSteps";
import SessionCard from "./estado/SessionCard";
import StatusHeader from "./estado/StatusHeader";
import TransferPending from "./estado/TransferPending";
import { isFreshPurchase, resolveEstadoUi } from "@/lib/estado-ui";
import { nextPollDelay } from "@/lib/estado-polling";
import type { OrderConfirmation } from "@/src/application/ports/orders";

type OrderStatus = OrderConfirmation["orderStatus"];
type ReservationStatus = OrderConfirmation["reservationStatus"];

/** Estados que ya no cambian: cero polling (ni un fetch si el server llegó así). */
const TERMINAL = new Set<OrderStatus>(["paid", "fulfilled", "cancelled", "refunded"]);

/**
 * Isla cliente de /reserva/estado. Los datos del recibo llegan del servidor
 * (props); aquí solo vive el flip de estado en vivo: polling acotado
 * (lib/estado-polling.ts) al endpoint liviano de estado (que reconcilia contra MP
 * bajo demanda) hasta llegar a un estado terminal o a que ya no haya nada que
 * esperar (hold vencido). Errores de fetch mantienen "Confirmando…".
 */
export default function EstadoClient({
  orderId,
  initialStatus,
  view,
  sessionUpcoming,
  paymentHint,
  holdExpiresAt,
  manageHref = null,
  showActivate = false,
  amount,
  transfer = null,
}: {
  orderId: string;
  initialStatus: OrderStatus;
  view: ConfirmationView;
  /** Calculado en el servidor (page force-dynamic): la sesión aún no termina. */
  sessionUpcoming: boolean;
  /** Pista de MP en la URL (solo mensajería): "approved" → probablemente pagó. */
  paymentHint: "approved" | "none";
  /** Vencimiento del hold (ISO) — acota el sondeo; null en hold firme. */
  holdExpiresAt: string | null;
  /** Gestionar la reserva (/cuenta/reservas) cuando hay cuentas; null si no. */
  manageHref?: string | null;
  /** Invitado (sin sesión) y cuentas activas: invitarlo a activar la cuenta. */
  showActivate?: boolean;
  /** Efectivo cobrado (orders.amount_clp, numérico) — el value de `purchase`. */
  amount: number;
  /** Pago por transferencia (respaldo del checkout); null si va por Mercado Pago. */
  transfer?: OrderConfirmation["transfer"];
}) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [reservation, setReservation] = useState<ReservationStatus>(view.reservationStatus);
  // Último estado conocido para la política de sondeo (evita closures rancios en el bucle).
  const latest = useRef<{ order: OrderStatus; reservation: ReservationStatus }>({
    order: initialStatus,
    reservation: view.reservationStatus,
  });
  const [startedAt] = useState(() => Date.now());
  // La pista "approved" caduca a los 30 s sin confirmación real: si el pago no
  // aparece (param falsificado/rancio o backend lento), degrada a "Completa tu
  // pago" en vez de un "Confirmando…" infinito. El polling sigue igual.
  const [hintExpired, setHintExpired] = useState(false);
  useEffect(() => {
    if (paymentHint !== "approved" || TERMINAL.has(initialStatus)) return;
    const t = setTimeout(() => setHintExpired(true), 30_000);
    return () => clearTimeout(t);
  }, [paymentHint, initialStatus]);

  // Sondeo acotado (lib/estado-polling.ts): rápido 2 min, lento después, y se corta cuando
  // la orden es terminal, la reserva venció, o pasó el vencimiento del hold (+2 min).
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const delay = nextPollDelay({
        orderStatus: latest.current.order,
        reservationStatus: latest.current.reservation,
        holdExpiresAt,
        approvedHint: paymentHint === "approved",
        startedAt,
        now: Date.now(),
      });
      if (delay !== null) timer = setTimeout(load, delay);
    };
    const load = async () => {
      try {
        const r = await fetch(`/api/orders/${orderId}/status`);
        const d = await r.json();
        if (!active) return;
        if (d?.status) {
          latest.current.order = d.status as OrderStatus;
          setStatus(d.status as OrderStatus);
        }
        if (d?.reservation) {
          latest.current.reservation = d.reservation as ReservationStatus;
          setReservation(d.reservation as ReservationStatus);
        }
      } catch {
        // Red caída o similar: seguimos y reintentamos con la misma política.
      }
      if (active) schedule();
    };
    // Primer poll inmediato (un pago recién aprobado se confirma sin esperar 3 s), salvo
    // que ya no haya nada que esperar.
    const first = nextPollDelay({
      orderStatus: latest.current.order,
      reservationStatus: latest.current.reservation,
      holdExpiresAt,
      approvedHint: paymentHint === "approved",
      startedAt,
      now: Date.now(),
    });
    if (first !== null) void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
    // Solo al montar: el bucle se re-programa solo con `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Medición: purchase UNA vez, cuando el pago está confirmado de verdad (nunca por el
  // ?status=approved de MP, que es falsificable). Ver isFreshPurchase.
  useEffect(() => {
    const started = startedCheckout(orderId);
    if (
      !isFreshPurchase({
        status,
        initialStatus,
        checkoutStartedHere: started !== null,
        alreadyTracked: purchaseTracked(orderId),
      })
    ) {
      return;
    }
    markPurchaseTracked(orderId);
    trackPurchase({
      orderId,
      value: amount,
      items: started?.items.length ? started.items : [{ ...ROOM_ITEM, price: amount, quantity: 1 }],
      paymentType: started?.paymentType ?? (transfer ? "transferencia" : "mercadopago"),
    });
  }, [status, initialStatus, orderId, amount, transfer]);

  const ui = resolveEstadoUi(status, reservation, paymentHint, hintExpired, transfer !== null);
  const number = orderShort(orderId);

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      {ui === "confirmed" && (
        <Confirmed
          orderId={orderId}
          number={number}
          view={view}
          sessionUpcoming={sessionUpcoming}
          manageHref={manageHref}
          showActivate={showActivate}
        />
      )}
      {ui === "paid_no_hold" && <PaidNoHold />}
      {ui === "failed" && <Failed />}
      {ui === "refunded" && <Refunded />}
      {ui === "confirming" && <Confirming view={view} number={number} />}
      {ui === "expired" && <ExpiredHold />}
      {ui === "pending_payment" && <PendingPayment view={view} number={number} />}
      {ui === "transfer" && (
        <TransferPending
          orderId={orderId}
          view={view}
          number={number}
          amount={amount}
          holdExpiresAt={holdExpiresAt}
          declaredAt={transfer?.declaredAt ?? null}
        />
      )}
    </div>
  );
}

const primary = dsButtonClass({ variant: "primary" });
const ghost = dsButtonClass({ variant: "ghost" });

/* ── Estado: pagado / cumplido ─────────────────────────────────────────── */

function Confirmed({
  orderId,
  number,
  view,
  sessionUpcoming,
  manageHref,
  showActivate,
}: {
  orderId: string;
  number: string;
  view: ConfirmationView;
  sessionUpcoming: boolean;
  manageHref: string | null;
  showActivate: boolean;
}) {
  const waMsg = view.when ? `Hola FOTF Studios. Tengo una reserva confirmada para el ${view.when}.` : undefined;
  const startShort = view.dateLong && view.timeRange ? `${view.dateLong.slice(0, 3).toUpperCase()} ${view.timeRange.slice(0, 5)}` : null;

  return (
    <>
      <StatusHeader badge="Pago recibido · reserva confirmada" tone="live" confirmed title={view.firstName ? `¡Listo, ${view.firstName}!` : "¡Reserva confirmada!"}>
        La cabina es tuya. Te enviamos el comprobante a tu correo.
      </StatusHeader>
      <SessionCard
        view={view}
        number={number}
        totalTitle="Total pagado"
        actions={
          <>
            <button type="button" onClick={() => window.print()} className={dsButtonClass({ variant: "secondary", size: "sm" })}>
              Guardar comprobante (PDF)
            </button>
            {sessionUpcoming && view.startsAt && view.endsAt && (
              <CalendarButtons orderId={orderId} startsAt={view.startsAt} endsAt={view.endsAt} resourceName={view.resourceName} />
            )}
          </>
        }
      />
      <NextSteps startShort={startShort} />
      {showActivate && <ActivateAccountCard />}
      <HelpRow source="estado-confirmado" waMessage={waMsg} manageHref={manageHref} />
    </>
  );
}

/* ── Estado: confirmando (volvió de MP con approved; esperando la confirmación real) ── */

function Confirming({ view, number }: { view: ConfirmationView; number: string }) {
  return (
    <>
      <StatusHeader badge="Procesando" tone="gold" title="Confirmando tu pago…">
        Esto puede tomar unos segundos. No cierres esta página.
      </StatusHeader>
      <SessionCard view={view} number={number} totalTitle="Total" skeleton />
    </>
  );
}

/* ── Estado: pago pendiente (checkout abandonado / rechazado / visita directa) ── */

function PendingPayment({ view, number }: { view: ConfirmationView; number: string }) {
  return (
    <>
      <StatusHeader badge="Pago pendiente" tone="gold" title="Completa tu pago">
        Tu horario está reservado por unos minutos mientras completas el pago. Si no se completa, el horario se
        libera.
      </StatusHeader>
      <SessionCard view={view} number={number} totalTitle="Total a pagar" />
      <div className="flex flex-wrap items-center gap-3">
        {view.resumeUrl && (
          <a href={view.resumeUrl} className={primary}>
            Completar el pago
          </a>
        )}
        <Link href="/reservar" className={ghost}>
          Elegir otro horario
        </Link>
      </div>
    </>
  );
}

/* ── Estado: reserva expirada sin pago ─────────────────────────────────── */

function ExpiredHold() {
  return (
    <>
      <StatusHeader badge="Reserva expirada" tone="neutral" title="Tu reserva expiró">
        El horario se liberó porque el pago no se completó a tiempo. No se realizó ningún cobro. Puedes reservar de
        nuevo.
      </StatusHeader>
      <div>
        <Link href="/reservar" className={primary}>
          Volver a reservar
        </Link>
      </div>
    </>
  );
}

/* ── Estado: pago no completado ────────────────────────────────────────── */

function Failed() {
  return (
    <>
      <StatusHeader badge="Pago no completado" tone="danger" title="El pago no se completó">
        No se realizó ningún cobro. Puedes intentarlo de nuevo cuando quieras.
      </StatusHeader>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/reservar" className={primary}>
          Volver a reservar
        </Link>
        <WhatsAppCta
          source="estado-fallido"
          waMessage="Hola FOTF Studios. Tuve un problema con el pago de mi reserva."
          className={ghost}
        >
          ¿Tuviste un problema? Escríbenos
        </WhatsAppCta>
      </div>
    </>
  );
}

/* ── Estado: pago devuelto ─────────────────────────────────────────────── */

function Refunded() {
  return (
    <>
      <StatusHeader badge="Pago devuelto" tone="neutral" title="Tu pago fue devuelto">
        Esta reserva se canceló y el pago fue devuelto. Si tienes dudas, escríbenos.
      </StatusHeader>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/reservar" className={primary}>
          Volver a reservar
        </Link>
        <WhatsAppCta
          source="estado-devuelto"
          waMessage="Hola FOTF Studios. Tengo una consulta sobre un pago devuelto."
          className={ghost}
        >
          Escríbenos por WhatsApp
        </WhatsAppCta>
      </div>
    </>
  );
}

/* ── Estado: pago recibido, pero el cupo ya se había liberado (paid_no_hold) ── */

function PaidNoHold() {
  return (
    <>
      <StatusHeader badge="Pago recibido" tone="gold" title="Recibimos tu pago">
        El horario se había liberado antes de que llegara el pago. Te escribimos para reagendar o devolverte el monto
        — no tienes que hacer nada.
      </StatusHeader>
      <div>
        <WhatsAppCta
          source="estado-pago-sin-cupo"
          waMessage="Hola FOTF Studios. Pagué una reserva pero el horario ya se había liberado."
          className={primary}
        >
          Escríbenos por WhatsApp
        </WhatsAppCta>
      </div>
    </>
  );
}
