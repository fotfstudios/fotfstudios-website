import { FIRST_BOOKING_PROMO } from "@/src/domain/pricing/first-booking-promo";

/** Nota de la promo de primera reserva bajo el desglose (la elegibilidad es por correo). */
export default function PromoNote({ promoEmail, promoEligible }: { promoEmail: string | null; promoEligible: boolean | null }) {
  if (!FIRST_BOOKING_PROMO.enabled) return null;
  if (!promoEmail) {
    return (
      <p className="text-xs text-[var(--gold)]">
        ¿Primera vez? −{FIRST_BOOKING_PROMO.pct}% en la sala al ingresar tu correo.
      </p>
    );
  }
  if (promoEligible === false) {
    return <p className="text-xs text-[var(--text-muted)]">El −{FIRST_BOOKING_PROMO.pct}% de primera reserva ya se usó con este correo.</p>;
  }
  return null;
}
