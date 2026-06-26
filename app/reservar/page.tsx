import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookingWidget from "@/components/booking/BookingWidget";
import { bookingEnabled, db } from "@/src/composition";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservar — FOTF Studios",
  robots: { index: false }, // no indexar hasta el lanzamiento
};

export default async function ReservarPage() {
  if (!bookingEnabled()) notFound();

  const { data } = await db().from("resources").select("id, name").eq("active", true).limit(1).single();
  if (!data) notFound();

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
        <BookingWidget resourceId={data.id} />
      </div>
    </main>
  );
}
