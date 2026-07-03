import type { ReactNode } from "react";
import Link from "next/link";
import { whatsappLink } from "@/lib/site";

/**
 * ¿Está habilitada la reserva en línea? Flag público (build-time), disponible en
 * server y client. Cuando está apagado, los CTA caen a WhatsApp (sin 404).
 */
export function bookingOnline(): boolean {
  return process.env.NEXT_PUBLIC_BOOKING_ENABLED === "true";
}

/**
 * CTA de reserva: lleva a `/reservar` (pagar en línea) cuando el flujo está
 * habilitado; si no, cae al WhatsApp de siempre (con mensaje opcional).
 */
export function BookingCta({
  className,
  children,
  waMessage,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  waMessage?: string;
  onClick?: () => void;
}) {
  if (bookingOnline()) {
    return (
      <Link href="/reservar" className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={whatsappLink(waMessage)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
