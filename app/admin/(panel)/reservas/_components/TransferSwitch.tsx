import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { setTransferEnabledAction } from "../_actions/transfer";

/**
 * Respaldo del checkout: transferencia bancaria en /reservar, para cuando Mercado Pago falla.
 * Apagada por defecto. Las reservas que entran por acá se confirman con Cobro →
 * Transferencia en la ficha (el cliente avisa "Ya transferí" y llega un correo).
 */
export function TransferSwitch({ enabled }: { enabled: boolean }) {
  return (
    <Card title="Pago por transferencia en el sitio">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex max-w-xl flex-col gap-1.5">
          <span className={`label-sm ${enabled ? "text-gold" : "text-bone-quiet"}`}>{enabled ? "Activada" : "Desactivada"}</span>
          <p className="text-sm leading-relaxed text-bone-quiet">
            Respaldo para cuando Mercado Pago falla. Activada, el cliente puede reservar y pagar por transferencia: el
            horario queda apartado 2 horas (o 48 h si avisa &quot;Ya transferí&quot;) y lo confirmas desde la reserva con
            Cobro → Transferencia.
          </p>
        </div>
        <ActionForm action={setTransferEnabledAction} success={enabled ? "Transferencia desactivada." : "Transferencia activada."}>
          <input type="hidden" name="on" value={enabled ? "false" : "true"} />
          <SubmitButton variant={enabled ? "secondary" : "primary"} pendingLabel="Guardando…">
            {enabled ? "Desactivar" : "Activar"}
          </SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}
