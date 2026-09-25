import { FAQ } from "@/lib/curso-content";
import DsSectionHead from "./DsSectionHead";

/**
 * <details>/<summary> nativo: teclado y lector de pantalla gratis, funciona sin JS y
 * el texto queda en el HTML (el mismo FAQ alimenta el JSON-LD de page.tsx).
 */
export default function DsFaq() {
  return (
    <section aria-labelledby="faq-h" className="mx-auto flex max-w-[720px] flex-col gap-6 px-5 py-18">
      <DsSectionHead id="faq-h" eyebrow="Preguntas frecuentes" title="Antes de partir" />
      <div className="flex flex-col border-t border-[var(--border-strong)]">
        {FAQ.map((f, i) => (
          <details key={f.q} className="ds-faq border-b border-[var(--border-strong)]" open={i === 0}>
            <summary className="flex min-h-[60px] items-center justify-between gap-4 py-4 text-[17px] font-medium">
              <span>{f.q}</span>
              <span aria-hidden="true" className="ds-faq-sign ds-mono text-xl text-[var(--accent)]" />
            </summary>
            <p className="m-0 pb-5 text-[15px] leading-relaxed text-pretty text-[var(--text-secondary)]">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
