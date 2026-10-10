import { DateTime } from "luxon";
import { formatPoints } from "@/src/domain/points/points";
import { beatcoinsExpiry } from "@/src/domain/points/expiry";

const TZ = "America/Santiago";

/**
 * La línea de vencimiento para la cuenta del cliente y la ficha del admin (mismo texto en
 * los dos lados). null = no hay nada que decir (sin saldo).
 *   · algo vence  → "500 vencen el 15 de marzo de 2028 · 1.000 no vencen. Cada reserva reinicia el plazo."
 *   · nada vence  → "No vencen"
 */
export function beatcoinsExpiryLine(v: { balance: number; protected: number; activityAt: string | null }): string | null {
  const e = beatcoinsExpiry(v);
  if (e.expiring === 0) return e.permanent > 0 ? "No vencen." : null;
  const on = DateTime.fromJSDate(e.expiresAt!).setZone(TZ).setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");
  const head = `${formatPoints(e.expiring)} vencen el ${on}`;
  const keep = e.permanent > 0 ? ` · ${formatPoints(e.permanent)} no vencen` : "";
  return `${head}${keep}. Cada reserva reinicia el plazo.`;
}
