import { recordTaxDocFolioAction } from "./actions";
import { QueueTable } from "./_components/QueueTable";
import { SII_LINKS } from "@/components/admin/tax-docs/sii-links";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon } from "@/components/admin/ui/icons";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { btn } from "@/components/admin/ui/styles";
import { adminRepository } from "@/src/composition";
import { describeTaxDocs } from "@/src/domain/tax/tax-doc-steps";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "SII — Admin", robots: { index: false } };

/**
 * La corrida del SII: todo lo pendiente, más antiguo primero, una fila por documento
 * con el pedido abarcando sus filas. Los documentos ya emitidos del pedido entran al
 * derivador (la NC bloqueada tiene que poder nombrar a su boleta) pero no se pintan:
 * acá solo lo que falta.
 */
export default async function SiiPage() {
  await requirePermission("reservations.boleta");
  const groups = await adminRepository().pendingTaxDocsQueue();
  const now = new Date().toISOString();
  const pending = groups
    .map((group) => ({ group, steps: describeTaxDocs(group.docs, { now }).filter((s) => s.state === "por_emitir" || s.state === "bloqueada") }))
    .filter((x) => x.steps.length > 0);
  const total = pending.reduce((n, x) => n + x.steps.length, 0);

  return (
    <>
      <PageHeader
        kicker="Documentos tributarios"
        title="SII"
        action={
          <a href={SII_LINKS.eboleta} target="_blank" rel="noreferrer" className={btn("primary")}>
            <Icon name="external" size={16} /> Abrir e-Boleta
          </a>
        }
      />

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-bone-dim">
        {total === 0 ? "Nada por emitir." : `${total} ${total === 1 ? "documento" : "documentos"} por emitir.`} Cada pago genera su boleta; cada
        reembolso, una nota de crédito que anula la boleta (y, si queda saldo, una boleta nueva). Guías del SII:{" "}
        <a href={SII_LINKS.guiaEmitir} target="_blank" rel="noreferrer" className="text-gold hover:text-bone">emitir boleta</a>,{" "}
        <a href={SII_LINKS.guiaAnularSinFE} target="_blank" rel="noreferrer" className="text-gold hover:text-bone">anular (sin factura electrónica)</a>,{" "}
        <a href={SII_LINKS.guiaAnularConFE} target="_blank" rel="noreferrer" className="text-gold hover:text-bone">anular (con factura electrónica)</a>.
      </p>

      <div className="mt-8">
        {pending.length === 0 ? (
          <EmptyState icon="doc" title="Nada por emitir" hint="Cuando entre un pago o salga un reembolso, su documento aparece acá." />
        ) : (
          <QueueTable groups={pending} action={recordTaxDocFolioAction} backPath="/admin/sii" />
        )}
      </div>
    </>
  );
}
