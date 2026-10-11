"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeEmail } from "@/src/domain/contact/contact";
import { FIRST_BOOKING_PROMO, firstBookingDiscountInput } from "@/src/domain/pricing/first-booking-promo";
import { applyManualDiscount } from "@/src/domain/pricing/manual-discount";

export interface QuoteResult {
  total: number;
  net: number;
  roomSubtotal: number;
  tierLines: { key: string; hours: number; rate: number; subtotal: number }[];
  addonLines: { key: string; name: string; amount: number }[];
  adjust: { description: string; amount: number } | null;
}

/**
 * Cotización de la selección actual + promo de primera reserva.
 *
 * - Cotiza contra `/api/pricing/quote` cuando hay fecha e inicio válidos; sin ellos, null.
 * - La elegibilidad de la promo es por correo (no por horario): se consulta con debounce al
 *   cambiar el correo válido y se recuerda por sesión de página; una respuesta fallida
 *   queda "desconocida" (sin fila ni nota) hasta que cambie el correo.
 * - La promo se previsualiza con la MISMA función pura que aplica el servidor: el total
 *   mostrado es el que se cobra.
 * - `requote()` tras un 409 `amount_changed`: olvida la elegibilidad de este correo y
 *   vuelve a cotizar, así el resumen se corrige solo antes del reintento.
 */
export function useBookingQuote({
  resourceId,
  date,
  start,
  duration,
  addonKeys,
  email,
}: {
  resourceId: string;
  date: string | null;
  start: number | null;
  duration: number;
  addonKeys: string[];
  email: string;
}) {
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  // Sube para re-cotizar sin cambiar la selección.
  const [nonce, setNonce] = useState(0);
  const [promoCache, setPromoCache] = useState<Record<string, boolean>>({});
  // Clave estable para el efecto: el arreglo cambia de identidad en cada render.
  const addons = addonKeys.join(",");

  useEffect(() => {
    let active = true;
    void (async () => {
      if (date === null || start === null) {
        if (active) setQuote(null);
        return;
      }
      const qs = new URLSearchParams({
        resource: resourceId,
        date,
        start: String(start),
        duration: String(duration),
        addons,
      });
      try {
        const d = await (await fetch(`/api/pricing/quote?${qs}`)).json();
        if (active) setQuote(d?.error ? null : d);
      } catch {
        if (active) setQuote(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [resourceId, date, start, duration, addons, nonce]);

  const promoEmail = FIRST_BOOKING_PROMO.enabled ? normalizeEmail(email) : null;
  const promoEligible: boolean | null = promoEmail ? (promoCache[promoEmail] ?? null) : null;
  const promoKnown = promoEmail === null || promoEligible !== null;
  useEffect(() => {
    if (!promoEmail || promoKnown) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/promos/first-booking?email=${encodeURIComponent(promoEmail)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const d = (await res.json()) as { eligible?: boolean };
        setPromoCache((c) => ({ ...c, [promoEmail]: d.eligible === true }));
      } catch {
        // abortado o sin red: queda desconocida
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [promoEmail, promoKnown]);

  const promo =
    FIRST_BOOKING_PROMO.enabled && promoEligible && quote ? applyManualDiscount(quote, firstBookingDiscountInput()) : null;
  const promoLine = promo?.ok ? promo.value : null;
  const total = quote ? quote.total - (promoLine?.amount ?? 0) : null;

  const requote = useCallback(() => {
    if (promoEmail) setPromoCache((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== promoEmail)));
    setNonce((n) => n + 1);
  }, [promoEmail]);

  return {
    quote,
    /** Hay inicio elegido pero la cotización aún no llega (skeleton). */
    quoting: start !== null && !quote,
    promoEmail,
    promoEligible,
    promoLine,
    /** Total con promo, antes de Beatcoins. */
    total,
    requote,
  };
}
