import Link from "next/link";
import { articleHref } from "@/lib/articles/href";
import { LECTURAS } from "@/lib/curso-content";
import DsSectionHead from "./DsSectionHead";

/** "Sigue leyendo": enlaza el cluster de artículos que sostiene a esta página. */
export default function DsLecturas() {
  return (
    <section aria-labelledby="lecturas-h" className="border-t border-[var(--border-subtle)]">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-5 py-18">
        <DsSectionHead id="lecturas-h" eyebrow="Guías del curso" title="Para decidir con calma" />
        <ul className="m-0 flex list-none flex-col border-t border-[var(--border-strong)] p-0">
          {LECTURAS.map((l) => (
            <li key={l.href} className="border-b border-[var(--border-strong)]">
              <Link
                href={articleHref(l.href)}
                className="group flex min-h-[56px] items-center justify-between gap-4 py-3 text-[17px] hover:text-[var(--accent)]"
              >
                {l.label}
                <span aria-hidden="true" className="ds-mono text-[var(--accent)] transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
