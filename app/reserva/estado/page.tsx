import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EstadoClient from "@/components/booking/EstadoClient";
import { buildConfirmationView, isUpcoming } from "@/lib/confirmation";
import { bookingEnabled, orderConfirmation } from "@/src/composition";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estado de tu reserva — FOTF Studios",
  robots: { index: false },
};

/**
 * Página de retorno post-pago (back_urls de MP apuntan aquí en success/pending/
 * failure). Los detalles del recibo se leen en el SERVIDOR (sin email/teléfono:
 * la URL es compartible); el estado en vivo lo maneja la isla cliente contra el
 * endpoint liviano de estado. Los query params de MP se ignoran a propósito:
 * la verdad es la orden en nuestra DB.
 */
export default async function EstadoPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string }>;
}) {
  if (!bookingEnabled()) notFound();
  const { b } = await searchParams;
  if (!b) notFound();

  const order = await orderConfirmation(b).catch(() => null);
  if (!order) notFound();
  const view = buildConfirmationView(order);
  // En el servidor (force-dynamic): decide si mostrar "agregar al calendario".
  const sessionUpcoming = isUpcoming(order.endsAt);

  return (
    <main className="mx-auto max-w-2xl px-6 py-20 md:py-28">
      <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
        ← FOTF Studios
      </Link>
      <div className="mt-10">
        <EstadoClient
          orderId={b}
          initialStatus={order.orderStatus}
          view={view}
          sessionUpcoming={sessionUpcoming}
        />
      </div>
    </main>
  );
}
