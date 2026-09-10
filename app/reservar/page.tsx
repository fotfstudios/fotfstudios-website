import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookingWidget from "@/components/booking/BookingWidget";
import { accountEnabled } from "@/lib/flags";
import { bookingEnabled, customerService, db, pricingService } from "@/src/composition";
import { currentCustomer } from "@/src/infrastructure/auth/require-customer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservar — FOTF Studios",
  robots: { index: false }, // no indexar hasta el lanzamiento
};

export default async function ReservarPage() {
  if (!bookingEnabled()) notFound();

  const { data } = await db().from("resources").select("id, name").eq("active", true).limit(1).single();
  if (!data) notFound();

  const catalog = await pricingService().getCatalog(data.id);

  // Sesión de cliente (opcional): prefill de datos + puntos canjeables en el
  // widget. ensureCustomer otorga aquí también los retroactivos, para que un
  // primer login a mitad de reserva ya llegue con su saldo.
  let customer: { email: string; name: string; phone: string; points: number } | null = null;
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
        };
      }
      // Con email_conflict el widget sigue como invitado: un conflicto de
      // directorio no puede impedir que alguien reserve.
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-20 md:py-28">
      <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
        ← FOTF Studios
      </Link>
      <p className="label mt-10 text-gold">Reserva</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.5rem,7vw,4.5rem)" }}>
        {data.name}
      </h1>
      <p className="font-editorial mt-4 max-w-xl text-xl text-bone-dim">
        Elige día, hora y duración. Pagas en línea y tu sesión queda reservada.
      </p>
      <div className="mt-12">
        <BookingWidget
          resourceId={data.id}
          addons={catalog?.addons ?? []}
          volumeDiscounts={catalog?.volumeDiscounts ?? []}
          customer={customer}
        />
      </div>
    </main>
  );
}
