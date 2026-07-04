"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

/**
 * Línea de la hora actual sobre la columna de hoy. Única isla cliente del
 * calendario: en el server (y el primer render) devuelve null — sin mismatch de
 * hidratación — y luego se recalcula cada minuto con la hora de RELOJ local,
 * consistente con el eje. Si la columna deja de ser hoy (medianoche), desaparece.
 */
export function NowLine({
  date,
  tz,
  axisStart,
  axisEnd,
  hourPx,
}: {
  date: string;
  tz: string;
  axisStart: number;
  axisEnd: number;
  hourPx: number;
}) {
  const [minute, setMinute] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = DateTime.now().setZone(tz);
      setMinute(now.toISODate() === date ? now.hour * 60 + now.minute : null);
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [date, tz]);

  if (minute === null || minute < axisStart || minute > axisEnd) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-30"
      style={{ top: ((minute - axisStart) / 60) * hourPx }}
    >
      <div className="h-px bg-gold shadow-[0_0_6px_rgba(232,201,74,0.5)]" />
      <div className="absolute -top-[3px] left-0 size-[7px] rounded-full bg-gold" />
    </div>
  );
}
