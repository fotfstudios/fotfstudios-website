import Link from "next/link";
import DsSectionHead from "./DsSectionHead";
import NewsletterForm from "./NewsletterForm";

/** "Sigue aprendiendo": suscripción real a los avisos de guías y posts nuevos. */
export default function DsNovedades() {
  return (
    <section id="novedades" aria-labelledby="novedades-h" className="border-t border-[var(--border-subtle)]">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-5 py-18">
        <DsSectionHead id="novedades-h" eyebrow="Guías y blog" title="Sigue aprendiendo">
          <p className="m-0 text-[17px] leading-relaxed text-pretty text-[var(--grey-200)]">
            Deja tu email y te avisamos cuando publiquemos una guía o un post nuevo. Mientras tanto,
            el{" "}
            <Link href="/blog" className="text-[var(--accent)] underline underline-offset-4 hover:text-[var(--accent-hover)]">
              blog
            </Link>{" "}
            y la{" "}
            <Link href="/guia-dj" className="text-[var(--accent)] underline underline-offset-4 hover:text-[var(--accent-hover)]">
              guía DJ gratis
            </Link>{" "}
            están abiertos.
          </p>
        </DsSectionHead>
        <NewsletterForm />
      </div>
    </section>
  );
}
