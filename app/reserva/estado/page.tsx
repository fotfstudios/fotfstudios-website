import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EstadoClient from "@/components/booking/EstadoClient";
import { bookingEnabled } from "@/src/composition";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estado de tu reserva — FOTF Studios",
  robots: { index: false },
};

export default async function EstadoPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string }>;
}) {
  if (!bookingEnabled()) notFound();
  const { b } = await searchParams;
  if (!b) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-20 md:py-28">
      <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
        ← FOTF Studios
      </Link>
      <div className="mt-10">
        <EstadoClient orderId={b} />
      </div>
    </main>
  );
}
