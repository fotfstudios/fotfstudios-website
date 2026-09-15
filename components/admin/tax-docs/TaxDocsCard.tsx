import { Card } from "@/components/admin/ui/Card";
import { Icon } from "@/components/admin/ui/icons";
import type { TaxDocStep } from "@/src/domain/tax/tax-doc-steps";
import { SII_LINKS } from "./sii-links";
import { type RecordFolioAction, TaxDocStepRow } from "./TaxDocStepRow";

/**
 * Card "Documentos tributarios" de una ficha (reserva o inscripción): los pasos SII
 * del pedido en orden cronológico. Sin documentos no se pinta (cortesía, 100 %
 * puntos, cancelación sin reembolso).
 */
export function TaxDocsCard({
  steps,
  action,
  backPath,
  canRecord,
  title = "Documentos tributarios",
}: {
  steps: TaxDocStep[];
  action: RecordFolioAction;
  backPath: string;
  canRecord: boolean;
  title?: string;
}) {
  if (steps.length === 0) return null;
  return (
    <Card title={title}>
      <ul className="flex flex-col divide-y divide-bone/10">
        {steps.map((s) => (
          <TaxDocStepRow key={s.id} step={s} action={action} backPath={backPath} canRecord={canRecord} />
        ))}
      </ul>
      <p className="mt-4 flex flex-wrap items-center gap-x-2 text-xs text-bone-quiet">
        Emítelos en
        <a href={SII_LINKS.eboleta} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold transition-colors hover:text-bone">
          e-Boleta SII <Icon name="external" size={12} />
        </a>
        y registra acá el folio que te asigna.
      </p>
    </Card>
  );
}
