import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { CLOSURE } from "@/lib/site";
import ApplicationForm from "./_components/ApplicationForm";

export const metadata: Metadata = {
  title: "Súmate al equipo",
  description:
    "Postula para hacer clases y sesiones guiadas 1:1 en FOTF Studios, Viña del Mar. Buscamos DJs que sepan pinchar y quieran enseñar.",
  alternates: { canonical: "/unete" },
};

export default function UnetePage() {
  return (
    <>
      <Nav />
      <main
        className={`mx-auto max-w-3xl px-6 pb-20 md:pb-28 ${
          CLOSURE.active ? "pt-40 md:pt-36" : "pt-20 md:pt-28"
        }`}
      >
        <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
          ← FOTF Studios
        </Link>

        <p className="label mt-10 text-gold">Clases & 1:1</p>
        <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
          Súmate al equipo
        </h1>
        <p className="font-editorial mt-4 max-w-xl text-xl text-bone-dim">
          Sabes pinchar. Pásale el pulso a alguien más.
        </p>

        <p className="mt-8 max-w-xl leading-relaxed text-bone-dim">
          Estamos armando el equipo de DJs que hace <strong className="text-bone">clases</strong> y{" "}
          <strong className="text-bone">sesiones guiadas 1:1</strong> en FOTF Studios, Viña del Mar. Si
          sabes pinchar y te gusta enseñar, queremos conocerte — no importa el estilo, importa el
          criterio y la paciencia. Cuéntanos qué te gustaría hacer, tu disponibilidad y tu experiencia.
          Revisamos cada postulación y te contactamos por WhatsApp.
        </p>

        <div className="mt-12">
          <ApplicationForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
