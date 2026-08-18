"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { trackBookingCta } from "@/lib/analytics";
import { bookingOnline } from "@/lib/flags";
import { CLOSURE, whatsappLink } from "@/lib/site";

/**
 * CTA de reserva: lleva a `/reservar` (pagar en línea) cuando el flujo está
 * habilitado; si no, cae al WhatsApp de siempre (con mensaje opcional).
 * Es el clic más importante del sitio: emite `booking_cta_click` con `mode`
 * (online|whatsapp) y `placement` en ambas ramas.
 */
export function BookingCta({
  className,
  children,
  waMessage,
  placement,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  waMessage?: string;
  placement: string;
  onClick?: () => void;
}) {
  // Cierre temporal: un solo guard cubre los cuatro CTA (nav ×2, hero, cierre).
  // `<span>` en vez de `<button disabled>`: no es un control, solo estado.
  if (CLOSURE.active) {
    return (
      <span
        aria-disabled="true"
        title={CLOSURE.body}
        className={`${className ?? ""} cursor-not-allowed opacity-50`}
      >
        {CLOSURE.ctaLabel}
      </span>
    );
  }

  if (bookingOnline()) {
    return (
      <Link
        href="/reservar"
        className={className}
        onClick={() => {
          trackBookingCta("online", placement);
          onClick?.();
        }}
      >
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
      onClick={() => {
        trackBookingCta("whatsapp", placement);
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}
