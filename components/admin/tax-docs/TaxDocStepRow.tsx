import { CopyButton } from "@/components/admin/ui/CopyButton";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import type { TaxDocStep } from "@/src/domain/tax/tax-doc-steps";
import { BlockedFolioControl, FolioForm, type RecordFolioAction } from "./FolioForm";
import { stepDetail, stepMeta, stepTitle } from "./step-copy";

export type { RecordFolioAction } from "./FolioForm";

/**
 * Un paso SII en la ficha: qué emitir, por cuánto, qué referencia lleva, y el folio
 * de vuelta. La app no emite nada — el botón dice "Registrar folio" porque eso es lo
 * único que hace. `bloqueada` pinta el control deshabilitado (se VE deshabilitado,
 * ver inputCls), pero el guard real está en TaxDocService.
 */
export function TaxDocStepRow({
  step,
  action,
  backPath,
  canRecord,
}: {
  step: TaxDocStep;
  action: RecordFolioAction;
  backPath: string;
  canRecord: boolean;
}) {
  const detail = stepDetail(step);
  const showForm = canRecord && step.state === "por_emitir";
  const showBlocked = step.state === "bloqueada";
  const showFix = canRecord && (step.state === "emitida" || (step.state === "anulada" && !!step.folio));

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-bone">{stepTitle(step)}</p>
          {detail && <p className="mt-0.5 text-sm text-bone-dim">{detail}</p>}
          <p className="label-sm mt-1 text-bone-quiet">{stepMeta(step)}</p>
          {step.note && <p className="mt-1.5 text-xs text-bone-dim">{step.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={step.state} />
          {step.atrasada && <StatusPill status="atrasada" />}
        </div>
      </div>

      {step.razonReferencia && step.state === "por_emitir" && (
        <p className="flex flex-wrap items-center gap-2 text-bone-quiet">
          <span className="label-sm">Razón de referencia:</span>
          <span className="font-mono text-xs normal-case tracking-normal text-bone-dim">{step.razonReferencia}</span>
          <CopyButton value={step.razonReferencia} label="Razón copiada" />
        </p>
      )}

      {showForm && <FolioForm docId={step.id} action={action} backPath={backPath} />}

      {showBlocked && <BlockedFolioControl />}

      {showFix && (
        <details>
          <summary className="cursor-pointer label-sm text-bone-quiet transition-colors hover:text-gold">Corregir folio</summary>
          <div className="mt-2">
            <FolioForm docId={step.id} action={action} backPath={backPath} mode="fix" defaultValue={step.folio} />
          </div>
        </details>
      )}
    </li>
  );
}
