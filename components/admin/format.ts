import { DateTime } from "luxon";

/** Fecha/hora local (Chile) para tablas del admin. */
export const fmtDateTime = (iso: string): string =>
  DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es").toFormat("ccc d LLL · HH:mm");
