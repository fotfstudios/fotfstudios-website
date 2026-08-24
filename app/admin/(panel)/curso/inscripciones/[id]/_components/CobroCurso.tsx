import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { Field, Select } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { formatCLP } from "@/src/domain/money/money";
import { markCoursePaidAction } from "../../../actions";
import { LinkDePago } from "./LinkDePago";

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
};

/**
 * Cobro de la inscripción: offline (efectivo/transferencia) o link de Mercado
 * Pago. Los dos caminos convergen en el MISMO RPC, así que registrar un pago a
 * mano después de haber mandado un link no puede duplicar la boleta.
 */
export function CobroCurso({
  enrollmentId,
  status,
  totalClp,
  paidMethod,
  paidAt,
  waDigits,
}: {
  enrollmentId: string;
  status: string;
  totalClp: number;
  paidMethod: string | null;
  paidAt: string | null;
  waDigits: string | null;
}) {
  if (status === "pagada") {
    return (
      <Card title="Cobro">
        <p className="font-display text-3xl text-gold">{formatCLP(totalClp)}</p>
        <p className="mt-2 label-sm text-bone-mute">
          Pagado{paidMethod ? ` por ${METHOD_LABEL[paidMethod] ?? paidMethod}` : ""}
          {paidAt ? ` · ${paidAt}` : ""}
        </p>
      </Card>
    );
  }

  if (status !== "reservada") {
    return (
      <Card title="Cobro">
        <p className="text-sm text-bone-mute">Sin cobro pendiente.</p>
      </Card>
    );
  }

  return (
    <Card title="Cobro pendiente">
      <p className="font-display text-3xl text-bone">{formatCLP(totalClp)}</p>
      <p className="mt-2 mb-5 label-sm text-bone-mute">Registra el pago cuando lo recibas.</p>
      <ActionForm action={markCoursePaidAction} success="Pago registrado." className="flex flex-col gap-4">
        <input type="hidden" name="enrollmentId" value={enrollmentId} />
        <Field label="Método">
          <Select name="method" defaultValue="transferencia">
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
          </Select>
        </Field>
        <div>
          <SubmitButton icon="check" pendingLabel="Registrando…">
            Marcar pagado
          </SubmitButton>
        </div>
      </ActionForm>

      <div className="mt-5 border-t hairline pt-5">
        <p className="label-sm mb-3 text-bone-mute">O que pague online</p>
        <LinkDePago enrollmentId={enrollmentId} waDigits={waDigits} />
      </div>
    </Card>
  );
}
