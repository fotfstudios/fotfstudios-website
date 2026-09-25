import { HORAS_POR_SESION, PROGRAMA } from "@/lib/curso-content";

const STATS = [
  {
    big: `${PROGRAMA.sesiones} × ${HORAS_POR_SESION} H`,
    small: `sesiones de clase (${PROGRAMA.horasClase} horas en total)`,
  },
  { big: `${PROGRAMA.horasPractica} H`, small: "de práctica libre en la sala" },
  { big: "Set final", small: "grabado en audio y video" },
] as const;

export default function DsStats() {
  return (
    <section aria-label="El curso en números" className="border-y border-[var(--border-subtle)]">
      <dl className="mx-auto m-0 grid max-w-[1120px] grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {STATS.map((s) => (
          <div key={s.big} className="flex flex-col-reverse gap-1.5 border-b border-[var(--border-subtle)] px-5 py-7 md:border-b-0">
            <dt className="text-base text-[var(--text-secondary)]">{s.small}</dt>
            <dd className="ds-display m-0 text-[44px]">{s.big}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
