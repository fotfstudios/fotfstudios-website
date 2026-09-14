/** Minutos del día → "HH:MM". */
export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export { tierLabel } from "@/src/domain/pricing/tier-labels";
