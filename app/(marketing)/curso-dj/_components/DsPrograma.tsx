import { HORAS_POR_SESION, PROGRAMA, SESIONES } from "@/lib/curso-content";
import DsSectionHead from "./DsSectionHead";

export default function DsPrograma() {
  return (
    <section id="programa" aria-labelledby="programa-h" className="mx-auto flex max-w-[1120px] flex-col gap-8 px-5 py-18">
      <DsSectionHead id="programa-h" eyebrow="Programa" title={`${PROGRAMA.sesiones} sesiones, una por semana`} />
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3 p-0">
        {SESIONES.map((s) => (
          <li
            key={s.n}
            className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[22px]"
          >
            <div className="ds-mono flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-[var(--accent)]">{s.n}</span>
              <span className="text-[var(--text-muted)]">{HORAS_POR_SESION} h</span>
            </div>
            <h3 className="m-0 text-xl leading-tight font-medium">{s.title}</h3>
            <p className="m-0 text-[15px] leading-normal text-pretty text-[var(--text-secondary)]">{s.line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
