import { DateTime } from "luxon";

/** Fecha/hora local (Chile) para tablas del admin. */
export const fmtDateTime = (iso: string): string =>
  DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es").toFormat("ccc d LLL · HH:mm");

/** Solo fecha (Chile) — para migas de pan y encabezados. */
export const fmtDate = (iso: string): string =>
  DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es").toFormat("ccc d LLL");

/** Rango horario + duración (Chile): "19:00–21:00 · 2 h" ("1,5 h" si es fraccional). */
export const fmtTimeRange = (startIso: string, endIso: string): string => {
  const s = DateTime.fromISO(startIso).setZone("America/Santiago");
  const e = DateTime.fromISO(endIso).setZone("America/Santiago");
  const hours = e.diff(s, "hours").hours.toLocaleString("es-CL", { maximumFractionDigits: 1 });
  return `${s.toFormat("HH:mm")}–${e.toFormat("HH:mm")} · ${hours} h`;
};

/** Porcentaje es-CL: entero salvo bajo 10% (1 decimal). `pct` en escala 0-100. */
export const fmtPct = (pct: number): string =>
  `${pct.toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(pct) < 10 && pct !== 0 ? 1 : 0,
  })}%`;
