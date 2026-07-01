import { DateTime } from "luxon";

/** Fecha/hora local (Chile) para tablas del admin. */
export const fmtDateTime = (iso: string): string =>
  DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es").toFormat("ccc d LLL · HH:mm");

/** Solo fecha (Chile) — para migas de pan y encabezados. */
export const fmtDate = (iso: string): string =>
  DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es").toFormat("ccc d LLL");
