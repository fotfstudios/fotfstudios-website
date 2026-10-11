"use client";

import { useCallback, useEffect, useState } from "react";
import type { RangeDay } from "@/src/application/availability/availability-service";
import { BOOKING_HORIZON_DAYS } from "@/src/domain/scheduling/booking-rules";
import { addDays } from "@/src/domain/scheduling/time";

/** Días por carga: la tira muestra 14 y "Ver más días" pide otros 14, hasta el horizonte. */
export const RANGE_PAGE = 14;

async function fetchRange(resourceId: string, from: string, days: number): Promise<RangeDay[]> {
  const res = await fetch(`/api/availability/range?resource=${resourceId}&from=${from}&days=${days}`);
  if (!res.ok) throw new Error(`availability ${res.status}`);
  return ((await res.json()) as { days: RangeDay[] }).days;
}

/**
 * Disponibilidad de la tira de días de /reservar (una consulta por página de 14 días;
 * el cliente deriva los inicios por duración con `day-starts.ts`).
 *
 * `reload()` vuelve a pedir lo ya cargado: tras un `slot_taken` el horario que se
 * tomó otro desaparece sin recargar la página.
 */
export function useAvailabilityRange(resourceId: string, today: string) {
  const [days, setDays] = useState<RangeDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchRange(resourceId, today, RANGE_PAGE)
      .then((d) => active && (setDays(d), setFailed(false)))
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [resourceId, today]);

  const canExtend = !failed && days.length > 0 && days.length < BOOKING_HORIZON_DAYS;

  const extend = useCallback(async () => {
    if (!canExtend || loading) return;
    setLoading(true);
    try {
      const more = await fetchRange(resourceId, addDays(today, days.length), RANGE_PAGE);
      setDays((d) => [...d, ...more]);
    } catch {
      // Sin red: el botón sigue ahí para reintentar.
    } finally {
      setLoading(false);
    }
  }, [canExtend, loading, resourceId, today, days.length]);

  const reload = useCallback(async () => {
    const total = Math.max(days.length, RANGE_PAGE);
    try {
      const pages: Promise<RangeDay[]>[] = [];
      for (let off = 0; off < total; off += 31) {
        pages.push(fetchRange(resourceId, addDays(today, off), Math.min(31, total - off)));
      }
      setDays((await Promise.all(pages)).flat());
    } catch {
      // Se queda con lo que había; el servidor igual rechaza un horario tomado.
    }
  }, [days.length, resourceId, today]);

  return { days, loading, failed, canExtend, extend, reload };
}
