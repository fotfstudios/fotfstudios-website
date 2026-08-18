"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MaskText from "@/components/MaskText";
import Reveal from "@/components/Reveal";
import CalendarButtons from "@/components/booking/CalendarButtons";
import ReceiptCard from "@/components/booking/ReceiptCard";
import WhatsAppCta from "@/components/WhatsAppCta";
import type { ConfirmationView } from "@/lib/confirmation";
import { SITE } from "@/lib/site";
import type { OrderConfirmation } from "@/src/application/ports/orders";

type OrderStatus = OrderConfirmation["orderStatus"];

/** Estados que ya no cambian: cero polling (ni un fetch si el server llegó así). */
const TERMINAL = new Set<OrderStatus>(["paid", "fulfilled", "cancelled", "refunded"]);

/**
 * Isla cliente de /reserva/estado. Los datos del recibo llegan del servidor
 * (props); aquí solo vive el flip de estado en vivo: polling cada 3 s al
 * endpoint liviano de estado (que reconcilia contra MP bajo demanda) hasta
 * llegar a un estado terminal. Errores de fetch mantienen "Confirmando…".
 */
export default function EstadoClient({
  orderId,
  initialStatus,
  view,
  sessionUpcoming,
  paymentHint,
}: {
  orderId: string;
  initialStatus: OrderStatus;
  view: ConfirmationView;
  /** Calculado en el servidor (page force-dynamic): la sesión aún no termina. */
  sessionUpcoming: boolean;
  /** Pista de MP en la URL (solo mensajería): "approved" → probablemente pagó. */
  paymentHint: "approved" | "none";
}) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  // La pista "approved" caduca a los 30 s sin confirmación real: si el pago no
  // aparece (param falsificado/rancio o backend lento), degrada a "Completa tu
  // pago" en vez de un "Confirmando…" infinito. El polling sigue igual.
  const [hintExpired, setHintExpired] = useState(false);
  useEffect(() => {
    if (paymentHint !== "approved" || TERMINAL.has(initialStatus)) return;
    const t = setTimeout(() => setHintExpired(true), 30_000);
    return () => clearTimeout(t);
  }, [paymentHint, initialStatus]);

  useEffect(() => {
    if (TERMINAL.has(status)) return;
    let active = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/orders/${orderId}/status`);
        const d = await r.json();
        if (active && d?.status) setStatus(d.status as OrderStatus);
      } catch {
        // Red caída o similar: seguimos en "Confirmando…" y reintentamos.
      }
    };
    const id = setInterval(load, 3000);
    void load();
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [orderId, status]);

  const ui =
    status === "paid" || status === "fulfilled"
      ? "confirmed"
      : status === "cancelled"
        ? "failed"
        : status === "refunded"
          ? "refunded"
          : "pending";

  return (
    <section
      role="status"
      aria-live="polite"
      className="grain relative overflow-hidden border hairline bg-ink"
    >
      <div className="relative p-6 md:p-10">
        {ui === "confirmed" && (
          <Confirmed orderId={orderId} view={view} sessionUpcoming={sessionUpcoming} />
        )}
        {ui === "failed" && <Failed />}
        {ui === "refunded" && <Refunded />}
        {ui === "pending" &&
          (view.reservationStatus === "expired" ? (
            <ExpiredHold />
          ) : paymentHint === "approved" && !hintExpired ? (
            <Pending view={view} />
          ) : (
            <PendingPayment view={view} />
          ))}
      </div>
    </section>
  );
}

/* ── Estado: pagado / cumplido ─────────────────────────────────────────── */

function Confirmed({
  orderId,
  view,
  sessionUpcoming,
}: {
  orderId: string;
  view: ConfirmationView;
  sessionUpcoming: boolean;
}) {
  const waMsg = view.when
    ? `Hola FOTF Studios. Tengo una reserva confirmada para el ${view.when}.`
    : undefined;

  return (
    <div>
      <span className="label-sm text-gold">Reserva confirmada</span>
      {/* El momento tipográfico de la página; el resto queda quieto. */}
      <div className="mt-3" style={{ fontSize: "clamp(2.2rem,7vw,3.6rem)" }}>
        <MaskText
          as="h1"
          immediate
          lines={[view.firstName ? `¡Listo, ${view.firstName}!` : "¡Reserva confirmada!"]}
          className="block font-display text-bone"
        />
      </div>
      <p className="mt-3 font-editorial text-lg text-bone-dim">La cabina es tuya.</p>

      <Reveal className="mt-8">
        <ReceiptCard view={view} />
      </Reveal>

      <div className="mt-10">
        <span className="label-sm text-bone-mute">Qué sigue</span>
        <ol className="mt-4 space-y-4">
          <Step n="01">Te enviamos un email con el detalle de tu reserva.</Step>
          <Step n="02">
            Coordinaremos tu <strong className="text-bone">acceso por WhatsApp</strong> antes de tu
            sesión. Entras solo, sin esperar a nadie.
          </Step>
          <Step n="03">
            {SITE.address}.{" "}
            <a
              href={SITE.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-bone underline decoration-gold underline-offset-4 transition-colors hover:text-gold"
            >
              Ver en Google Maps →
            </a>
          </Step>
        </ol>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <WhatsAppCta
          source="estado-confirmado"
          waMessage={waMsg}
          className="inline-flex bg-gold px-6 py-3 label text-ink"
        >
          Escríbenos por WhatsApp →
        </WhatsAppCta>
        {sessionUpcoming && view.startsAt && view.endsAt && (
          <CalendarButtons
            orderId={orderId}
            startsAt={view.startsAt}
            endsAt={view.endsAt}
            resourceName={view.resourceName}
          />
        )}
      </div>
    </div>
  );
}

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 text-sm text-bone-dim">
      <span className="label-sm text-gold">{n}</span>
      <span className="flex-1">{children}</span>
    </li>
  );
}

/* ── Estado: pago no completado ────────────────────────────────────────── */

function Failed() {
  return (
    <div>
      <span className="label-sm text-sirena">Pago no completado</span>
      <h1
        className="mt-3 font-display text-bone"
        style={{ fontSize: "clamp(2.2rem,7vw,3.6rem)" }}
      >
        El pago no se completó
      </h1>
      <p className="mt-4 text-bone-dim">
        No se realizó ningún cobro. Puedes intentarlo de nuevo cuando quieras.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link href="/reservar" className="inline-flex bg-gold px-6 py-3 label text-ink">
          Volver a reservar →
        </Link>
        <WhatsAppCta
          source="estado-fallido"
          waMessage="Hola FOTF Studios. Tuve un problema con el pago de mi reserva."
          className="label-sm text-bone-dim transition-colors hover:text-gold"
        >
          ¿Tuviste un problema? Escríbenos por WhatsApp →
        </WhatsAppCta>
      </div>
    </div>
  );
}

/* ── Estado: pago devuelto ─────────────────────────────────────────────── */

function Refunded() {
  return (
    <div>
      <span className="label-sm text-bone-mute">Pago devuelto</span>
      <h1
        className="mt-3 font-display text-bone"
        style={{ fontSize: "clamp(2.2rem,7vw,3.6rem)" }}
      >
        Tu pago fue devuelto
      </h1>
      <p className="mt-4 text-bone-dim">
        Esta reserva se canceló y el pago fue devuelto. Si tienes dudas, escríbenos.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link href="/reservar" className="inline-flex bg-gold px-6 py-3 label text-ink">
          Volver a reservar →
        </Link>
        <WhatsAppCta
          source="estado-devuelto"
          waMessage="Hola FOTF Studios. Tengo una consulta sobre un pago devuelto."
          className="label-sm text-bone-dim transition-colors hover:text-gold"
        >
          Escríbenos por WhatsApp →
        </WhatsAppCta>
      </div>
    </div>
  );
}

/* ── Estado: pago pendiente (checkout abandonado / rechazado / visita directa) ── */

function PendingPayment({ view }: { view: ConfirmationView }) {
  return (
    <div>
      <span className="label-sm text-bone-mute">Pago pendiente</span>
      <h1
        className="mt-3 font-display text-bone"
        style={{ fontSize: "clamp(2.2rem,7vw,3.6rem)" }}
      >
        Completa tu pago
      </h1>
      <p className="mt-4 text-bone-dim">
        Tu horario está reservado por unos minutos mientras completas el pago. Si no se
        completa, el horario se libera.
      </p>
      {view.when && (
        <p className="mt-3 label-sm text-gold">
          {view.when}
          {view.timeRange ? ` · ${view.timeRange}` : ""}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        {view.resumeUrl && (
          <a href={view.resumeUrl} className="inline-flex bg-gold px-6 py-3 label text-ink">
            Completar el pago →
          </a>
        )}
        <Link
          href="/reservar"
          className="label-sm text-bone-dim transition-colors hover:text-gold"
        >
          Elegir otro horario →
        </Link>
      </div>
    </div>
  );
}

/* ── Estado: reserva expirada sin pago ─────────────────────────────────── */

function ExpiredHold() {
  return (
    <div>
      <span className="label-sm text-bone-mute">Reserva expirada</span>
      <h1
        className="mt-3 font-display text-bone"
        style={{ fontSize: "clamp(2.2rem,7vw,3.6rem)" }}
      >
        Tu reserva expiró
      </h1>
      <p className="mt-4 text-bone-dim">
        El horario se liberó porque el pago no se completó a tiempo. No se realizó ningún
        cobro. Puedes reservar de nuevo.
      </p>
      <div className="mt-8">
        <Link href="/reservar" className="inline-flex bg-gold px-6 py-3 label text-ink">
          Volver a reservar →
        </Link>
      </div>
    </div>
  );
}

/* ── Estado: confirmando ───────────────────────────────────────────────── */

function Pending({ view }: { view: ConfirmationView }) {
  return (
    <div>
      <span className="label-sm text-bone-mute">Procesando</span>
      <h1
        className="mt-3 font-display text-bone"
        style={{ fontSize: "clamp(2.2rem,7vw,3.6rem)" }}
      >
        Confirmando tu pago…
      </h1>
      <p className="mt-4 text-bone-dim">Esto puede tomar unos segundos. No cierres esta página.</p>
      <div className="mt-8">
        <ReceiptCard view={view} skeleton />
      </div>
    </div>
  );
}
