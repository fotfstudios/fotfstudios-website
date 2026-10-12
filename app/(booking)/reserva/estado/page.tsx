import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import EstadoClient from "@/components/booking/EstadoClient";
import { dsFonts } from "@/components/ds/fonts";
import "@/components/ds/ds.css";
import { accountEnabled } from "@/lib/flags";
import { ESTADO_COOKIE, isOrderId } from "@/lib/estado-link";
import { currentCustomer } from "@/src/infrastructure/auth/require-customer";
import { buildConfirmationView, isUpcoming } from "@/lib/confirmation";
import { orderConfirmation } from "@/src/composition";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estado de tu reserva",
  robots: { index: false },
};

/**
 * Página de retorno post-pago (back_urls de MP apuntan aquí en success/pending/
 * failure). Los detalles del recibo se leen en el SERVIDOR (sin email/teléfono); el
 * estado en vivo lo maneja la isla cliente contra el endpoint liviano de estado. Los
 * query params de MP se ignoran a propósito: la verdad es la orden en nuestra DB.
 *
 * El id del pedido llega por la cookie que fija el middleware al limpiar `?b=` de la
 * URL (lib/estado-link.ts: así no lo lee el Pixel de Meta). `?b=` directo sigue
 * valiendo: un prefetch de /cuenta llega sin redirigir.
 *
 * NO va detrás de `bookingEnabled()`: los links de cobro del admin y el delta de
 * reagendamiento devuelven al comprador aquí aunque el checkout público esté apagado.
 */
export default async function EstadoPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; status?: string; collection_status?: string }>;
}) {
  const { b, status, collection_status } = await searchParams;
  const cookieId = (await cookies()).get(ESTADO_COOKIE)?.value;
  const orderId = isOrderId(b) ? b : isOrderId(cookieId) ? cookieId : null;
  if (!orderId) notFound();
  // PISTA de mensajería, jamás verdad: MP agrega ?status=approved al volver de un
  // pago real; sin esa pista ("Volver a la tienda", pago rechazado, visita directa)
  // un pedido pendiente se muestra como "Completa tu pago" en vez de "Confirmando…".
  // El estado real siempre sale de nuestra DB (el param es falsificable).
  const paymentHint: "approved" | "none" =
    status === "approved" || collection_status === "approved" ? "approved" : "none";

  const order = await orderConfirmation(orderId).catch(() => null);
  if (!order) notFound();
  const view = buildConfirmationView(order);
  // En el servidor (force-dynamic): decide si mostrar "agregar al calendario".
  const sessionUpcoming = isUpcoming(order.endsAt);

  // Cuentas: gestionar la reserva desde /cuenta; a un invitado se le invita a activarla.
  const accounts = accountEnabled();
  const session = accounts ? await currentCustomer().catch(() => null) : null;

  return (
    <div className={`fotf-ds ${dsFonts} min-h-screen`}>
      <main className="mx-auto w-full max-w-[760px] px-4 pt-10 pb-20 sm:px-10">
        <Link href="/" className="ds-mono ds-no-print text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]">
          ← FOTF Studios
        </Link>
        <div className="mt-10">
          <EstadoClient
            orderId={orderId}
            initialStatus={order.orderStatus}
            view={view}
            sessionUpcoming={sessionUpcoming}
            paymentHint={paymentHint}
            holdExpiresAt={order.holdExpiresAt}
            amount={order.total}
            manageHref={accounts ? "/cuenta/reservas" : null}
            showActivate={accounts && !session}
            transfer={order.transfer}
          />
        </div>
      </main>
    </div>
  );
}
