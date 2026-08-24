import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { Field, Select } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { formatCLP } from "@/src/domain/money/money";
import { markCoursePaidAction } from "../../../actions";

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
};

/**
 * Cobro de la inscripción. Por ahora solo offline (efectivo/transferencia): el
 * link de Mercado Pago llega en el PR siguiente y converge en el MISMO RPC, así
 * que registrar un pago acá después de mandar un link no puede duplicar boleta.
 */
export function CobroCurso({
  enrollmentId,
  status,
  totalClp,
  paidMethod,
  paidAt,
}: {
  enrollmentId: string;
  status: string;
  totalClp: number;
  paidMethod: string | null;
  paidAt: string | null;
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
    </Card>
  );
}
