import Link from "next/link";
import { recordTaxDocFolioAction } from "./actions";
import { fmtDateTime } from "@/components/admin/format";
import { SII_LINKS } from "@/components/admin/tax-docs/sii-links";
import { TaxDocStepRow } from "@/components/admin/tax-docs/TaxDocStepRow";
import { Card } from "@/components/admin/ui/Card";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon } from "@/components/admin/ui/icons";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { btn } from "@/components/admin/ui/styles";
import { adminRepository } from "@/src/composition";
import type { PendingTaxDocGroup } from "@/src/infrastructure/db/admin-repository";
import { describeTaxDocs } from "@/src/domain/tax/tax-doc-steps";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "SII — Admin", robots: { index: false } };

/** Cabecera del grupo: quién y qué, para ubicar el pedido sin abrir la ficha. */
function groupTitle(g: PendingTaxDocGroup): string {
  const c = g.context;
  if (c.kind === "reserva") return `${c.customerName ?? "Sin nombre"} · ${fmtDateTime(c.startsAt)}`;
  if (c.kind === "curso") return `Curso ${c.generationCode} · ${c.studentName}`;
  return c.customerName ?? "Pedido sin ficha";
}

function groupHref(g: PendingTaxDocGroup): string | null {
  const c = g.context;
  if (c.kind === "reserva") return `/admin/reservas/${c.reservationId}`;
  if (c.kind === "curso") return `/admin/curso/inscripciones/${c.enrollmentId}`;
  return null;
}

/**
 * La corrida del SII: todo lo pendiente, más antiguo primero, agrupado por pedido.
 * Los documentos ya emitidos del pedido entran al derivador (la NC bloqueada tiene
 * que poder nombrar a su boleta) pero no se pintan: acá solo lo que falta.
 */
export default async function SiiPage() {
  await requirePermission("reservations.boleta");
  const groups = await adminRepository().pendingTaxDocsQueue();
  const now = new Date().toISOString();
  const pending = groups
    .map((g) => ({ g, steps: describeTaxDocs(g.docs, { now }).filter((s) => s.state === "por_emitir" || s.state === "bloqueada") }))
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

      <div className="mt-8 flex flex-col gap-6">
        {pending.length === 0 ? (
          <EmptyState icon="doc" title="Nada por emitir" hint="Cuando entre un pago o salga un reembolso, su documento aparece acá." />
        ) : (
          pending.map(({ g, steps }) => {
            const href = groupHref(g);
            return (
              <Card
                key={g.orderId}
                title={groupTitle(g)}
                action={
                  href ? (
                    <Link href={href} className="label-sm -my-2 inline-block py-2 text-gold transition-colors hover:text-bone">
                      Ir a la ficha
                    </Link>
                  ) : undefined
                }
              >
                <ul className="flex flex-col divide-y divide-bone/10">
                  {steps.map((s) => (
                    <TaxDocStepRow key={s.id} step={s} action={recordTaxDocFolioAction} backPath="/admin/sii" canRecord />
                  ))}
                </ul>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
