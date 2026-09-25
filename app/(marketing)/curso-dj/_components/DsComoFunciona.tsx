import { PASOS } from "@/lib/curso-content";
import DsSectionHead from "./DsSectionHead";

export default function DsComoFunciona() {
  return (
    <section aria-labelledby="como-h" className="mx-auto flex max-w-[1120px] flex-col gap-8 px-5 py-18">
      <DsSectionHead id="como-h" eyebrow="Cómo funciona" title="Partes cuando quieras" />
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-7 p-0">
        {PASOS.map((p) => (
          <li key={p.n} className="flex flex-col gap-2.5 border-t-2 border-[var(--accent)] pt-[18px]">
            <span className="ds-mono text-[13px] text-[var(--text-muted)]">{p.n}</span>
            <h3 className="m-0 text-xl font-medium">{p.title}</h3>
            <p className="m-0 text-[15px] leading-normal text-pretty text-[var(--text-secondary)]">{p.line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
