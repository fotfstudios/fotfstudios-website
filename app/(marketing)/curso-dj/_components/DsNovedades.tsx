import Link from "next/link";
import { dsButtonClass } from "../_ds/Button";
import DsSectionHead from "./DsSectionHead";

/**
 * "Sigue aprendiendo". Por ahora enlaza al blog y a las guías; el formulario de
 * suscripción real llega con su tabla y su endpoint (PR del newsletter).
 */
export default function DsNovedades() {
  return (
    <section id="novedades" aria-labelledby="novedades-h" className="border-t border-[var(--border-subtle)]">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-5 py-18">
        <DsSectionHead id="novedades-h" eyebrow="Guías y blog" title="Sigue aprendiendo">
          <p className="m-0 text-[17px] leading-relaxed text-pretty text-[var(--grey-200)]">
            Guías gratis y artículos para practicar entre clases: estructura de un track, beatmatching,
            cómo preparar tu USB.
          </p>
        </DsSectionHead>
        <div className="flex flex-wrap gap-3">
          <Link href="/guia-dj" className={dsButtonClass({ variant: "secondary", size: "lg" })}>
            Guía DJ gratis
          </Link>
          <Link href="/blog" className={dsButtonClass({ variant: "ghost", size: "lg" })}>
            Ir al blog →
          </Link>
        </div>
      </div>
    </section>
  );
}
