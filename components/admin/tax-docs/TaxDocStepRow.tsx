import type { ActionResult } from "@/components/admin/ui/action";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { Input } from "@/components/admin/ui/Field";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { btn } from "@/components/admin/ui/styles";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import type { TaxDocStep } from "@/src/domain/tax/tax-doc-steps";
import { stepDetail, stepMeta, stepTitle } from "./step-copy";

export type RecordFolioAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Un paso SII: qué emitir, por cuánto, qué referencia lleva, y el folio de vuelta.
 * La app no emite nada — el botón dice "Registrar folio" porque eso es lo único que
 * hace. `bloqueada` pinta el control deshabilitado (se VE deshabilitado, ver inputCls),
 * pero el guard real está en TaxDocService.
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
        <p className="flex flex-wrap items-center gap-2 label-sm text-bone-quiet">
          Razón de referencia:
          <span className="font-mono text-bone-dim">{step.razonReferencia}</span>
          <CopyButton value={step.razonReferencia} label="Razón copiada" />
        </p>
      )}

      {showForm && (
        <ActionForm action={action} success="Folio registrado.">
          <input type="hidden" name="docId" value={step.id} />
          <input type="hidden" name="backPath" value={backPath} />
          <div className="flex items-center gap-2">
            <Input name="folio" inputMode="numeric" pattern="[0-9]*" required aria-label="Folio SII" placeholder="N° folio" className="max-w-40" />
            <SubmitButton size="sm">Registrar folio</SubmitButton>
          </div>
        </ActionForm>
      )}

      {showBlocked && (
        <div className="flex items-center gap-2">
          <Input disabled aria-label="Folio SII (bloqueado)" placeholder="N° folio" className="max-w-40" />
          <button type="button" disabled className={btn("primary", "sm")}>
            Registrar folio
          </button>
        </div>
      )}

      {showFix && (
        <details className="group">
          <summary className="cursor-pointer label-sm text-bone-quiet transition-colors hover:text-gold">Corregir folio</summary>
          <ActionForm action={action} success="Folio corregido." className="mt-2">
            <input type="hidden" name="docId" value={step.id} />
            <input type="hidden" name="backPath" value={backPath} />
            <div className="flex items-center gap-2">
              <Input name="folio" inputMode="numeric" pattern="[0-9]*" required aria-label="Folio SII corregido" defaultValue={step.folio ?? ""} className="max-w-40" />
              <SubmitButton size="sm" variant="secondary">Guardar</SubmitButton>
            </div>
          </ActionForm>
        </details>
      )}
    </li>
  );
}
