import type { Metadata } from "next";
import type { ComponentProps } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookingWidget from "@/components/booking/BookingWidget";
import { dsFonts } from "@/components/ds/fonts";
import "@/components/ds/ds.css";
import { beatcoinsExpiryLine } from "@/lib/beatcoins-expiry-copy";
import { accountEnabled } from "@/lib/flags";
import type { CustomerProfile } from "@/src/application/ports/customers";
import { bookingEnabled, customerService, db, pricingService } from "@/src/composition";
import { FIRST_BOOKING_PROMO } from "@/src/domain/pricing/first-booking-promo";
import { beatcoinsExpiry, expiresSoon } from "@/src/domain/points/expiry";
import { todayInTz } from "@/src/domain/scheduling/time";
import { updateBookingContactAction } from "./actions";
import { currentCustomer } from "@/src/infrastructure/auth/require-customer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservar",
  robots: { index: false }, // no indexar hasta el lanzamiento
};

/** Aviso en el widget solo si parte del saldo vence en ≤ 30 días: ahí sí conviene usarlos ya. */
function expiryNote(p: CustomerProfile): string | null {
  const v = { balance: p.pointsBalance, protected: p.pointsProtected, activityAt: p.pointsActivityAt };
  return expiresSoon(beatcoinsExpiry(v), new Date()) ? beatcoinsExpiryLine(v) : null;
}

export default async function ReservarPage() {
  if (!bookingEnabled()) notFound();

  const { data } = await db().from("resources").select("id, name").eq("active", true).limit(1).single();
  if (!data) notFound();

  const catalog = await pricingService().getCatalog(data.id);

  // Sesión de cliente (opcional): prefill de datos + puntos canjeables en el
  // widget. ensureCustomer otorga aquí también los retroactivos, para que un
  // primer login a mitad de reserva ya llegue con su saldo.
  let customer: ComponentProps<typeof BookingWidget>["customer"] = null;
  if (accountEnabled()) {
    const session = await currentCustomer();
    if (session) {
      // La ficha puede tener id ≠ session.userId (adoptada del directorio):
      // se usa el perfil que devuelve ensureCustomer, no una segunda consulta
      // por el id del usuario (devolvería null y el widget mostraría 0 pts).
      const ensured = await customerService().ensureCustomer(session.userId, session.email);
      if (ensured.kind === "ok") {
        customer = {
          email: ensured.profile.email ?? session.email,
          name: ensured.profile.name ?? "",
          phone: ensured.profile.phone ?? "",
          points: ensured.profile.pointsBalance,
          pointsExpiryNote: expiryNote(ensured.profile),
          // La casilla parte marcada salvo que el titular se haya dado de BAJA antes: una baja
          // explícita se respeta; "nunca eligió" no es una baja.
          whatsappOptIn: ensured.profile.whatsapp.optIn || ensured.profile.whatsapp.optOutAt === null,
        };
      }
      // Con email_conflict el widget sigue como invitado: un conflicto de
      // directorio no puede impedir que alguien reserve.
    }
  }

  return (
    // Design system de Claude Design (decisión del dueño: el mismo de /curso-dj), acotado a
    // este wrapper. /reserva/estado lo adopta en su propio PR.
    <div className={`fotf-ds ${dsFonts} min-h-screen`}>
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-10 pb-16 sm:px-10">
        <Link href="/" className="ds-mono text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]">
          ← FOTF Studios
        </Link>
        <header className="mt-8 mb-10 flex max-w-[640px] flex-col gap-3">
          <p className="ds-eyebrow text-[var(--accent)]">Reserva</p>
          <h1 className="ds-h2">{data.name}</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">
            Elige duración, día y hora. Pagas en línea y tu sesión queda reservada.
            {FIRST_BOOKING_PROMO.enabled && <> Tu primera reserva lleva −{FIRST_BOOKING_PROMO.pct}% en la sala.</>}
          </p>
        </header>
        <BookingWidget
          resourceId={data.id}
          today={todayInTz("America/Santiago")}
          tiers={catalog?.tiers ?? []}
          addons={catalog?.addons ?? []}
          volumeDiscounts={catalog?.volumeDiscounts ?? []}
          customer={customer}
          saveContact={updateBookingContactAction}
        />
      </main>
    </div>
  );
}
