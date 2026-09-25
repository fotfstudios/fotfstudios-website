import { formatCLP } from "@/lib/pricing";
import { CURSO, INCLUYE, PRECIOS, PRECIOS_LISTA } from "@/lib/curso-content";
import DsSectionHead from "./DsSectionHead";

export default function DsPrecios() {
  return (
    <section id="precios" aria-labelledby="precios-h" className="border-t border-[var(--border-subtle)]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-7 px-5 py-18">
        <DsSectionHead id="precios-h" eyebrow={CURSO.lanzamiento} eyebrowClass="text-[var(--gold)]" title="Precios" />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-card)] p-6">
            <h3 className="m-0 text-[17px] font-medium">Individual</h3>
            <p className="ds-mono m-0 text-[40px] leading-tight font-bold">{formatCLP(PRECIOS.individual)}</p>
            <p className="m-0 text-sm text-[var(--text-muted)]">
              Curso completo · después {formatCLP(PRECIOS_LISTA.individual)}
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] p-6 text-[var(--text-inverse)]">
            <h3 className="m-0 text-[17px] font-medium">En dúo, con un amigo</h3>
            <p className="ds-mono m-0 text-[40px] leading-tight font-bold">{formatCLP(PRECIOS.duo)}</p>
            <p className="m-0 text-sm font-medium">
              por persona · después {formatCLP(PRECIOS_LISTA.duo)}
            </p>
          </div>
        </div>

        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] text-[var(--text-secondary)]">
          {INCLUYE.map((i) => (
            <li key={i} className="flex items-baseline gap-3">
              <span aria-hidden="true" className="h-[5px] w-[5px] shrink-0 translate-y-[-2px] rounded-[1px] bg-[var(--accent)]" />
              {i}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-6 py-[22px]">
          <div className="flex flex-[1_1_260px] flex-col gap-1">
            <h3 className="m-0 text-lg font-medium">¿Quieres probar primero? Sesión de prueba · 1 h</h3>
            <p className="m-0 text-sm leading-snug text-[var(--text-secondary)]">
              Se descuenta completa del curso si te inscribes dentro de 7 días.
            </p>
          </div>
          <p className="ds-mono m-0 text-[30px] font-bold text-[var(--gold)]">{formatCLP(PRECIOS.prueba)}</p>
        </div>
      </div>
    </section>
  );
}
