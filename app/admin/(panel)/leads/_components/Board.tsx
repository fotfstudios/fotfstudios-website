import Link from "next/link";
import type { LeadListRow } from "@/src/domain/admin/leads-list";
import { LEAD_STAGES, STAGE_LABELS, type LeadStage } from "@/src/domain/outreach/pipeline";
import { StageSelect } from "./StageSelect";
import { NurturePill } from "./NurturePill";

/**
 * Tablero kanban: una columna por etapa, tarjetas agrupadas. Mover = el <select> de la tarjeta
 * (accesible por teclado y lector de pantalla). Scroll horizontal en pantallas chicas.
 */
export function Board({ rows }: { rows: LeadListRow[] }) {
  const byStage = new Map<LeadStage, LeadListRow[]>();
  for (const s of LEAD_STAGES) byStage.set(s, []);
  for (const r of rows) byStage.get(r.stage)?.push(r);

  return (
    <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
      {LEAD_STAGES.map((stage) => {
        const items = byStage.get(stage) ?? [];
        return (
          <section key={stage} className="flex w-72 shrink-0 flex-col gap-3" aria-label={STAGE_LABELS[stage]}>
            <header className="flex items-center justify-between border-b hairline pb-2">
              <h2 className="label text-bone">{STAGE_LABELS[stage]}</h2>
              <span className="label-sm text-bone-quiet">{items.length}</span>
            </header>
            {items.length === 0 ? (
              <p className="label-sm px-1 text-bone-quiet">—</p>
            ) : (
              items.map((r) => (
                <article key={r.id} className="flex flex-col gap-2 border hairline bg-ink/40 p-3">
                  <Link
                    href={`/admin/leads/${r.id}`}
                    className="text-sm text-gold transition-colors hover:text-gold-deep"
                  >
                    {r.name ?? r.email}
                  </Link>
                  {r.name && <p className="label-sm text-bone-quiet">{r.email}</p>}
                  <p className="label-sm text-bone-dim">{r.source ?? "—"}</p>
                  <NurturePill lead={r} />
                  <div className="mt-1">
                    <StageSelect email={r.email} stage={r.stage} />
                  </div>
                </article>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
